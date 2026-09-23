import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Transactional email. Sends real mail once SMTP_HOST / SMTP_USER / SMTP_PASS
 * are configured. In development without SMTP the message is written to the
 * server console instead, so flows like password reset stay testable.
 */

let transporter: Transporter | null = null;
if (env.smtp.host && env.smtp.user && env.smtp.pass) {
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
  });
  logger.info(`✉️  Email delivery via SMTP (${env.smtp.host})`);
}

export const mailer = {
  get isConfigured(): boolean {
    return transporter !== null;
  },

  async send(to: string, subject: string, text: string, html?: string): Promise<boolean> {
    if (!transporter) {
      if (!env.isProd) {
        logger.info(`[dev email] To: ${to} | ${subject}\n${text}`);
        return true;
      }
      logger.warn('Email not sent: SMTP is not configured.');
      return false;
    }
    try {
      await transporter.sendMail({ from: env.smtp.from, to, subject, text, html });
      return true;
    } catch (err) {
      logger.error('Email delivery failed', { error: String(err) });
      return false;
    }
  },
};
