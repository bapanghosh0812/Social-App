import { logger } from './logger.js';

export interface SentryBreadcrumb {
  category: string;
  message: string;
  level: 'info' | 'warning' | 'error';
  timestamp: string;
  data?: Record<string, any>;
}

class SentryTelemetryService {
  private dsn: string | null = process.env.SENTRY_DSN || null;
  private breadcrumbs: SentryBreadcrumb[] = [];

  init() {
    // Errors are captured as structured log entries. Forwarding them to a hosted
    // tracker needs the official SDK wired up with SENTRY_DSN.
    logger.info('Error capture: structured logs', {
      dsnConfigured: !!this.dsn,
      environment: process.env.NODE_ENV || 'development'
    });
  }

  addBreadcrumb(breadcrumb: Omit<SentryBreadcrumb, 'timestamp'>) {
    const item: SentryBreadcrumb = {
      ...breadcrumb,
      timestamp: new Date().toISOString()
    };
    this.breadcrumbs.push(item);
    if (this.breadcrumbs.length > 100) {
      this.breadcrumbs.shift();
    }
  }

  captureException(error: Error | unknown, context?: Record<string, any>) {
    const errorObject = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : { raw: String(error) };

    logger.error('🚨 [Sentry Captured Exception]', {
      error: errorObject,
      context,
      breadcrumbsCount: this.breadcrumbs.length
    });

    return `sentry_evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, any>) {
    logger.log(level, `[Sentry Telemetry]: ${message}`, { context });
  }
}

export const Sentry = new SentryTelemetryService();
