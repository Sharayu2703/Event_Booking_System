import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter;
function getTransporter() {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) throw new Error('SMTP is not configured; set SMTP_HOST, SMTP_USER and SMTP_PASS to send real emails');
  if (!transporter) transporter = nodemailer.createTransport({ host: env.smtpHost, port: env.smtpPort, secure: env.smtpSecure,
    auth: { user: env.smtpUser, pass: env.smtpPass }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 });
  return transporter;
}
export async function sendEmail({ to, subject, text, html }) {
  return getTransporter().sendMail({ from: env.mailFrom, to, subject, text, html });
}
export function emailConfigured() { return Boolean(env.smtpHost && env.smtpUser && env.smtpPass); }
