export function notFound(req, res) { res.status(404).json({ error: 'Route not found' }); }
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err?.code === 11000) return res.status(409).json({ error: 'Duplicate value', fields: Object.keys(err.keyPattern || {}) });
  if (err?.name === 'ValidationError' || err?.name === 'CastError') return res.status(400).json({ error: 'Invalid request or identifier' });
  const status = Number(err.status || err.statusCode || 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message || 'Request failed' });
}
