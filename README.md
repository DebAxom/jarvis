# J.A.R.V.I.S.

**Justified Analysis, Reasoning & Visualization of Incident Systems**

An AI-powered observability and incident investigation platform that monitors applications, detects anomalies, correlates events, identifies potential root causes, and recommends remediation.

---

## 1. Project Overview

J.A.R.V.I.S. is an intelligent application monitoring and incident investigation platform.

Developers integrate a lightweight TypeScript SDK into their applications. The SDK collects and sends application events and metric snapshots to the J.A.R.V.I.S. backend.

The platform analyzes this telemetry to:

- Detect unusual application behavior.
- Identify performance degradation.
- Detect spikes in errors and failed requests.
- Correlate events across different services.
- Identify potentially affected services and endpoints.
- Investigate incidents and determine probable root causes.
- Recommend possible solutions.
- Visualize application health through a dashboard.

The primary objective is to go beyond traditional monitoring dashboards. J.A.R.V.I.S. should not merely tell developers that something went wrong; it should help them understand **what happened, why it happened, what was affected, and how to fix it.**

## 2. Technology Stack

| Component | Technology |
|---|---|
| Backend API | Fastify |
| Runtime | Bun |
| Language | TypeScript |
| Database | PostgreSQL |
| Database hosting | Neon |
| Frontend | Dashboard application |
| Client SDK | TypeScript |
| AI investigation | LLM-based analysis |

### Development constraints

- Do not introduce an ORM.
- Do not introduce Zod.
- Use regular SQL queries.
- Use `@fastify/postgres` for PostgreSQL access inside Fastify.
- Use the regular `pg` package for standalone database scripts.
- Prefer straightforward implementations over unnecessary abstractions.
- Keep the architecture practical for a hackathon MVP.

## 3. Architecture

The platform consists of four major components.

### A. J.A.R.V.I.S. SDK

A TypeScript SDK integrated into monitored applications.

Its responsibilities include:

- Collecting application events.
- Collecting metric snapshots.
- Attaching timestamps to events.
- Supporting trace IDs.
- Buffering telemetry before transmission.
- Sending batches to the J.A.R.V.I.S. API.

Example usage:

```ts
import JARVIS from "./jarvis";

const jarvis = new JARVIS(
    "YOUR_API_KEY",
    "todo"
);

jarvis.pushEvent({
    service: "auth",
    category: "error",
    msg: "Failed to authenticate user",
    endpoint: "/api/login",
    metadata: {
        reason: "Invalid database connection"
    }
});

jarvis.pushMetrics({
    service: "auth",
    metrics: {
        requests_total: 500,
        failed_requests: 20,
        avg_latency_ms: 120
    }
});

await jarvis.send();
```

The SDK uses the following headers:

```http
x-api-key: YOUR_API_KEY
x-app-id: todo
```

### B. Ingestion API

The Fastify backend exposes two primary ingestion endpoints:

```http
POST /api/events
POST /api/metrics
```

These endpoints authenticate applications, validate incoming telemetry, and persist it in PostgreSQL.

The ingestion layer should remain lightweight. It should not perform expensive anomaly detection or AI investigations synchronously.

#### Event payload

```json
{
  "events": [
    {
      "timestamp": "2026-11-09T10:00:00.000Z",
      "service": "auth",
      "category": "error",
      "msg": "Database connection failed",
      "endpoint": "/api/login",
      "trace_id": "trace-123",
      "metadata": {
        "database": "primary"
      }
    }
  ]
}
```

Supported event categories:

- `error`
- `business`
- `security`
- `system`

Event fields:

| Field | Description |
|---|---|
| timestamp | Time when the event occurred |
| service | Logical service label |
| category | Event category |
| msg | Event description |
| endpoint | Related API endpoint |
| trace_id | Request trace identifier |
| metadata | Additional structured information |

#### Metrics payload

```json
{
  "timestamp": "2026-11-09T10:00:00.000Z",
  "data": {
    "payments": {
      "requests_total": 500,
      "failed_requests": 20,
      "avg_latency_ms": 120
    },
    "auth": {
      "requests_total": 200,
      "failed_requests": 5,
      "avg_latency_ms": 45
    },
    "system": {
      "cpu_usage": 72.5,
      "memory_usage": 85.2
    }
  }
}
```

Metrics are represented as service names mapped to metric names and numeric values.

### C. Background Analysis Worker

The background worker is responsible for processing telemetry and identifying problems.

**Important architectural decision:** Do not perform anomaly detection every time a new event or metric is inserted.

Instead:

1. The ingestion API stores incoming telemetry.
2. A background worker periodically fetches unprocessed events and recent metric snapshots.
3. The worker analyzes the telemetry.
4. It detects anomalies.
5. It correlates related anomalies and events.
6. It creates or updates incidents.
7. It invokes AI-based investigation when necessary.

For the initial MVP, use a separate Bun process with a scheduled execution mechanism such as `setInterval`.

Prevent overlapping executions and track processing checkpoints to avoid repeatedly processing the same data.

A Redis-based job queue can be introduced later if required.

### D. Dashboard

The dashboard provides visibility into monitored applications and their incidents.

It should eventually display:

- Application health.
- Registered services.
- Latest metric snapshots.
- Historical metric graphs.
- Detected anomalies.
- Active incidents.
- Incident timelines.
- Probable root causes.
- Affected services and endpoints.
- AI-generated investigation reports.
- Recommended remediation steps.

---

## 4. Database Schema

The current PostgreSQL schema is:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appid VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password TEXT NOT NULL,
    api_key TEXT NOT NULL UNIQUE,
    services TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appid VARCHAR(255) NOT NULL
        REFERENCES apps(appid) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    service VARCHAR(255) NOT NULL,
    msg TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    endpoint TEXT,
    trace_id VARCHAR(255),
    metadata JSONB DEFAULT '{}'
);

CREATE TABLE metrics (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    appid VARCHAR(255) NOT NULL
        REFERENCES apps(appid) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_app_time
ON events (appid, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_events_service_time
ON events (appid, service, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_events_trace
ON events (appid, trace_id)
WHERE trace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_metrics_app_time
ON metrics (appid, timestamp DESC);
```

### Important database design decisions

**Applications**

Each monitored application has a unique `appid`, API key, and list of registered services.

**Services**

A service is a logical label, not necessarily a separately deployed microservice.

For example, a monolithic application might have:

```json
["auth", "payments", "notifications", "orders"]
```

These labels help organize telemetry and identify which parts of an application are affected.

There is no separate `services` or `components` table.

**Events**

Events are stored individually.

**Metrics**

Metrics are stored as JSONB snapshots. Each snapshot can contain measurements from multiple services.

---

## 5. Anomaly Detection

J.A.R.V.I.S. should initially use deterministic detection methods before relying on AI.

### A. Rule-based detection

Use configurable thresholds to identify obvious problems.

Examples:

| Metric | Example condition |
|---|---|
| CPU usage | Above 90% |
| Memory usage | Above 90% |
| Error rate | Above 5% |
| Average latency | Above 1000 ms |
| Failed requests | Sudden increase |

Avoid triggering incidents from a single noisy measurement. Use persistence windows, minimum sample counts, and cooldown periods where appropriate.

### B. Statistical anomaly detection

Compare current measurements against historical behavior.

Potential techniques:

- Moving averages.
- Standard deviation.
- Z-score.
- Exponential moving averages.
- Historical baselines.

For example, if a payment service normally responds in 100–150 ms but suddenly starts responding in 900 ms, the system should recognize this as an anomaly.

### C. Event correlation

Correlate events based on:

- Application ID.
- Service.
- Timestamp proximity.
- Trace ID.
- Endpoint.
- Error patterns.
- Related metric anomalies.

Example:

| Time | Service | Event |
|---|---|---|
| 10:00 | payments | Database connection timeout |
| 10:01 | payments | Payment request failed |
| 10:01 | orders | Order creation failed |
| 10:02 | notifications | Notification delivery failed |

These events may represent one underlying incident rather than four independent problems.

---

## 6. AI-Powered Root Cause Analysis

AI should be invoked when the deterministic analysis identifies a potentially meaningful incident.

Do not send every event to an LLM.

The investigation pipeline should:

1. Identify a suspected incident.
2. Collect related events.
3. Collect relevant metric snapshots.
4. Identify affected services and endpoints.
5. Analyze temporal relationships.
6. Prepare a structured evidence package.
7. Send the evidence to an LLM.
8. Generate a structured investigation report.

The AI should return:

- Incident summary.
- Probable root cause.
- Supporting evidence.
- Affected services.
- Potential impact.
- Severity.
- Recommended remediation.
- Confidence level.
- Alternative explanations, if applicable.

**Important:** The AI must distinguish between confirmed facts and hypotheses. It must not invent evidence or claim certainty without sufficient telemetry.

---

## 7. Incident Lifecycle

A proposed incident lifecycle:

```text
detected
   |
   v
investigating
   |
   v
identified
   |
   v
monitoring
   |
   v
resolved
```

A separate `false_positive` state should also be supported.

Incidents should be updated when additional telemetry arrives rather than creating duplicate incidents for every related anomaly.

---

## 8. Current API and Authentication Design

The ingestion API uses application-level authentication:

- `x-api-key`
- `x-app-id`

The API key is hashed using SHA-256 before database lookup.

Application passwords should be stored using salted password hashing, such as scrypt.

Dashboard authentication uses access-token verification through:

```ts
import { verifyAccessToken } from "../middlewares/auth";
```

The dashboard routes register authentication after the `/auth` plugin.

The dashboard metrics endpoint:

```http
GET /metrics
```

Retrieves the latest metrics snapshot for the authenticated application and combines it with the registered services.

Its response is structured as:

```json
{
  "success": true,
  "hasMetrics": true,
  "timestamp": "2026-11-09T10:00:00.000Z",
  "services": [
    {
      "name": "auth",
      "metrics": {
        "requests_total": 200,
        "failed_requests": 5,
        "avg_latency_ms": 45
      }
    },
    {
      "name": "payments",
      "metrics": null
    }
  ]
}
```

The current dashboard endpoint provides the latest state. Historical metric retrieval should be implemented separately.

---

## 9. Development Priorities

The project is being developed as a hackathon MVP. Prioritize working functionality over excessive complexity.

Suggested implementation order:

1. Complete application registration and authentication.
2. Complete event and metric ingestion.
3. Complete the TypeScript SDK.
4. Implement the background analysis worker.
5. Implement basic rule-based anomaly detection.
6. Implement event and metric correlation.
7. Implement incident creation and lifecycle management.
8. Integrate LLM-based root cause analysis.
9. Build dashboard visualizations.
10. Add historical metrics and incident timelines.

---

## 10. Guidelines for Gemini

You are acting as a senior backend engineer, systems architect, and AI/ML engineer helping develop J.A.R.V.I.S.

Follow these guidelines when assisting with this project:

1. Always understand the existing architecture before suggesting changes.
2. Preserve the existing database schema unless a change is genuinely necessary.
3. Do not introduce an ORM or Zod.
4. Use TypeScript and Bun for backend implementation.
5. Use Fastify for API routes.
6. Use PostgreSQL with direct SQL queries.
7. Prefer simple, maintainable implementations.
8. Avoid unnecessary abstractions and overengineering.
9. Provide complete, working code when asked to implement something.
10. Explain architectural trade-offs when suggesting major changes.
11. Do not assume that a service represents a separately deployed microservice.
12. Do not run expensive AI analysis for every incoming event.
13. Keep ingestion separate from background analysis.
14. Do not invent existing features or claim that unimplemented functionality already exists.
15. Clearly distinguish between current implementation, proposed architecture, and future improvements.

When modifying code, ensure compatibility with the existing API payloads and database columns.

If an implementation requires changing the schema, explicitly show the SQL migration and explain why it is necessary.

---

## 11. Project Philosophy

J.A.R.V.I.S. should be an intelligent incident investigation system, not just another logging platform.

The ideal experience is:

A developer opens the dashboard and sees that their application is experiencing problems. Instead of manually searching through thousands of logs, J.A.R.V.I.S. presents a correlated incident, identifies the likely underlying issue, shows supporting evidence, explains its impact, and recommends what the developer should do next.

**The goal: Turn raw application telemetry into actionable engineering intelligence.**