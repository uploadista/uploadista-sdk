# Uploadista KV Stores Comparison Guide

This guide helps you choose the right KV store for your Uploadista deployment.

## Quick Selection Matrix

```
Are you deploying to Cloudflare Workers?
├─ YES: Use Cloudflare KV
├─ NO: Does your app need real-time WebSocket coordination?
   ├─ YES: Use Cloudflare Durable Objects (if Cloudflare) or Redis
   ├─ NO: Do you have distributed/clustered servers?
      ├─ YES: Use Redis or IORedis
      ├─ NO: Do you need maximum simplicity for development?
         ├─ YES: Use Memory or Filesystem
         └─ NO: Use Filesystem for persistence
```

## Detailed Comparison

### Feature Matrix

| Feature | Memory | Filesystem | Redis | IORedis | Cloudflare KV | Durable Objects |
|---------|--------|-----------|-------|---------|----------------|-----------------|
| **Persistence** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Distributed** | ❌ | ❌ | ✅ | ✅ | ✅ (Edge) | ✅ (Edge) |
| **Clustering** | ❌ | ❌ | ✅ | ✅✅ | ❌ | ❌ |
| **Strong Consistency** | ✅ | ✅ | ✅ | ✅ | ❌ (Eventual) | ✅ |
| **WebSocket Support** | ❌ | ❌ | ✅ (Pub/Sub) | ✅ (Pub/Sub) | ❌ | ✅✅ |
| **Real-Time Events** | ❌ | ❌ | ✅ | ✅ | ❌ | ✅✅ |
| **Transactions** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **TTL/Expiration** | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| **Setup Complexity** | ⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **Operational Complexity** | ⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐ | ⭐⭐ |
| **Cost** | 🟢 Free | 🟢 Free | 🟡 Moderate | 🟡 Moderate | 🟡 Per-operation | 🔴 Higher |

### Performance Comparison

| Metric | Memory | Filesystem | Redis | IORedis | Cloudflare KV | Durable Objects |
|--------|--------|-----------|-------|---------|----------------|-----------------|
| **Read Latency** | ~1μs | 1-5ms | 1-2ms | 1-2ms | ~10ms | ~5ms |
| **Write Latency** | ~1μs | 2-10ms | 2-5ms | 2-5ms | ~50ms | ~10ms |
| **Throughput** | 100k+ ops/s | 1-10k ops/s | 50k+ ops/s | 50k+ ops/s | 1-10k ops/s | 1-10k ops/s |
| **Data Replication** | N/A | N/A | ~100ms | ~100ms | ~30s (global) | Instant |
| **Consistency** | Immediate | Immediate | Immediate | Immediate | ~30s eventual | Immediate |

### Scalability

| Store | Max Data | Max Ops/sec | Distribution | Limit Reached |
|-------|----------|-------------|--------------|---------------|
| Memory | RAM limit (~10GB) | 100,000 | Single process | 1-2 hours |
| Filesystem | Disk capacity | 1,000-10,000 | Single server | 10-100 GB |
| Redis | Typical: 10-50GB | 50,000 | All servers→1 master | 50+ GB |
| IORedis | Cluster: 1TB+ | 100,000+ | Distributed | Extremely high |
| Cloudflare KV | Unlimited | 10,000 | 300+ edge locations | Rarely |
| Durable Objects | Per-object: 128MB | 1,000 | Partitioned globally | Per-object limit |

## Use Case Scenarios

### Scenario 1: Development Environment

**Requirements**: Fast iteration, no external services

**Recommendation**: **Memory** or **Filesystem**

**Why**:
- ✅ Instant setup (`npm install` only)
- ✅ No services to manage
- ✅ Fast reads and writes
- ✅ Easy debugging with filesystem

**When to use Memory**:
- Single-threaded development
- Tests and unit tests
- No persistence needed

**When to use Filesystem**:
- Testing with persistence
- Team development (share data)
- Simulating real deployments

**Setup Example**:
```typescript
// Development with Filesystem
const layer = fileKvStore({ directory: "./dev-data" });
```

---

### Scenario 2: Single-Server Deployment

**Requirements**: Persistent storage, controlled performance

**Recommendation**: **Filesystem** or **Redis**

**Why Filesystem**:
- ✅ No external service dependencies
- ✅ Data stored securely on disk
- ✅ Easy backups (filesystem snapshots)
- ✅ Suitable for 1-100GB data
- ❌ Cannot scale to multiple servers
- ❌ Disk I/O bottleneck at high volume

**Why Redis**:
- ✅ Better performance than filesystem
- ✅ Pub/Sub for real-time events
- ✅ Can transition to distributed
- ✅ Optional persistence (RDB/AOF)
- ❌ Requires separate Redis service
- ❌ Higher operational complexity

**Recommendation Matrix**:
- `< 10GB, simple setup` → Filesystem
- `> 10GB or high throughput` → Redis
- `Real-time events needed` → Redis

**Setup Example**:
```typescript
// Single server with filesystem
const fsLayer = fileKvStore({ directory: "/data/uploads" });

// Single server with Redis (better performance)
const redis = createClient({ url: "redis://localhost:6379" });
const redisLayer = redisKvStore({ redis });
```

---

### Scenario 3: Distributed Multi-Server Deployment

**Requirements**: Shared state across servers, high availability

**Recommendation**: **Redis** or **IORedis**

**Why Redis**:
- ✅ Standard Redis client
- ✅ Suitable for small clusters
- ✅ Master-replica setup for failover
- ✅ Simpler for small teams
- ❌ Less efficient cluster support
- ❌ Limited replica scaling

**Why IORedis**:
- ✅ Built-in Redis cluster support
- ✅ Sentinel for automatic failover
- ✅ Replica read scaling
- ✅ Better for large deployments
- ❌ More complex configuration
- ❌ Larger memory footprint

**Scaling Pattern**:
```
Load Balancer
├─ Server 1 ──┐
├─ Server 2  ├─ Shared Redis/Redis Cluster
└─ Server 3 ──┘
```

**Setup Example**:
```typescript
// Distributed with Redis Cluster
const redis = new Redis.Cluster([
  { host: "redis-node-1", port: 6379 },
  { host: "redis-node-2", port: 6379 },
  { host: "redis-node-3", port: 6379 },
]);

const layer = ioRedisKvStore({ redis });
```

---

### Scenario 4: Cloudflare Workers Deployment

**Requirements**: Serverless, global distribution, zero infrastructure

**Recommendation**: **Cloudflare KV** or **Durable Objects**

**Why Cloudflare KV**:
- ✅ Global edge distribution (300+ locations)
- ✅ Zero infrastructure management
- ✅ Sub-100ms latency worldwide
- ✅ Integrated with Workers
- ✅ Simpler pricing model
- ❌ Eventual consistency (~30s)
- ❌ No WebSocket support
- ❌ 25MB value limit

**When to use Cloudflare KV**:
- Simple metadata storage
- Upload sessions without real-time updates
- Cache-aside patterns
- File deduplication

**Why Durable Objects**:
- ✅ Strong consistency
- ✅ Native WebSocket support
- ✅ Transactional operations
- ✅ Real-time progress tracking
- ✅ Multi-step workflows
- ❌ More complex setup
- ❌ Higher cost
- ❌ 128MB per object limit

**When to use Durable Objects**:
- Real-time upload progress
- Complex multi-step flows
- WebSocket-based coordination
- Transaction requirements

**Setup Example**:
```typescript
// Cloudflare Workers with KV
const layer = cloudflareKvStore({ kv: env.KV_STORE });

// Cloudflare Workers with Durable Objects
const layer = cloudflareDoFlowJobKvStore({
  durableObject: env.FLOW_JOB_STORE,
});
```

---

### Scenario 5: High-Throughput Production

**Requirements**: 10,000+ operations/second, extreme reliability

**Recommendation**: **IORedis** (with clustering and Sentinel)

**Why**:
- ✅ Can handle 100,000+ ops/sec with clustering
- ✅ Automatic failover with Sentinel
- ✅ Replica scaling for reads
- ✅ Pub/Sub for real-time events
- ✅ Battle-tested in production
- ⚠️ Requires significant operational expertise

**Architecture**:
```
┌─ Master Redis ────→ Replica 1
│                  \─ Replica 2
│
└─ Sentinel 1
   Sentinel 2  ─→ Monitors health, promotes replica on failure
   Sentinel 3
```

---

### Scenario 6: Hybrid Approach

**Requirements**: Best of multiple worlds (local + distributed)

**Recommendation**: **Combine different stores by use case**

**Pattern 1: Filesystem + Redis**
- Filesystem: Persistent logs, archived uploads
- Redis: Active sessions, real-time state

**Pattern 2: Cloudflare KV + Durable Objects**
- KV: Metadata cache (eventual consistency OK)
- Durable Objects: Real-time flow coordination

**Pattern 3: Redis + Cloudflare KV**
- Redis: Primary in origin
- Cloudflare KV: Edge cache layer

**Example**:
```typescript
// Use different stores strategically
const sessionStore = redisKvStore({ redis });      // Real-time
const archiveStore = fileKvStore({ directory }); // Long-term
const cacheStore = cloudflareKvStore({ kv });    // Edge

const program = Effect.gen(function* () {
  // Store in Redis for fast access
  yield* sessionStore.set(sessionId, sessionData);

  // Archive to filesystem for audit
  yield* archiveStore.set(`archive:${sessionId}`, sessionData);

  // Cache at edge
  yield* cacheStore.set(`cache:${sessionId}`, sessionData);
});
```

## Decision Tree

```
START: "I need a KV store for Uploadista"
│
├─ [Deployment Target?]
│  │
│  ├─ Cloudflare Workers
│  │  ├─ Need real-time updates via WebSocket?
│  │  │  ├─ YES → Durable Objects
│  │  │  └─ NO → Cloudflare KV
│  │  │
│  │
│  ├─ VPS / Self-Hosted / Cloud VM
│  │  ├─ Single server or multiple?
│  │  │  ├─ Single
│  │  │  │  ├─ Willing to manage Redis?
│  │  │  │  │  ├─ YES → Redis
│  │  │  │  │  └─ NO → Filesystem
│  │  │  │
│  │  │  ├─ Multiple (distributed)
│  │  │  │  ├─ 2-5 servers → Redis
│  │  │  │  ├─ 5+ servers → IORedis with Cluster
│  │  │  │  └─ 100+ servers → IORedis + Sentinel
│  │  │  │
│  │  │
│  ├─ Local Development
│  │  ├─ Need persistence?
│  │  │  ├─ YES → Filesystem
│  │  │  └─ NO → Memory
│  │  │
│
└─ [Final Recommendation]
```

## Migration Paths

### Memory → Filesystem
```typescript
// Easy: Same interface, just add persistence
import { fileKvStore } from "@uploadista/kv-store-filesystem";
const layer = fileKvStore({ directory: "./data" });
```

### Filesystem → Redis
```typescript
// Manual: Export filesystem data to Redis
// 1. Read all files from directory
// 2. Import to Redis using redis.mset()
// 3. Verify data integrity
// 4. Switch application layer

const redis = createClient({ url: "redis://prod-redis:6379" });
const layer = redisKvStore({ redis });
```

### Redis → IORedis
```typescript
// Transparent: IORedis client is compatible
// Just switch the client library
import Redis from "ioredis";
const redis = new Redis({ host: "localhost" });
// Same `ioRedisKvStore()` layer works
```

### Non-Cloudflare → Cloudflare Workers
```typescript
// Requires: Data migration and deployment
// 1. Export all data from current store
// 2. Import to Cloudflare KV
// 3. Deploy Workers code
// 4. Point DNS to Workers

const layer = cloudflareKvStore({ kv: env.KV_STORE });
```

## Operational Considerations

### Backup & Recovery

| Store | Backup Method | Recovery Time | Data Loss Risk |
|-------|---------------|----------------|----------------|
| Memory | ❌ N/A | N/A | 💥 Process restart |
| Filesystem | ✅ `tar`, `rsync` | ~1 min | 🟡 Disk failure |
| Redis | ✅ RDB/AOF snapshots | ~5 min | 🟡 Network issues |
| IORedis | ✅ RDB/AOF + Replication | ~1 min | 🟢 Replicated |
| Cloudflare KV | ✅ Automatic (Cloudflare) | ~30s | 🟢 Replicated |
| Durable Objects | ✅ Automatic (Cloudflare) | ~1s | 🟢 Replicated |

### Monitoring & Alerts

```typescript
// Monitor store health
interface StoreMetrics {
  readLatency: number;
  writeLatency: number;
  errorRate: number;
  diskUsage?: number;
  replicationLag?: number;
}
```

**Recommended Metrics by Store**:
- **Memory**: None needed (ephemeral)
- **Filesystem**: Disk space, file count, I/O latency
- **Redis**: Memory usage, replication lag, connection count
- **IORedis**: Cluster node health, command latency, failover events
- **Cloudflare KV**: Operation rate, error rate, bandwidth
- **Durable Objects**: Storage usage per object, request latency

## Cost Analysis

### Annual Cost Estimate (100GB data, 1M ops/day)

| Store | Setup | Monthly | Annual | Notes |
|-------|-------|---------|--------|-------|
| Memory | $0 | $0 | $0 | Only RAM cost (included in VM) |
| Filesystem | $0 | $0-10 | $0-120 | Disk cost (minimal) |
| Redis Standalone | $0 | $20-50 | $240-600 | t3.micro AWS to m6g.large |
| Redis Cluster | $0 | $100-300 | $1.2k-3.6k | 3+ nodes + monitoring |
| IORedis | $0 | $150-400 | $1.8k-4.8k | 5+ nodes + Sentinel |
| Cloudflare KV | $0 | $200-500 | $2.4k-6k | Per-operation pricing |
| Durable Objects | $0 | $500-2000 | $6k-24k | Premium service |

**Cost Recommendations**:
- Small (<10GB): Filesystem or Memory ($0-20/month)
- Medium (10-100GB): Redis ($50-200/month)
- Large (>100GB): Redis Cluster or IORedis ($300-1000/month)
- Serverless: Cloudflare KV or DO ($200-2000/month)

## Recommendation Summary

| Deployment Type | Primary | Secondary | When to Switch |
|-----------------|---------|-----------|-----------------|
| **Development** | Memory | Filesystem | After manual testing |
| **Prototype/MVP** | Filesystem | Redis | When scaling to 2+ servers |
| **Single-Server Production** | Filesystem | Redis | Real-time events needed or >10GB |
| **Multi-Server Production** | Redis | IORedis | >5 servers or high throughput |
| **Cloudflare Workers** | KV | Durable Objects | Real-time updates needed |
| **Extreme Scale** | IORedis Cluster | Database | >1TB data required |

## Getting Started

### Quick Start by Use Case

```typescript
// 1. Development (fastest to start)
import { memoryKvStore } from "@uploadista/kv-store-memory";
const layer = memoryKvStore;

// 2. Development with persistence
import { fileKvStore } from "@uploadista/kv-store-filesystem";
const layer = fileKvStore({ directory: "./data" });

// 3. Production single-server
import { fileKvStore } from "@uploadista/kv-store-filesystem";
const layer = fileKvStore({ directory: "/data/uploads" });

// 4. Production distributed
import { redisKvStore } from "@uploadista/kv-store-redis";
import { createClient } from "@redis/client";
const redis = createClient({ url: process.env.REDIS_URL });
const layer = redisKvStore({ redis });

// 5. Cloudflare Workers
import { cloudflareKvStore } from "@uploadista/kv-store-cloudflare-kv";
const layer = cloudflareKvStore({ kv: env.KV_STORE });
```

## See Also

- [@uploadista/kv-store-memory](./memory/README.md) - In-memory store
- [@uploadista/kv-store-filesystem](./filesystem/README.md) - Filesystem-backed store
- [@uploadista/kv-store-redis](./redis/README.md) - Redis store
- [@uploadista/kv-store-ioredis](./ioredis/README.md) - IORedis store
- [@uploadista/kv-store-cloudflare-kv](./cloudflare-kv/README.md) - Cloudflare KV store
- [@uploadista/kv-store-cloudflare-do](./cloudflare-do/README.md) - Cloudflare Durable Objects
- [Server Setup Guide](../../SERVER_SETUP.md) - Integrating KV stores in servers
