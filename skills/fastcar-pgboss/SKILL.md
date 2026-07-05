---
name: fastcar-pgboss
description: FastCar pg-boss 队列与定时任务开发指南。Use when building, modifying, reviewing, or debugging @fastcar/pgboss integrations in FastCar applications, including queue configuration, PgBossManager APIs, PgBossWork/PgBossSchedule decorators, workers, schedules, retries, dead letters, multi-source PostgreSQL queue setup, health checks, publish/subscribe, and production job-processing behavior.
---

# FastCar pg-boss

`@fastcar/pgboss` is the FastCar lifecycle wrapper around `pg-boss@10.x`. Use it for durable PostgreSQL-backed queues, background workers, cron schedules, retries, dead letters, multi-process consumption, and multi-source queue configuration.

## Agent Rules

- Prefer `@fastcar/pgboss` when the task needs persistence, PostgreSQL-backed state, retries, distributed workers, schedule coordination, or job inspection.
- Treat this skill as FastCar-specific guidance for the `@fastcar/pgboss` wrapper; do not generalize its wrapper conventions to raw `pg-boss`, BullMQ, Temporal, or other queue systems.
- Do not confuse this with in-process timers. Use timer-style scheduling only for lightweight local work that does not need persistence or distributed coordination.
- Always include imports in examples. Do not make users infer whether a symbol comes from `@fastcar/pgboss` or `@fastcar/pgboss/annotation`.
- Treat payloads as JSON-serializable data. Do not place functions, DB connections, class instances, streams, or cyclic objects in payloads.
- Design handlers as idempotent and retry-safe. `pg-boss` coordinates job locking, but retries, timeouts, process crashes, and manual replay can still re-run business effects.
- Preserve falsy payloads. The wrapper intentionally supports `false`, `0`, `""`, and `null`; only `undefined` becomes `{}`.
- If a wrapped API is missing, use `boss.getBoss(source?)` as an escape hatch to the underlying pg-boss instance instead of reimplementing queue behavior.

## Package Requirements

Install in the business application:

```bash
npm install @fastcar/pgboss pg-boss
```

Compatibility:

- Node.js `>=20`
- PostgreSQL `>=13`
- `@fastcar/core >=0.3.20 <1`
- `pg-boss ^10.3.0`

## Enable Module

```ts
import { Application } from "@fastcar/core/annotation";
import { EnablePgBoss } from "@fastcar/pgboss/annotation";

@Application
@EnablePgBoss
class App {}

export default new App();
```

## Configuration

Use `settings.pgboss` in FastCar application config.

The connection strings below are local placeholders only. Production configuration must come from environment-specific config or secret management, not copied credentials.

Single source:

```yaml
settings:
  pgboss:
    connectionString: postgresql://user:password@127.0.0.1:5432/app
    schema: pgboss
    queues:
      - name: email.send
        options:
          retryLimit: 3
          retryDelay: 5
    schedules:
      - name: report.daily
        cron: "0 1 * * *"
        data:
          type: daily
        options:
          tz: Asia/Shanghai
```

Multiple sources:

```yaml
settings:
  pgboss:
    - source: default
      default: true
      connectionString: postgresql://user:password@127.0.0.1:5432/app
    - source: audit
      connectionString: postgresql://user:password@127.0.0.1:5432/audit
      schema: audit_pgboss
```

Rules:

- `source` is the wrapper-level source name used as the final optional method argument.
- `default: true` marks the default source. Only one source can be default.
- `queues` are created during application start.
- `schedules` create queues and register cron schedules during start.
- All fields except `source`, `default`, `queues`, and `schedules` pass through to pg-boss constructor options.

## Core Types

Common exported types from `@fastcar/pgboss`:

```ts
import type {
  PgBossManager,
  PgBossData,
  PgBossJob,
  PgBossJobWithMetadata,
  PgBossJobInsert,
  PgBossSendOptions,
  PgBossWorkOptions,
  PgBossScheduleOptions,
  PgBossQueueOptions,
  PgBossQueueResult,
  PgBossSourceStatus,
} from "@fastcar/pgboss";
```

Notes:

- `PgBossData` is `unknown` because the wrapper accepts JSON values, including scalar falsy values.
- `PgBossJob<T>` is the normal fetched/worker job type.
- `PgBossJobWithMetadata<T>` is returned when fetching with `{ includeMetadata: true }`.
- `PgBossQueueOptions`, `PgBossSendOptions`, `PgBossWorkOptions`, and `PgBossScheduleOptions` map to pg-boss option shapes.

## Send Jobs

```ts
import { Autowired, Service } from "@fastcar/core/annotation";
import { PgBossManager } from "@fastcar/pgboss";

@Service
class EmailService {
  @Autowired
  private boss!: PgBossManager;

  async sendEmail() {
    return await this.boss.send(
      "email.send",
      { to: "user@example.com", subject: "Welcome" },
      { retryLimit: 3 }
    );
  }

  async sendAuditLog() {
    return await this.boss.send("audit.log", { action: "login" }, undefined, "audit");
  }
}
```

Common send variants:

```ts
await boss.send("image.resize", { id: "img_1" });
await boss.sendAfter("image.resize", { id: "img_1" }, {}, 60);
await boss.sendThrottled("sms.send", { phone: "13800000000" }, {}, 30, "user:1");
await boss.sendDebounced("search.reindex", { id: 1 }, {}, 10, "product:1");

await boss.send("feature.flag", false);
await boss.send("counter.rebuild", 0);
await boss.send("cache.invalidate", null);
```

## Decorator Workers

Single-job style handler:

```ts
import { Service } from "@fastcar/core/annotation";
import { PgBossJob } from "@fastcar/pgboss";
import { PgBossWork } from "@fastcar/pgboss/annotation";

@Service
class EmailWorker {
  @PgBossWork("email.send", { batchSize: 5 })
  async handle(job: PgBossJob<{ to: string; subject: string }>) {
    console.log("send email", job.data.to, job.data.subject);
  }
}
```

Batch handler:

```ts
import { Service } from "@fastcar/core/annotation";
import { PgBossJob } from "@fastcar/pgboss";
import { PgBossWork } from "@fastcar/pgboss/annotation";

@Service
class BatchEmailWorker {
  @PgBossWork("email.send", { batchSize: 20, batch: true })
  async handle(jobs: PgBossJob<{ to: string }>[]) {
    for (const job of jobs) {
      console.log("batch email", job.data.to);
    }
  }
}
```

Multi-source worker:

```ts
@PgBossWork("audit.log", { source: "audit", batchSize: 10 })
async handleAudit(job: PgBossJob<{ action: string }>) {
  console.log(job.data.action);
}
```

Handler guidance:

- Let unexpected failures throw so pg-boss can fail/retry the job.
- Do not swallow errors unless the job is truly complete from the business perspective.
- Use business idempotency keys for payments, notifications, external API writes, and file processing.
- Keep batch sizes bounded and limit external request concurrency inside batches.

## Decorator Schedules

```ts
import { Service } from "@fastcar/core/annotation";
import { PgBossJob } from "@fastcar/pgboss";
import { PgBossSchedule } from "@fastcar/pgboss/annotation";

@Service
class ReportWorker {
  @PgBossSchedule("report.daily", "0 1 * * *", {
    data: { type: "daily" },
    tz: "Asia/Shanghai",
  })
  async handle(job: PgBossJob<{ type: string }>) {
    console.log("daily report", job.data.type);
  }
}
```

Schedule notes:

- The decorator creates the queue, registers the schedule, and registers a worker on application start.
- Multiple app instances can start together; pg-boss coordinates schedule emission in PostgreSQL.
- Avoid additional app-level duplicate `send()` calls for the same scheduled work.

## Manual Schedules

Use manual APIs for admin panels, tenant-specific schedules, or runtime schedule changes.

```ts
import { Autowired, Service } from "@fastcar/core/annotation";
import { PgBossManager } from "@fastcar/pgboss";

@Service
class ScheduleAdminService {
  @Autowired
  private boss!: PgBossManager;

  async createDailyReportSchedule() {
    await this.boss.registerSchedule(
      "report.daily",
      "0 1 * * *",
      { type: "daily" },
      { tz: "Asia/Shanghai" }
    );
  }

  async runDailyReportNow() {
    await this.boss.triggerSchedule("report.daily", { type: "manual" });
  }

  async stopDailyReportSchedule() {
    await this.boss.cancelSchedule("report.daily");
  }
}
```

Multi-source manual schedule:

```ts
await boss.registerSchedule("audit.daily", "0 2 * * *", { type: "audit" }, undefined, "audit");
await boss.triggerSchedule("audit.daily", { type: "manual" }, undefined, "audit");
await boss.cancelSchedule("audit.daily", "audit");
```

## Manual Workers

Use dynamic workers when consumers are registered by tenant, queue, feature flag, or admin command.

```ts
let workerId = await boss.registerWorker(
  "email.send",
  async (jobs) => {
    for (const job of Array.isArray(jobs) ? jobs : [jobs]) {
      console.log("send email", job.data);
    }
  },
  { batchSize: 10 }
);

boss.notifyWorker(workerId!);
await boss.stopWorker(workerId!);
```

Worker management by source:

```ts
let ids = boss.getWorkerIds("audit");
boss.notifyWorkers("audit");
await boss.stopWorkers("audit");
```

## Fetch, Complete, Fail, Query

Manual fetch is useful for custom pull loops or admin tooling. Decorator workers usually do not need explicit `complete()` or `fail()`.

```ts
let jobs = await boss.fetch<{ id: string }>("image.resize", { batchSize: 10 });

for (const job of jobs) {
  try {
    await resizeImage(job.data.id);
    await boss.complete("image.resize", job.id);
  } catch (error) {
    await boss.fail("image.resize", job.id, { message: String(error) });
  }
}

let job = await boss.getJobById("image.resize", "job-id", { includeArchive: true });
```

Fetch with metadata:

```ts
let jobs = await boss.fetch<{ id: string }>("image.resize", {
  batchSize: 10,
  includeMetadata: true,
});

for (const job of jobs) {
  console.log(job.state, job.retryCount, job.createdOn);
}
```

## Queue Management

```ts
await boss.createQueue("payment.capture", {
  retryLimit: 5,
  retryDelay: 30,
  retryBackoff: true,
  deadLetter: "payment.capture.dead",
});

await boss.createQueue("payment.capture.dead");
await boss.updateQueue("payment.capture", { retryLimit: 8 });
let queues = await boss.getQueues();
let queue = await boss.getQueue("payment.capture");
let size = await boss.getQueueSize("payment.capture", { before: "completed" });
await boss.purgeQueue("payment.capture");
```

Dead letter worker:

```ts
import { PgBossJob } from "@fastcar/pgboss";
import { PgBossWork } from "@fastcar/pgboss/annotation";

@PgBossWork("payment.capture.dead")
async handleDeadLetter(job: PgBossJob) {
  console.error("dead letter", job.id, job.data);
}
```

## Events and Health Checks

```ts
boss.on("error", (error) => {
  console.error("pg-boss error", error);
});

boss.on("wip", (workers) => {
  console.log("active workers", workers);
});

let sources = boss.listSources();
let status = await boss.getSourceStatus();
let allStatus = await boss.getSourceStatuses();
let healthy = await boss.healthCheck("audit");
```

Source status includes:

```ts
type PgBossSourceStatus = {
  source: string;
  default: boolean;
  started: boolean;
  installed?: boolean;
  schemaVersion?: number;
  error?: Error;
};
```

## Native pg-boss Escape Hatch

Use this only when the wrapper does not expose a needed pg-boss method.

```ts
let nativeBoss = boss.getBoss();
let auditBoss = boss.getBoss("audit");
let db = boss.getDb("audit");
```

Prefer wrapper methods for normal application code because they preserve source selection conventions and FastCar lifecycle behavior.

## Production Guidance

- `pg-boss` is not single-process only. It supports multiple Node processes and multiple app replicas consuming the same PostgreSQL-backed queue.
- PostgreSQL row locking coordinates job claiming; business handlers still need idempotency.
- Configure `retryLimit`, `retryDelay`, `retryBackoff`, and `deadLetter` for external calls and critical workflows.
- Add alerting around failed/dead-letter queues. Do not rely only on logs.
- For high-throughput queues, tune `batchSize`, database pool size, external API concurrency, and queue policies together.
- Keep one PostgreSQL schema per logical pg-boss installation unless intentionally sharing queues.
- Use separate `source` entries when applications must isolate queue storage across databases or schemas.

## Common Pitfalls

- Do not pass `source` inside pg-boss options except for wrapper decorators/configuration; wrapper methods take `source` as the final argument.
- Do not pass `undefined` when you need a meaningful payload; it becomes `{}`. Use `null` when the payload should explicitly be empty.
- Do not manually `complete()` jobs inside decorator workers; pg-boss handles completion based on handler success.
- Do not catch and ignore handler errors if retry/dead-letter behavior is desired.
- Do not create unbounded async work inside a batch handler.
- Do not assume schedule handlers run in only one application process; design scheduled business work as idempotent.

## Repository Maintenance

When modifying `@fastcar/pgboss` itself, validate with:

```bash
.\node_modules\.bin\tsc --noEmit
npm run typecheck
npm test
npm run build
npm run pack:check
```

Notes for agents working in the repository:

- If `npm run build` or `npm run pack:check` fails with Windows `EPERM`, retry with appropriate permission rather than treating it as a TypeScript failure.
- Keep `src/type/PgBossConfig.ts`, `index.d.ts`, and `annotation.d.ts` synchronized when public types change.
- Keep `target/` regenerated before packaging because `package.json` exports `target/index.js` and `target/annotation.js`.
- Current unit coverage is mock-based. For production confidence, add or recommend PostgreSQL integration tests covering schema startup, send/fetch/work, schedule triggering, retry/dead-letter behavior, and multi-instance consumption.
