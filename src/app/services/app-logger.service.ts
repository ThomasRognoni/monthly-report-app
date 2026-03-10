type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  context: string;
  message: string;
  timestamp: string;
  details?: string;
}

export class AppLoggerService {
  private readonly STORAGE_KEY = 'monthly-report-app-logs-v1';
  private readonly MAX_ENTRIES = 300;

  debug(context: string, message: string, error?: unknown): void {
    this.write('debug', context, message, error);
  }

  info(context: string, message: string, error?: unknown): void {
    this.write('info', context, message, error);
  }

  warn(context: string, message: string, error?: unknown): void {
    this.write('warn', context, message, error);
  }

  error(context: string, message: string, error?: unknown): void {
    this.write('error', context, message, error);
  }

  getLogs(): LogEntry[] {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as LogEntry[]) : [];
    } catch {
      return [];
    }
  }

  clearLogs(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch {
      // no-op
    }
  }

  private write(
    level: LogLevel,
    context: string,
    message: string,
    error?: unknown,
  ): void {
    const entry: LogEntry = {
      level,
      context: context || 'App',
      message: message || 'Evento',
      timestamp: new Date().toISOString(),
      details: this.normalizeError(error),
    };

    this.emitConsole(entry);
    this.persist(entry);
  }

  private emitConsole(entry: LogEntry): void {
    const text = `[${entry.context}] ${entry.message}`;
    switch (entry.level) {
      case 'debug':
        console.debug(text, entry.details || '');
        break;
      case 'info':
        console.info(text, entry.details || '');
        break;
      case 'warn':
        console.warn(text, entry.details || '');
        break;
      default:
        console.error(text, entry.details || '');
        break;
    }
  }

  private persist(entry: LogEntry): void {
    try {
      const prev = this.getLogs();
      const next = [entry, ...prev].slice(0, this.MAX_ENTRIES);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(next));
    } catch {
      // avoid recursive logging on storage issues
    }
  }

  private normalizeError(error: unknown): string | undefined {
    if (error == null) return undefined;
    if (error instanceof Error) {
      return error.stack || `${error.name}: ${error.message}`;
    }
    if (typeof error === 'string') return error;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
}
