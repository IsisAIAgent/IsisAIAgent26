// ============================================
// api/lib/logger.js — Logger estruturado
// ============================================
const LOG_LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
const CURRENT_LEVEL = process.env.LOG_LEVEL || 'INFO';

class Logger {
  constructor(context) {
    this.context = context;
  }

  _log(level, message, meta = {}) {
    const levelNum = LOG_LEVELS[level];
    const currentNum = LOG_LEVELS[CURRENT_LEVEL];
    if (levelNum > currentNum) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      ...meta
    };

    if (process.env.VERCEL_ENV === 'production') {
      console.log(JSON.stringify(logEntry));
    } else {
      console.log(`[${level}] [${this.context}] ${message}`, meta);
    }
  }

  error(message, meta) { this._log('ERROR', message, meta); }
  warn(message, meta)  { this._log('WARN',  message, meta); }
  info(message, meta)  { this._log('INFO',  message, meta); }
  debug(message, meta) { this._log('DEBUG', message, meta); }
}

export const createLogger = (context) => new Logger(context);
