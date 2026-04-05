import request from 'supertest';
import { ServiceRegistry } from '../src/core/serviceRegistry';
import { LogManager } from '../src/core/logManager';
import { HealthEngine } from '../src/core/healthEngine';
import { createApp } from '../src/app';
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

describe('API Endpoints', () => {
  let registry: ServiceRegistry;
  let logManager: LogManager;
  let engine: HealthEngine;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    registry = new ServiceRegistry();
    logManager = new LogManager();
    engine = new HealthEngine(registry, logManager);
    app = createApp(registry, logManager, engine);

    registry.register(makeService({ name: 'MySQL', type: ServiceType.Infrastructure }));
    registry.register(makeService({ name: 'Email', type: ServiceType.Infrastructure }));
    registry.register(
      makeService({
        name: 'WebApp1',
        type: ServiceType.WebApp,
        dependencies: ['MySQL', 'Email'],
      }),
    );
  });

  // ─── GET /health ─────────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('should return 200 with all services as an array', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(3);
    });

    it('should include enriched dependency info for webapps', async () => {
      const res = await request(app).get('/health');
      const webapp = res.body.find((s: { name: string }) => s.name === 'WebApp1');
      expect(webapp).toBeDefined();
      expect(webapp.dependencies).toBeDefined();
      expect(webapp.dependencies.MySQL).toBeDefined();
      expect(webapp.dependencies.MySQL.status).toBe('Healthy');
      expect(webapp.dependencies.Email).toBeDefined();
    });

    it('should include all required fields on each service', async () => {
      const res = await request(app).get('/health');
      const service = res.body[0];
      expect(service).toHaveProperty('name');
      expect(service).toHaveProperty('status');
      expect(service).toHaveProperty('lastChecked');
      expect(service).toHaveProperty('errorCount');
      expect(service).toHaveProperty('description');
      expect(service).toHaveProperty('dependencies');
    });

    it('infrastructure services should have an empty dependencies object', async () => {
      const res = await request(app).get('/health');
      const mysql = res.body.find((s: { name: string }) => s.name === 'MySQL');
      expect(mysql.dependencies).toEqual({});
    });
  });

  // ─── GET /health/:serviceName ─────────────────────────────────────────────

  describe('GET /health/:serviceName', () => {
    it('should return 200 with the requested service', async () => {
      const res = await request(app).get('/health/MySQL');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('MySQL');
    });

    it('should return 404 for an unknown service', async () => {
      const res = await request(app).get('/health/NonExistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });

    it('should return enriched dependency info for a webapp', async () => {
      const res = await request(app).get('/health/WebApp1');
      expect(res.status).toBe(200);
      expect(res.body.dependencies).toBeDefined();
      expect(res.body.dependencies.MySQL).toHaveProperty('status');
      expect(res.body.dependencies.Email).toHaveProperty('status');
    });
  });

  // ─── GET /logs/:serviceName ───────────────────────────────────────────────

  describe('GET /logs/:serviceName', () => {
    beforeEach(() => {
      logManager.addLog('MySQL', 'ERROR', 'Connection refused');
      logManager.addLog('MySQL', 'INFO', 'Connection restored');
      logManager.addLog('MySQL', 'WARN', 'Slow query detected');
    });

    it('should return 200 with all logs for the service', async () => {
      const res = await request(app).get('/logs/MySQL');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(3);
    });

    it('should include timestamp, level, and message on each log entry', async () => {
      const res = await request(app).get('/logs/MySQL');
      const entry = res.body[0];
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('level');
      expect(entry).toHaveProperty('message');
    });

    it('should filter logs by ?level=ERROR', async () => {
      const res = await request(app).get('/logs/MySQL?level=ERROR');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].level).toBe('ERROR');
    });

    it('should limit the number of logs returned with ?limit=2', async () => {
      const res = await request(app).get('/logs/MySQL?limit=2');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('should return an empty array for a service with no logs', async () => {
      const res = await request(app).get('/logs/WebApp1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should return 404 for an unknown service', async () => {
      const res = await request(app).get('/logs/NonExistent');
      expect(res.status).toBe(404);
    });

    it('should apply level filter before limit', async () => {
      // 3 logs total, 1 ERROR — limit=5 with level=ERROR should still return 1
      const res = await request(app).get('/logs/MySQL?level=ERROR&limit=5');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].level).toBe('ERROR');
    });
  });

  // ─── POST /simulate/:serviceName ─────────────────────────────────────────

  describe('POST /simulate/:serviceName', () => {
    it('should override infrastructure service status and return 200', async () => {
      const res = await request(app).post('/simulate/MySQL').send({ status: 'Unhealthy' });
      expect(res.status).toBe(200);
      expect(registry.get('MySQL')?.status).toBe(ServiceStatus.Unhealthy);
    });

    it('should propagate the simulated status change to dependent webapps', async () => {
      const res = await request(app).post('/simulate/MySQL').send({ status: 'Unhealthy' });
      expect(res.status).toBe(200);
      expect(registry.get('WebApp1')?.status).toBe(ServiceStatus.Unhealthy);
    });

    it('should return the updated service in the response body', async () => {
      const res = await request(app).post('/simulate/MySQL').send({ status: 'Degraded' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('MySQL');
      expect(res.body.status).toBe('Degraded');
    });

    it('should return 400 for an invalid status value', async () => {
      const res = await request(app).post('/simulate/MySQL').send({ status: 'Broken' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should return 400 when the status field is missing', async () => {
      const res = await request(app).post('/simulate/MySQL').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should return 404 for an unknown service', async () => {
      const res = await request(app).post('/simulate/NonExistent').send({ status: 'Unhealthy' });
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });

    it('should allow simulating a webapp status directly', async () => {
      const res = await request(app).post('/simulate/WebApp1').send({ status: 'Degraded' });
      expect(res.status).toBe(200);
      expect(registry.get('WebApp1')?.status).toBe(ServiceStatus.Degraded);
    });
  });
});
