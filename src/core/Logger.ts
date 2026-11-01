/**
 * Structured, levelled logger. Throttling + once-only support so per-frame
 * warnings cannot flood the console. Production default is `warn`.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

export type LogContext = Record<string, unknown>;
export type LogSink = (
  level: LogLevel,
  message: string,
  context: LogContext | undefined,
  namespace: string,
) => void;

const consoleSink: LogSink = (level, message, context, namespace) => {
  const prefix = namespace ? `[${namespace}]` : '';
  const fn =
    level === 'debug' ? console.debug
    : level === 'info' ? console.info
    : level === 'warn' ? console.warn
    : console.error;
  if (context !== undefined) fn(prefix, message, context);
  else fn(prefix, message);
};

export interface LoggerOptions {
  level?: LogLevel;
  namespace?: string;
  sink?: LogSink;
  now?: () => number;
  throttleMs?: number;
}

const DEFAULT_LEVEL: LogLevel = (import.meta as { env?: { DEV?: boolean } }).env?.DEV ? 'debug' : 'warn';

export class Logger {
  private _level: LogLevel;
  private readonly sink: LogSink;
  private readonly now: () => number;
  private readonly throttleMs: number;
  private readonly onceKeys = new Set<string>();
  private readonly throttleAt = new Map<string, number>();
  readonly namespace: string;

  constructor(options: LoggerOptions = {}) {
    this._level = options.level ?? DEFAULT_LEVEL;
    this.namespace = options.namespace ?? '';
    this.sink = options.sink ?? consoleSink;
    this.now = options.now ?? (() => Date.now());
    this.throttleMs = options.throttleMs ?? 2000;
  }

  get level(): LogLevel {
    return this._level;
  }

  setLevel(level: LogLevel): void {
    this._level = level;
  }

  child(namespace: string): Logger {
    return new Logger({
      level: this._level,
      namespace: this.namespace ? `${this.namespace}:${namespace}` : namespace,
      sink: this.sink,
      now: this.now,
      throttleMs: this.throttleMs,
    });
  }

  private enabled(level: LogLevel): boolean {
    return RANK[level] >= RANK[this._level] && this._level !== 'silent';
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.enabled(level)) return;
    try {
      this.sink(level, message, context, this.namespace);
    } catch {
      /* a broken sink must never break gameplay */
    }
  }

  debug(message: string, context?: LogContext): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.write('error', message, context);
  }

  /** Logs at most once per key for the lifetime of this logger. */
  warnOnce(key: string, message: string, context?: LogContext): void {
    if (this.onceKeys.has(key)) return;
    this.onceKeys.add(key);
    this.warn(message, context);
  }

  /** Logs at most once per key per throttle window. */
  warnThrottled(key: string, message: string, context?: LogContext): void {
    const at = this.throttleAt.get(key);
    const t = this.now();
    if (at !== undefined && t - at < this.throttleMs) return;
    this.throttleAt.set(key, t);
    this.warn(message, context);
  }

  resetThrottles(): void {
    this.onceKeys.clear();
    this.throttleAt.clear();
  }
}

export const createLogger = (namespace: string, level?: LogLevel): Logger =>
  new Logger({ namespace, level });