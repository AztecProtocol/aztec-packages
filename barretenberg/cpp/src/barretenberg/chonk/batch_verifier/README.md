# Batch IVC Proof Verification Service

A high-throughput service for verifying Chonk IVC proofs. Trusted proofs are batched for amortized IPA verification; untrusted proofs are verified individually.

## Architecture

```
  TypeScript / Node.js (bb.js)
       │
       │  msgpack over IPC (5 commands)
       ▼
  ┌──────────────────────────────────────────────────────┐
  │                     BBAPI                            │
  │                                                      │
  │  Start ─ Queue ─ Cancel ─ CancelBySource ─ Stop      │
  └──────────┬───────────────────────────────────────────┘
             │
             ▼
  ┌──────────────────────────────────────────────────────┐
  │           ChonkBatchVerifierService                  │
  │                                                      │
  │   Routes by trust level, owns FIFO writer            │
  │                                                      │
  │   Queue(trusted=true)       Queue(trusted=false)     │
  │         │                          │                 │
  │         ▼                          ▼                 │
  │  ┌──────────────┐       ┌───────────────────┐       │
  │  │IPABatchProc. │       │UntrustedVerifier  │       │
  │  │              │       │Pool               │       │
  │  │ Phase 1:     │       │                   │       │
  │  │  parallel    │       │ Full individual   │       │
  │  │  reduce to   │       │ verification per  │       │
  │  │  IPA claims  │       │ proof on a fixed  │       │
  │  │              │       │ thread pool       │       │
  │  │ Phase 2:     │       │                   │       │
  │  │  batch IPA   │       │                   │       │
  │  │  (1 MSM)     │       │                   │       │
  │  │              │       │                   │       │
  │  │ Phase 3:     │       │                   │       │
  │  │  emit or     │       │                   │       │
  │  │  bisect      │       │                   │       │
  │  └──────┬───────┘       └────────┬──────────┘       │
  │         │                        │                   │
  │         └────────┬───────────────┘                   │
  │                  ▼                                   │
  │           VerifyResult                               │
  │                  │                                   │
  │                  ▼                                   │
  │        FIFO writer thread                            │
  │   [4-byte BE len][msgpack payload]                   │
  └──────────┬───────────────────────────────────────────┘
             │
             ▼
        Named FIFO pipe  →  TypeScript reader
```

## BBAPI Commands

All commands are msgpack-serialized RPC calls. Results are **not** returned via RPC — they stream asynchronously on a named FIFO pipe.

### 1. Start

Initialize the service with verification keys, output pipe, and thread configuration.

```
Request:
  vks: bytes[]            # Serialized verification keys
  output_fifo_path: str   # Path to named FIFO for result streaming
  config:
    num_ipa_cores: u32       # Cores for batch IPA MSM (Phase 2)
    num_sumcheck_cores: u32  # Worker threads for parallel reduce (Phase 1)
    num_untrusted_cores: u32 # Threads for individual untrusted verification
    trusted_batch_size: u32  # Proofs to accumulate before forming a batch
    max_pending: u32         # Backpressure limit

Response: (empty)
```

### 2. Queue

Submit a proof for verification. Routed by `trusted` flag.

```
Request:
  request_id: u64    # Caller-assigned unique ID
  proof: ChonkProof  # The IVC proof
  vk_index: u32      # Index into the VK array from Start
  trusted: bool      # true → batch pipeline, false → individual verification
  source: str        # Opaque tag (e.g. peer ID) for bulk cancellation

Response:
  accepted: bool
```

### 3. Cancel / CancelBySource

Cancel pending work by request ID or by source tag.

```
Cancel:
  request_id: u64  →  found: bool

CancelBySource:
  source: str  →  cancelled_count: u32
```

Cancelled proofs emit a result with `status: CANCELLED` on the FIFO.

### 4. Stop

Drain all pending work, close the FIFO, shut down threads.

```
Request: (empty)
Response: (empty)
```

## Result Streaming

Results are written to the FIFO as size-delimited msgpack:

```
┌────────────┬──────────────────┐
│ 4-byte BE  │  msgpack payload │
│ length     │  (VerifyResult)  │
└────────────┴──────────────────┘
```

```
VerifyResult:
  request_id: u64
  verified: bool
  status: u8              # 0=OK, 1=FAILED, 2=CANCELLED
  error_message: str
  source: str
  time_in_queue_ms: f64
  time_in_verify_ms: f64
  time_in_sumcheck_ms: f64
  time_in_ipa_ms: f64
  batch_failure_count: u32  # Number of bisection rounds (0 = first-try pass)
```

## Trusted Pipeline (IPABatchProcessor)

The core optimization: batch N IPA verifications into a single MSM.

```
  N proofs arrive
       │
       ▼
  Phase 1: Parallel Reduce
  ┌─────────────────────────────────────────┐
  │ num_sumcheck_cores worker threads       │
  │ Each runs reduce_to_ipa_claim:          │
  │   MegaZK verify + databus + Goblin      │
  │   → produces IPA claim + IPA proof      │
  │                                         │
  │ Work-stealing via atomic index.         │
  │ Each worker: set_parallel_for(1)        │
  │                                         │
  │ Failed proofs → emit FAILED immediately │
  └─────────────────┬───────────────────────┘
                    │ N claims (cached)
                    ▼
  Phase 2: Batch IPA Verify
  ┌─────────────────────────────────────────┐
  │ Single IPA::batch_reduce_verify call    │
  │ set_parallel_for(num_ipa_cores)         │
  │                                         │
  │ N separate SRS MSMs → 1 batched MSM    │
  └─────────────────┬───────────────────────┘
                    │
              ┌─────┴─────┐
              │           │
          IPA pass    IPA fail
              │           │
              ▼           ▼
  Phase 3a: Emit OK   Phase 3b: Bisect
  for all N proofs    ┌──────────────────┐
                      │ Split indices in │
                      │ half, re-verify  │
                      │ each half using  │
                      │ cached claims    │
                      │ (no re-reduce)   │
                      │                  │
                      │ O(log N) IPA     │
                      │ verifications    │
                      └──────────────────┘
```

## Bad Proof Behavior

Invalid proofs are handled at two points in the pipeline, with different costs:

### Phase 1 failures (cheap): sumcheck / Goblin reduction errors

Proofs that fail MegaZK verification, databus consistency, Merge, ECCVM sumcheck, or Translator
reduction are caught during Phase 1 (`reduce_to_batch_ipa_claim`). These are emitted as FAILED
immediately — they never enter the IPA batch and do not slow down other proofs.

Cost: only the reduce time for that proof (~60ms with real txs). No impact on batch throughput.

### Phase 2 failures (expensive): IPA bisection

If a proof passes Phase 1 but has an invalid IPA proof (e.g., corrupted Grumpkin commitments),
it causes the batch IPA to fail. The system then **bisects** the batch:

1. Split the batch in half
2. Re-verify each half's IPA (using cached claims — no re-reduction)
3. Recurse on failing halves until the bad proof(s) are isolated

Cost: O(log N) additional IPA verifications per batch. Each IPA verification takes ~170ms on 4 cores.
With batch_size=30 and 1 bad proof: ~5 extra IPA calls → ~850ms overhead on top of the original ~170ms.

**Benchmark results (120 proofs, 4 cores, batch_size=30):**
```
  All good:        1.43s (6.6x speedup)
  10% sumcheck-bad: 1.35s (7.0x — cheap, caught in Phase 1)
  10% IPA-bad:     6.89s (1.4x — expensive, triggers bisection)
  50% IPA-bad:    12.41s (0.8x — slower than sequential)
```

### Why this is acceptable

IPA-bad proofs require a valid-looking ECCVM sumcheck + Translator but an invalid IPA proof.
In practice, this requires deliberate adversarial construction — accidental corruption almost
always fails at the sumcheck level (Phase 1).

The networking layer handles adversarial peers out-of-band: peers that repeatedly send proofs
triggering IPA bisection are gradually penalized (reduced trust score, eventual disconnection).
This makes sustained IPA-bad attacks costly for the attacker while keeping the batch verifier's
happy path fast.

## Untrusted Pipeline (UntrustedVerifierPool)

Simple fixed-size thread pool. Each proof gets full individual verification (reduce + IPA) on one thread. No batching. The caller promotes sources to trusted after gaining confidence.

## Performance

### Real transactions (11 Aztec tx types, 120 proofs, 4 cores)

```
  Sequential:       9.44s   1.0x
  Batch=8:          2.08s   4.5x
  Batch=16:         1.64s   5.8x
  Batch=30:         1.43s   6.6x
  Batch=60:         1.31s   7.2x
  Batch=120:        1.26s   7.5x
```

Real proofs have ~60ms reduce time (vs ~24ms for small test circuits), so the IPA
bottleneck is proportionally less dominant. The batch pipeline still achieves 6-7x
speedup on 4 cores. More cores shift the balance further toward IPA batching.

### Piecewise timing (1 core, small test circuits)

```
  reduce_to_ipa_claim breakdown:
    MegaZK verify:      7.2 ms
    Databus check:      0.0 ms
    Merge verify:       1.0 ms
    ECCVM reduce:       7.3 ms   ← produces IPA claim (Grumpkin MSM)
    Translator verify:  5.4 ms
    ─────────────────────────
    Total reduce:      20.9 ms

  IPA single verify:  163.6 ms   (Grumpkin SRS MSM — the bottleneck)

  Batch IPA (1 core):
    N=1:   164.9 ms
    N=2:   169.7 ms
    N=4:   175.3 ms
    N=8:   188.3 ms
    N=16:  214.9 ms   ← 16 proofs for the price of ~1.3
```

### Why IPA batching works

IPA verification is dominated by a single Grumpkin pippenger MSM of size 2^20 (~1M points).
`IPA::batch_reduce_verify` combines N proofs' s-vectors with random challenge α, so
N separate 2^20-MSMs become one 2^20-MSM. The cost grows sublinearly with N.

## Source Files

```
chonk/batch_verifier/              ← this directory
  README.md                         # This file
  batch_verifier_types.hpp          # BatchVerifierConfig, VerifyResult, VerifyRequest
  ipa_batch_processor.hpp/cpp       # 3-phase trusted batch pipeline
  untrusted_verifier_pool.hpp/cpp   # Individual verification thread pool
  chonk_batch_verifier_service.hpp/cpp  # Top-level service (routing + FIFO)
  chonk_batch_verifier_service.test.cpp # Tests + piecewise timing

bbapi/
  bbapi_batch_verifier.hpp/cpp      # 5 RPC commands (Start/Queue/Cancel/CancelBySource/Stop)
```
