import { ServiceRegistry } from '../src/core/serviceRegistry';
import { Service, ServiceStatus, ServiceType } from '../src/types';

const makeService = (overrides: Partial<Service> = {}): Service => ({
  name: 'TestService',
  type: ServiceType.Infrastructure,
  status: ServiceStatus.Healthy,
  dependencies: [],
  lastChecked: '2020-01-01T00:00:00.000Z',
  errorCount: 0,
  description: '',
  ...overrides,
});

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = new ServiceRegistry();
  });

  describe('register and retrieve', () => {
    it('should register a service and retrieve it by name', () => {
      const service = makeService({ name: 'MySQL' });
      registry.register(service);
      const retrieved = registry.get('MySQL');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('MySQL');
    });

    it('should return undefined for an unknown service', () => {
      expect(registry.get('NonExistent')).toBeUndefined();
    });

    it('should retrieve all registered services', () => {
      registry.register(makeService({ name: 'MySQL' }));
      registry.register(makeService({ name: 'Email' }));
      const all = registry.getAll();
      expect(all).toHaveLength(2);
      const names = all.map((s) => s.name);
      expect(names).toContain('MySQL');
      expect(names).toContain('Email');
    });

    it('should return a clone of the service to prevent external mutation', () => {
      registry.register(makeService({ name: 'MySQL' }));
      const retrieved = registry.get('MySQL')!;
      retrieved.status = ServiceStatus.Unhealthy;
      expect(registry.get('MySQL')?.status).toBe(ServiceStatus.Healthy);
    });

    it('should return false for has() on an unknown service', () => {
      expect(registry.has('Unknown')).toBe(false);
    });

    it('should return true for has() on a registered service', () => {
      registry.register(makeService({ name: 'MySQL' }));
      expect(registry.has('MySQL')).toBe(true);
    });

    it('should start with an empty registry', () => {
      expect(registry.getAll()).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should update specified fields of a registered service', () => {
      registry.register(makeService({ name: 'MySQL' }));
      registry.update('MySQL', { status: ServiceStatus.Unhealthy, errorCount: 1 });
      const updated = registry.get('MySQL')!;
      expect(updated.status).toBe(ServiceStatus.Unhealthy);
      expect(updated.errorCount).toBe(1);
    });

    it('should preserve unchanged fields when updating', () => {
      registry.register(makeService({ name: 'MySQL', errorCount: 5, type: ServiceType.Infrastructure }));
      registry.update('MySQL', { status: ServiceStatus.Degraded });
      const updated = registry.get('MySQL')!;
      expect(updated.errorCount).toBe(5);
      expect(updated.type).toBe(ServiceType.Infrastructure);
    });

    it('should throw an error when updating an unknown service', () => {
      expect(() => registry.update('NonExistent', { status: ServiceStatus.Healthy })).toThrow(
        "Service 'NonExistent' not found",
      );
    });

    it('should isolate registered clone from original object mutations', () => {
      const service = makeService({ name: 'MySQL' });
      registry.register(service);
      service.status = ServiceStatus.Unhealthy;
      expect(registry.get('MySQL')?.status).toBe(ServiceStatus.Healthy);
    });
  });

  describe('initialization defaults', () => {
    it('should register a service with all required fields intact', () => {
      const service = makeService({
        name: 'Email',
        type: ServiceType.Infrastructure,
        status: ServiceStatus.Healthy,
        dependencies: [],
        lastChecked: '2020-01-01T00:00:00.000Z',
        errorCount: 0,
        description: '',
      });
      registry.register(service);
      const retrieved = registry.get('Email')!;
      expect(retrieved).toMatchObject({
        name: 'Email',
        type: ServiceType.Infrastructure,
        status: ServiceStatus.Healthy,
        dependencies: [],
        errorCount: 0,
        description: '',
      });
      expect(retrieved.lastChecked).toBeDefined();
    });

    it('should support services with dependencies', () => {
      registry.register(makeService({ name: 'MySQL' }));
      registry.register(makeService({ name: 'Email' }));
      registry.register(
        makeService({
          name: 'WebApp1',
          type: ServiceType.WebApp,
          dependencies: ['MySQL', 'Email'],
        }),
      );
      expect(registry.get('WebApp1')?.dependencies).toEqual(['MySQL', 'Email']);
    });
  });
});
