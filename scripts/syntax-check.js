import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const roots = ['src', 'tests', 'scripts'];
let failed = false;
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) await walk(path);
    else if (path.endsWith('.js') && path !== 'scripts/syntax-check.js') {
      const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
      if (result.status !== 0) { failed = true; console.error(result.stderr || result.stdout); }
      else console.log(`OK ${path}`);
    }
  }
}
for (const root of roots) await walk(root);
if (failed) process.exit(1);
console.log('JavaScript syntax checks passed.');
