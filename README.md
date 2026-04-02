# Redis — Server-Worker Queue Demo

A TypeScript project that simulates a **producer-consumer architecture** using [Redis](https://redis.io/) as a message queue. An Express HTTP server acts as the **producer**, pushing jobs onto a Redis list, while a standalone worker process acts as the **consumer**, blocking until a job arrives and then processing it.

---

## Table of Contents

1. [What is Redis?](#what-is-redis)
2. [How Redis Works](#how-redis-works)
3. [Common Use Cases](#common-use-cases)
4. [Project Architecture](#project-architecture)
5. [Repository Structure](#repository-structure)
6. [Getting Started](#getting-started)
7. [How the Queue Works Step-by-Step](#how-the-queue-works-step-by-step)

---

## What is Redis?

**Redis** (Remote Dictionary Server) is an open-source, in-memory data structure store that can be used as a database, cache, message broker, and streaming engine. Unlike traditional disk-based databases, Redis keeps all data in RAM, making read and write operations extremely fast — often completing in under a millisecond.

Redis supports a rich set of data structures:

| Data Structure | Description |
|---|---|
| **String** | Simple key-value pairs (text, numbers, binary blobs) |
| **List** | Ordered sequences of strings; supports push/pop from both ends |
| **Hash** | Field-value maps, similar to a dictionary or object |
| **Set** | Unordered collections of unique strings |
| **Sorted Set** | Sets where every element has a score for ordered retrieval |
| **Stream** | Append-only log of entries, ideal for event sourcing |
| **Pub/Sub** | Publish/subscribe messaging channels |

---

## How Redis Works

```
┌────────────────────────────────────────────┐
│               Redis Server                 │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │         In-Memory Data Store         │  │
│  │                                      │  │
│  │  key: "queue"  →  ["job3","job2",…]  │  │
│  │  key: "user:1" →  { name: "Alice" }  │  │
│  │  key: "hits"   →  "42031"            │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  Persistence: RDB snapshots / AOF log      │
│  Replication: Primary → Replicas           │
│  Clustering:  Sharding across nodes        │
└────────────────────────────────────────────┘
```

**Key characteristics:**

- **Single-threaded command execution** — Redis processes one command at a time, eliminating the need for locks and making it naturally thread-safe for its data structures.
- **Non-blocking I/O** — A single thread uses an event loop (similar to Node.js) to multiplex thousands of client connections concurrently.
- **Atomic operations** — Every Redis command is atomic; multi-step operations can be grouped with `MULTI`/`EXEC` transactions or Lua scripts.
- **Optional persistence** — Data can be snapshotted to disk (RDB) or appended to a log (AOF) for durability while still being served from memory.
- **Replication & Clustering** — Redis supports primary-replica replication and horizontal sharding across a cluster of nodes for high availability and scalability.

---

## Common Use Cases

| Use Case | How Redis Helps |
|---|---|
| **Caching** | Store results of expensive DB queries or API calls; serve them at memory speed |
| **Session storage** | Keep user session data with automatic TTL expiry |
| **Rate limiting** | Increment a counter per user/IP using atomic `INCR` + `EXPIRE` |
| **Message queues** | Use Lists with `LPUSH`/`BRPOP` to build reliable job queues |
| **Pub/Sub messaging** | Fan out real-time events to multiple subscribers |
| **Leaderboards** | Sorted Sets maintain ranked scores with O(log n) updates |
| **Distributed locks** | `SET key value NX PX <ttl>` provides a simple distributed mutex |
| **Real-time analytics** | Counters, HyperLogLog for unique counts, Streams for event logs |

---

## Project Architecture

This repository implements a **producer-consumer** pattern — one of the most common real-world Redis use cases — using a Redis **List** as the queue.

```
                    HTTP Request
                   POST /lpush
                        │
                        ▼
             ┌──────────────────┐
             │   Server (3000)  │  ← Express + TypeScript (Producer)
             │                  │
             │  LPUSH queue …   │
             └────────┬─────────┘
                      │  Pushes job to LEFT of list
                      ▼
             ┌──────────────────┐
             │   Redis Server   │
             │                  │
             │  "queue" list:   │
             │  [job3,job2,job1] │
             └────────┬─────────┘
                      │  BRPOP blocks until an item is available,
                      │  pops from RIGHT of list (FIFO order)
                      ▼
             ┌──────────────────┐
             │  Worker Process  │  ← TypeScript (Consumer)
             │                  │
             │  Processes job…  │
             └──────────────────┘
```

### Server (Producer) — `server/src/index.ts`

- Built with **Express 5** and the `redis` npm client.
- Connects to Redis on startup (defaults to `redis://127.0.0.1:6379`, overridable via `REDIS_URL`).
- Exposes a single endpoint:

  ```
  POST /lpush
  Content-Type: application/json

  { "task": "send-email", "to": "user@example.com" }
  ```

- Serialises the request body to JSON and calls **`LPUSH queue <data>`**, appending the job to the **left (head)** of the Redis list named `queue`.
- Responds with `{ "message": "Value pushed to list successfully" }` on success.

### Worker (Consumer) — `worker/src/index.ts`

- A standalone Node.js process with no HTTP server of its own.
- Connects to the same Redis instance.
- Runs an **infinite loop** that calls **`BRPOP queue 0`** on every iteration:
  - `BRPOP` is a *blocking* right-pop — it waits indefinitely (`timeout = 0`) until an element is available, then pops from the **right (tail)** of the list.
  - Because the server pushes to the left and the worker pops from the right, jobs are processed in **FIFO (first-in, first-out)** order.
- Parses the JSON payload and logs it; in a real application this is where business logic (sending emails, resizing images, charging cards, etc.) would run.

### Why LPUSH + BRPOP?

| Command | Side | Result |
|---|---|---|
| `LPUSH` | Left (head) | Newest job goes to front of list |
| `BRPOP` | Right (tail) | Oldest job is popped first → **FIFO** |

`BRPOP` is preferred over a polling loop with `RPOP` because it eliminates busy-waiting: the worker sleeps inside Redis until notified, consuming zero CPU while idle.

---

## Repository Structure

```
redis/
├── server/                  # Producer — Express HTTP server
│   ├── src/
│   │   └── index.ts         # Entry point: /lpush endpoint
│   ├── package.json
│   └── tsconfig.json
│
├── worker/                  # Consumer — background job processor
│   ├── src/
│   │   └── index.ts         # Entry point: BRPOP loop
│   ├── package.json
│   └── tsconfig.json
│
└── README.md
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- A running Redis instance (local or remote)

**Start Redis locally with Docker:**

```bash
docker run -d -p 6379:6379 redis:latest
```

### Install dependencies

```bash
# Server
cd server && npm install

# Worker
cd ../worker && npm install
```

### Run the server

```bash
cd server
npm run dev
# Server is running on http://localhost:3000
```

### Run the worker

Open a second terminal:

```bash
cd worker
npm run dev
# Worker is running on http://localhost:3000
```

### Push a job

```bash
curl -X POST http://localhost:3000/lpush \
  -H "Content-Type: application/json" \
  -d '{"task": "send-email", "to": "user@example.com"}'
```

The worker terminal will immediately print the received job:

```
Processing data from queue: { task: 'send-email', to: 'user@example.com' }
```

### Custom Redis URL

Both the server and worker read the `REDIS_URL` environment variable:

```bash
REDIS_URL=redis://my-redis-host:6379 npm run dev
```

---

## How the Queue Works Step-by-Step

1. **Client** sends `POST /lpush` with a JSON body to the server.
2. **Server** serialises the body and calls `LPUSH queue <json>` — the job lands at the head of the `queue` list in Redis.
3. **Worker** is blocking inside `BRPOP queue 0`. Redis immediately unblocks it and returns the element from the tail of the list.
4. **Worker** deserialises the JSON and processes the job.
5. Steps 1–4 repeat; multiple worker instances can run in parallel — Redis ensures each job is delivered to exactly one worker.

This pattern decouples HTTP request handling (fast, low-latency) from potentially slow background work (email delivery, image processing, third-party API calls), improving overall system throughput and resilience.
