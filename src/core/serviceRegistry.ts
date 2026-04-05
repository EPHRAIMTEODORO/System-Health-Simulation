import { Service } from '../types';

export class ServiceRegistry {
  private readonly services: Map<string, Service> = new Map();

  register(service: Service): void {
    this.services.set(service.name, { ...service });
  }

  get(name: string): Service | undefined {
    const service = this.services.get(name);
    return service ? { ...service } : undefined;
  }

  getAll(): Service[] {
    return Array.from(this.services.values()).map((s) => ({ ...s }));
  }

  update(name: string, updates: Partial<Service>): void {
    const existing = this.services.get(name);
    if (!existing) {
      throw new Error(`Service '${name}' not found`);
    }
    this.services.set(name, { ...existing, ...updates });
  }

  has(name: string): boolean {
    return this.services.has(name);
  }
}
