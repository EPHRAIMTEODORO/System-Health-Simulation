import { ServiceRegistry } from '../src/core/serviceRegistry';
import { LogManager } from '../src/core/logManager';
import { HealthEngine } from '../src/core/healthEngine';
import { Scheduler } from '../src/core/scheduler';
import { Service, ServiceStatus, ServiceType } from '../src/types';

const makeService = (overrides: Partial<Service> = {}): Service => ({
  name: 'Service',
  type: ServiceType.Infrastructure,
  status: ServiceStatus.Healthy,
  dependencies: [],
  lastChecked: '2020-01-01T00:00:00.000Z',
  errorCount: 0,
  description: '',
  ...overrides,
});

describe('Scheduler – deterministic mode', () => {
  let registry: ServiceRegistry;
  let logManager: LogManager;
  let engine: HealthEngine;
  let scheduler: Scheduler;

  beforeEach(() => {
    registry = new ServiceRegistry();
    logManager = new LogManager();
    engine = new HealthEngine(registry, logManager);
    scheduler = new Scheduler(registry, engine, logManager, 'deterministic');

    registry.register(makeService({ name: 'MySQL', type: ServiceType.Infrastructure }));
    registry.register(makeService({ name: 'Email', type: ServiceType.Infrastructure }));
    registry.register(
      makeService({ name: 'WebApp1', type: ServiceType.WebApp, dependencies: ['MySQL', 'Email'] }),
    );
    registry.register(
      makeService({ name: 'WebApp2', type: ServiceType.WebApp, dependencies: ['MySQL'] }),
    );
  });

  afterEach(() => {
    scheduler.stop();
  });

  it('should apply provided state transitions for infrastructure services', () => {
    const transitions = new Map([['MySQL', ServiceStatus.Unhealthy]]);
    scheduler.tick(transitions);
    expect(registry.get('MySQL')?.status).toBe(ServiceStatus.Unhealthy);
  });

  it('should trigger webapp health recomputation after transitions', () => {
    const transitions = new Map([['MySQL', ServiceStatus.Unhealthy]]);
    scheduler.tick(transitions);
    expect(registry.get('WebApp1')?.status).toBe(ServiceStatus.Unhealthy);
    expect(registry.get('WebApp2')?.status).toBe(ServiceStatus.Unhealthy);
  });

  it('should propagate Degraded to dependent webapps but not unrelated ones', () => {
    const transitions = new Map([['Email', ServiceStatus.Degraded]]);
    scheduler.tick(transitions);
    expect(registry.get('WebApp1')?.status).toBe(ServiceStatus.Degraded);
    expect(registry.get('WebApp2')?.status).toBe(ServiceStatus.Healthy);
  });

  it('should update lastChecked on infrastructure service change', () => {
    const before = registry.get('MySQL')!.lastChecked;
    const transitions = new Map([['MySQL', ServiceStatus.Unhealthy]]);
    scheduler.tick(transitions);
    const after = registry.get('MySQL')!.lastChecked;
    expect(after).not.toBe(before);
  });

  it('should not apply transitions to webapp services directly', () => {
    const transitions = new Map<string, ServiceStatus>([['WebApp1', ServiceStatus.Unhealthy]]);
    scheduler.tick(transitions);
    // Deps are all Healthy, so WebApp1 must remain Healthy after recompute
    expect(registry.get('WebApp1')?.status).toBe(ServiceStatus.Healthy);
  });

  it('should handle multiple infrastructure transitions in one tick', () => {
    const transitions = new Map([
      ['MySQL', ServiceStatus.Unhealthy],
      ['Email', ServiceStatus.Degraded],
    ]);
    scheduler.tick(transitions);
    expect(registry.get('MySQL')?.status).toBe(ServiceStatus.Unhealthy);
    expect(registry.get('Email')?.status).toBe(ServiceStatus.Degraded);
    // WebApp1 depends on both — worst case wins
    expect(registry.get('WebApp1')?.status).toBe(ServiceStatus.Unhealthy);
  });

  it('should recover webapps when infrastructure recovers', () => {
    const fail = new Map([['MySQL', ServiceStatus.Unhealthy]]);
    scheduler.tick(fail);
    expect(registry.get('WebApp1')?.status).toBe(ServiceStatus.Unhealthy);

    const recover = new Map([['MySQL', ServiceStatus.Healthy]]);
    scheduler.tick(recover);
    expect(registry.get('WebApp1')?.status).toBe(ServiceStatus.Healthy);
  });

  it('should not start a second timer if already started', () => {
    scheduler.start(10000);
    const timerBefore = (scheduler as unknown as { timer: NodeJS.Timeout | null }).timer;
    scheduler.start(10000);
    const timerAfter = (scheduler as unknown as { timer: NodeJS.Timeout | null }).timer;
    expect(timerBefore).toBe(timerAfter);
    scheduler.stop();
  });

  it('should clear the timer reference on stop', () => {
    scheduler.start(10000);
    scheduler.stop();
    expect((scheduler as unknown as { timer: NodeJS.Timeout | null }).timer).toBeNull();
  });
});
