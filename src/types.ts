export enum ServiceStatus {
  Healthy = 'Healthy',
  Degraded = 'Degraded',
  Unhealthy = 'Unhealthy',
}

export enum ServiceType {
  Infrastructure = 'infrastructure',
  WebApp = 'webapp',
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface Service {
  name: string;
  type: ServiceType;
  status: ServiceStatus;
  dependencies: string[];
  lastChecked: string;
  errorCount: number;
  description: string;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}
