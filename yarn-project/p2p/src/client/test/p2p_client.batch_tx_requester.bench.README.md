# BatchTxRequester Benchmarks

This benchmark suite measures **how quickly a proposer node can fetch missing transactions from P2P peers** when building a block proposal under several controlled "who-has-which-txs" distributions.

## Purpose

When proposing a block, the node may have a block proposal containing a list of `txHashes`, but may be **missing the full `Tx` objects** locally. The node must fetch those missing txs from peers via the P2P req/resp layer.

This benchmark answers:

- How long does it take to fetch **N missing txs** (N ∈ **{10, 50, 100, 500}**)?
- How do different **peer availability patterns** affect performance?

## Architecture

The benchmark runs a small simulated network on localhost:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Test Process (Driver)                        │
│   p2p_client.batch_tx_requester.bench.test.ts                       │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │            WorkerClientManager                              │   │
│   │         (src/testbench/worker_client_manager.ts)            │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                              │ IPC                                  │
│         ┌────────────────────┼────────────────────┐                 │
│         ▼                    ▼                    ▼                 │
│   ┌───────────┐        ┌───────────┐        ┌───────────┐           │
│   │ Worker 0  │◄──────►│ Worker 1  │◄──────►│ Worker N-1│           │
│   │(Aggregator│  P2P   │(Responder)│  P2P   │(Responder)│           │
│   │  Node)    │        │           │        │           │           │
│   │ TxPool:[] │        │ TxPool:   │        │ TxPool:   │           │
│   │           │        │ [txs...]  │        │ [txs...]  │           │
│   └───────────┘        └───────────┘        └───────────┘           │
└─────────────────────────────────────────────────────────────────────┘
```

- **N worker processes** are spawned using Node's **`child_process.fork()`**
- Each worker runs a "light" **`P2PClient.Full`** node (enough to exercise the real P2P req/resp machinery)
- Workers communicate with the test process via **IPC messages** defined in `p2p_client_testbench_worker.ts`

### Why multiple processes?

Using separate OS processes makes the setup closer to real networking behavior (independent event loops, scheduling, IPC boundaries), and avoids many artifacts you'd get by running everything in one process.

### Worker roles

The network is intentionally asymmetric:

- **Worker 0 is the aggregator/proposer node**
  - Starts with an **empty tx pool** (`[]`)
  - Is the only worker instructed to run `BatchTxRequester` for each `BENCH_REQRESP` command
- **Workers 1..N-1 are responder peers**
  - Locally generate and filter txs according to the distribution pattern
  - Respond to req/resp queries made by Worker 0's `BatchTxRequester`

This models a proposer that has only `txHashes` in a proposal and must fetch the full tx bodies from the network.

## Transaction Distribution Patterns

Each benchmark case generates `missingTxCount` mock txs and assigns them to peers using one of these patterns:

### `uniform`

**Every responder peer has every transaction.**

- Simulates the best-case: high replication / high gossip success
- Expectation: the requester should quickly succeed; differences mostly reflect requester overhead and batching strategy

### `sparse`

**Each transaction exists on only a small subset of peers.**

Each responder is bucketed and holds txs whose index falls into its bucket or the "next" bucket (striped by tx index).

- Simulates partial propagation, churn, or uneven mempool convergence
- Expectation: the requester must query multiple peers and cope with "misses"

### `pinned-only`

**Only a single "pinned" peer has the transactions; all other peers have none.**

- Simulates "I know exactly who has the txs" (or a topology where one peer is the source of truth)
- Useful to test whether "pinned peer" fast-paths work as intended

> **Guardrail:** the pinned peer index must be within `(0, numberOfPeers)` (Worker 0 cannot be pinned).

## Test Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| `PEERS_PER_RUN` | 30 | Number of worker processes spawned |
| `MISSING_TX_COUNTS` | 10, 50, 100, 500 | Number of missing transactions to fetch |
| `TIMEOUT_MS` | 30,000 ms | Per-case timeout for the requester |
| `TEST_TIMEOUT_MS` | 600,000 ms | Overall Jest timeout (10 minutes) |

## Running

From the p2p package:

```bash
cd yarn-project/p2p
yarn test src/client/test/p2p_client.batch_tx_requester.bench.test.ts
```

Or from repo root:

```bash
yarn test p2p_client.batch_tx_requester.bench.test.ts
```

The benchmark is intentionally long due to spawning many processes and running multiple cases.

## Output Formats

### Default: Markdown table to stdout

If no env vars are set, the suite prints a table:

```
| Distribution | Missing | Duration (ms) | Fetched | Success |
|--------------|---------|---------------|---------|---------|
| pinned-only  |      10 |           123 |      10 |   Yes   |
| pinned-only  |      50 |           145 |      50 |   Yes   |
```

### JSON metrics (for CI/dashboards)

```bash
BENCH_OUTPUT=/path/results.json yarn test ...
```

Writes JSON metrics like:
- `BatchTxRequester/<distribution>/missing_<N>/duration` (ms)
- `BatchTxRequester/<distribution>/missing_<N>/fetched` (txs)

### Markdown file output

```bash
BENCH_OUTPUT_MD=/path/results.md yarn test ...
```

Writes the pretty table + summary to disk.

## Interpreting Results

For each case the benchmark records:

- `durationMs`: wall-clock time spent inside the requester call
- `fetchedCount`: how many txs were returned by the requester
- `success`: `fetchedCount === missingTxCount`

**Guidelines:**

- **Always check `Success` first.** A faster run that fetched fewer txs is not a win.
- Compare runs **within the same distribution + missing count** only.
- Expect `pinned-only` to highlight pinned-peer behavior (fast if pinned peer is used effectively; slow if the algorithm wastes time sampling other peers).
- Expect `sparse` to be the most "network-like" stress case, since many peers won't have each requested tx.

## Determinism / Noise Reduction

Inside each worker, the benchmark intentionally reduces variability:

- **Unlimited rate limits** are installed so the req/resp rate limiter doesn't dominate results
- **Deterministic tx generation** ensures all workers see the same tx set without large IPC payloads

This makes the benchmark better for tracking regressions, but it is **not** a perfect model of production networking conditions.

## Limitations

This benchmark does **not** measure:

- Real internet latency, NAT traversal, or adversarial peers (everything runs on localhost)
- End-to-end proposer behavior beyond tx fetching (block construction, proving, etc.)
- Gossip-based mempool convergence—tx availability is injected directly into each worker's in-memory tx pool

## Files

| File | Purpose |
|------|---------|
| `p2p_client.batch_tx_requester.bench.test.ts` | Test suite (cases, distributions, output formatting) |
| `src/testbench/worker_client_manager.ts` | Worker process manager (forking, IPC, orchestration) |
| `src/testbench/p2p_client_testbench_worker.ts` | General testbench worker implementation |
| `src/test-helpers/testbench-utils.ts` | Shared mocks and utilities (InMemoryTxPool, InMemoryAttestationPool, etc.) |

## Implementation Notes

- Workers run TypeScript via `ts-node/esm` unless a compiled JS worker exists at `dest/testbench/p2p_client_testbench_worker.js`
- Request/response rate limits are overridden so the benchmark is not throttled
- Workers generate txs locally from a shared seed to avoid sending large tx payloads over IPC

## Practical Tips

- Run on an otherwise idle machine; CPU scheduling noise matters when spawning 30 node processes
- If you see intermittent failures, increase `TIMEOUT_MS` or reduce `PEERS_PER_RUN` for local iteration
- Use `BENCH_OUTPUT` in CI to track performance regressions over time
