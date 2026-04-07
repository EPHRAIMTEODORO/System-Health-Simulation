# System Health Simulation

A backend simulation of an enterprise monitoring dashboard. It models a live system of infrastructure services and dependent web applications, continuously mutating their health states and exposing a REST API for querying status, triggering faults, and streaming logs.

Built to serve as a realistic data source for frontend monitoring dashboards — no real infrastructure required.

---

## Purpose & Goal

The goal is to simulate the kind of dynamic, event-driven health data that a real operations dashboard would consume. Services degrade and recover on their own, cascading failures propagate through dependencies, and every state change is logged — giving a frontend something meaningful to visualize without needing a real backend fleet.

---

## Features

- **Automatic state simulation** — A scheduler ticks every 5 seconds, randomly mutating infrastructure service states (Healthy / Degraded / Unhealthy).
- **Dependency-aware health propagation** — Web applications derive their health from their infrastructure dependencies. If a dependency goes unhealthy, the webapp follows (worst-status-wins).
- **Force-fault injection** — POST to `/simulate/:serviceName` to manually override any service's status, useful for testing dashboard edge cases.
- **Per-service log history** — Every state transition emits a structured log entry (`INFO`, `WARN`, `ERROR`) stored in memory and queryable via the API.
- **Structured server logging** — Uses [pino](https://getpino.io) with colorized, timestamped output in dev mode so state changes are visible directly in the terminal.
- **CORS-ready** — Configurable `ALLOWED_ORIGIN` for connecting a hosted frontend (e.g. Netlify).
- **Docker support** — Multi-stage Dockerfile for a minimal production image.
- **Full test suite** — Jest + Supertest covering the API, health engine, scheduler, and service registry.

---

## Services

### Infrastructure (mutated by the scheduler)

| Service    |
|------------|
| Email      |
| MySQL      |
| PostgreSQL |
| Oracle     |

### Web Applications (derived from dependencies)

| App      | Depends On           |
|----------|----------------------|
| WebApp1  | MySQL, Email         |
| WebApp2  | MySQL, PostgreSQL    |
| WebApp3  | Email, Oracle        |
| WebApp4  | PostgreSQL           |
| WebApp5  | Oracle, MySQL        |

---

## API

| Method | Endpoint                  | Description                                         |
|--------|---------------------------|-----------------------------------------------------|
| GET    | `/health`                 | Returns the current status of all services          |
| GET    | `/health/:serviceName`    | Returns the status of a single service              |
| GET    | `/logs/:serviceName`      | Returns log entries for a service                   |
| POST   | `/simulate/:serviceName`  | Forces a service into a given status                |

### Query parameters for `GET /logs/:serviceName`

| Param   | Type             | Description                          |
|---------|------------------|--------------------------------------|
| `level` | `INFO\|WARN\|ERROR` | Filter logs by level              |
| `limit` | number           | Return only the most recent N entries |

### Body for `POST /simulate/:serviceName`

```json
{ "status": "Unhealthy" }
```

Valid values: `Healthy`, `Degraded`, `Unhealthy`

---

## Running Locally

**1. Install dependencies**
```bash
npm install
```

**2. Configure environment**
```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3000
ALLOWED_ORIGIN=*   # or your frontend URL
```

**3. Start dev server**
```bash
npm run dev
```

The server starts at `http://localhost:3000` and logs state changes to the terminal as they happen.

**4. Run tests**
```bash
npm test
```

---

## Running with Docker

```bash
docker build -t system-health-simulation .
docker run -p 3000:3000 system-health-simulation
```

---

## Tech Stack

- **Runtime** — Node.js 20, TypeScript
- **Framework** — Express
- **Logging** — pino + pino-pretty
- **Testing** — Jest, Supertest
- **Container** — Docker (multi-stage, Alpine)
