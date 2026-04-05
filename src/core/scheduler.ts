import { ServiceStatus, ServiceType } from '../types';
import { ServiceRegistry } from './serviceRegistry';
import { HealthEngine } from './healthEngine';
import { LogManager } from './logManager';

export type StateTransitions = Map<string, ServiceStatus>;

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly registry: ServiceRegistry,
    private readonly healthEngine: HealthEngine,
    private readonly logManager: LogManager,
    private readonly mode: 'random' | 'deterministic' = 'random',
  ) {}

  start(intervalMs = 5000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Advance the simulation by one step.
   *
   * - In deterministic mode: apply the provided transitions map (only infrastructure services).
   * - In random mode: randomly mutate infrastructure service states.
   *
   * In both modes, all webapp health is recomputed afterwards.
   */
  tick(transitions?: StateTransitions): void {
    if (this.mode === 'deterministic' && transitions) {
      this.applyDeterministicTransitions(transitions);
    } else if (this.mode === 'random') {
      this.applyRandomTransitions();
    }
    this.healthEngine.recomputeAllWebApps();
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private applyDeterministicTransitions(transitions: StateTransitions): void {
    for (const [name, status] of transitions) {
      const service = this.registry.get(name);
      if (!service || service.type !== ServiceType.Infrastructure) continue;
      this.healthEngine.updateInfrastructureService(name, status);
    }
  }

  private applyRandomTransitions(): void {
    const statuses: ServiceStatus[] = [
      ServiceStatus.Healthy,
      ServiceStatus.Degraded,
      ServiceStatus.Unhealthy,
    ];
    const infraServices = this.registry.getAll().filter((s) => s.type === ServiceType.Infrastructure);

    for (const service of infraServices) {
      if (Math.random() < 0.3) {
        const newStatus = statuses[Math.floor(Math.random() * statuses.length)];
        this.healthEngine.updateInfrastructureService(service.name, newStatus);
      }
    }
  }
}
