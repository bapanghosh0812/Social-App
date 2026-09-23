import winston from 'winston';

const { combine, timestamp, printf, colorize, json } = winston.format;

const customFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaString = Object.keys(meta).length ? JSON.stringify(meta) : '';
  return `[${timestamp}] [${level}]: ${message} ${metaString}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    process.env.NODE_ENV === 'production' ? json() : combine(colorize(), customFormat)
  ),
  defaultMeta: { service: 'college-campus-api', env: process.env.NODE_ENV || 'development' },
  transports: [
    new winston.transports.Console(),
  ],
});
