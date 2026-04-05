import { LogEntry, LogLevel } from '../types';

export class LogManager {
  private readonly logs: Map<string, LogEntry[]> = new Map();
  private readonly maxEntries: number;

  constructor(maxEntries = 200) {
    this.maxEntries = maxEntries;
  }

  addLog(serviceName: string, level: LogLevel, message: string): void {
    if (!this.logs.has(serviceName)) {
      this.logs.set(serviceName, []);
    }
    const entries = this.logs.get(serviceName)!;
    entries.push({ timestamp: new Date().toISOString(), level, message });
    if (entries.length > this.maxEntries) {
      entries.shift();
    }
  }

  /**
   * Returns logs for a service, optionally filtered by level and capped by limit.
   * Filtering is applied first; limit selects the most recent N entries.
   */
  getLogs(serviceName: string, level?: string, limit?: number): LogEntry[] {
    const entries = this.logs.get(serviceName) ?? [];
    const filtered = level ? entries.filter((e) => e.level === level) : [...entries];
    if (limit !== undefined && limit > 0) {
      return filtered.slice(-limit);
    }
    return filtered;
  }

  hasServiceLogs(serviceName: string): boolean {
    return this.logs.has(serviceName);
  }
}
