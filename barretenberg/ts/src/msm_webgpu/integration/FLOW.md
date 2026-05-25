# MsmV2 End-to-End Flow

A walkthrough of one BN254 MSM call as it travels from a barretenberg
prover (compiled to WASM, running in a Web Worker) to the GPU and back.
Every claim that names a file, line, symbol, or constant is checked
against the current tree.

This is a *flow* doc — it covers the call path and the data layouts at
each boundary. The algorithmic content (Pippenger, batched affine
addition, the pair-tree, field arithmetic) is presented inline with
LaTeX. See [ALGORITHM.md](ALGORITHM.md) for per-shader detail as that
gets filled in.

---

## 0. Notation

| Symbol | Meaning |
|---|---|
| $\mathbb{F}_q$ | BN254 base field, $\log_2 q \approx 254$. |
| $\mathbb{F}_r$ | BN254 scalar field, $\log_2 r \approx 254$. |
| $\mathbb{G}_1$ | BN254 group of order $r$, $y^2 = x^3 + 3$. |
| $n$ | Number of $(P_i, s_i)$ pairs in this MSM. |
| $P_i$ | Base points, $P_i \in \mathbb{G}_1$, $i \in [0, n)$. |
| $s_i$ | Scalars, $s_i \in \mathbb{F}_r$. |
| $\lambda$ | Scalar bit width (BN254: $\lambda = 254$, set at [msm_v2.ts:33](../msm_v2.ts#L33)). |
| $c$ | Pippenger window width (bits per digit). Per-$n$ table at [msm_v2.ts:372-389](../msm_v2.ts#L372-L389). |
| $T$ | Number of windows: $T = \lceil \lambda / c \rceil$. |
| $B$ | Buckets per window: $B = 2^{c-1}$ (signed digits). |
| $s_{i,j}$ | Signed digit of $s_i$ in window $j$, with $\lvert s_{i,j} \rvert \in [0, 2^{c-1}]$. |
| $W_j$ | Per-window weighted sum (the result of bucket reduction in window $j$). |
| $S$ | The final MSM result, $S = \sum_i [s_i]\,P_i$. |
| $w_\text{limb}$, $L$ | Field limb width (13) and limb count ($L = \lceil 254/13 \rceil = 20$); 8×u32 "live form" used inside fused kernels (see §8). |
| $R$ | Montgomery radix, $R \equiv 2^{256} \pmod q$ (8×u32 storage). |

Problem statement:

$$
S \;=\; \sum_{i=0}^{n-1} [s_i]\,P_i \;\in\; \mathbb{G}_1.
$$

Pippenger's identity (windowed):

$$
s_i \;=\; \sum_{j=0}^{T-1} s_{i,j}\, 2^{jc},
\qquad
S \;=\; \sum_{j=0}^{T-1} 2^{jc}\, W_j,
\qquad
W_j \;=\; \sum_{i=0}^{n-1} [s_{i,j}]\, P_i.
$$

Inside each window, $W_j$ is computed by accumulating $P_i$ into
*buckets* indexed by $s_{i,j}$, then suffix-summing the buckets — the
classical bucket-reduction identity:

$$
W_j \;=\; \sum_{k=1}^{B} k\, B_{j,k} \;=\; \sum_{k=1}^{B} \Bigl(\sum_{\ell \ge k} B_{j,\ell}\Bigr),
\qquad
B_{j,k} \;=\; \sum_{i\,:\,s_{i,j} = k} P_i \;-\; \sum_{i\,:\,s_{i,j} = -k} P_i.
$$

MsmV2 evaluates $\sum_{i\,:\,s_{i,j}=k} P_i$ with a *pair tree* (§6.5):
each level halves the active count by batching $\lfloor N_k/2 \rfloor$
affine adds, with the inversion amortized across all pairs in a single
fused dispatch.

### Visual overview

The whole MSM lives inside a sparse 3-D tensor. The $i$ axis enumerates
the $n$ input points, the $j$ axis the $T$ Pippenger windows, the $k$
axis the $B_W$ buckets per window. A single nonzero $M_{i,k,j} = 1$ at
position $(i, k, j)$ says "the $j$-th window of scalar $s_i$ recoded to
the digit with magnitude $k$"; every $(i, j)$ column has exactly one
nonzero, so the tensor is *extremely* sparse — $T \cdot n$ nonzeros in
$T \cdot n \cdot B_W$ cells.

![Bucket-membership tensor M_{i,k,j} with one window slice M^{(j)} highlighted in blue, one bucket column k=3 within that slice outlined in red, and a four-level pair tree growing upward from the column's five nonzero cells (labelled P1..P5) up to the root bucket sum B_{j,k}. Solid edges are pair-sums; dashed edges trace the odd-count carry of P5 across three levels.](diagrams/tensor_cube.svg)

Fix one window $j$ — pull out the slice $M^{(j)}$ shown in blue. That
slice is what §3 (transpose) actually operates on: turning the $(i, k)$
sparsity pattern from row-major (CSR, indexed by $i$ which is what
Booth recoding produced) into column-major (CSC, indexed by $k$ which
is what §4 needs to know "give me all the points in bucket $k$"). The
red column $k = 3$ called out on the slice is one such bucket: five
points $P_1, \ldots, P_5$ land there. The same arithmetic primitive
runs on every $(j, k)$ column — a **pair tree** that folds $N_{j,k}$
points down to one $B_{j,k} = \sum_m P_m$, halving the active count
per level with batched affine addition.

The four-level tree drawn above the slice shows how the $N = 5$
example resolves: solid edges are pair-sums (level 0 → 1 fuses
$(P_1, P_2)$ and $(P_3, P_4)$; level 1 → 2 fuses those two
intermediates), dashed edges trace $P_5$ riding through as an
**odd-count carry** because $N$ is odd at every level until the
root. That's the $N \to \lceil N/2 \rceil$ recurrence of §8.5, where
every level pays *one* batched inversion regardless of how many pairs
it adds. Every bucket in every window of every same-$N$ MSM runs an
instance of this tree concurrently; that's where the throughput comes
from.

---

## 1. Top-level call path

One barretenberg commit batch is a synchronous round-trip across two
threads. The worker (WASM) packs the request and parks itself on
`Atomics.wait`; the main thread (JS, owning the `GPUDevice`) runs the
GPU pipeline and writes the result back through *shared memory*; the
worker wakes and returns to its caller. Three channels move bits:

| Channel | Carries | Direction |
|---|---|---|
| `postMessage('msm_request')` | The wake-up edge that gets the request onto the main thread's event-loop queue | worker → main |
| 16-slot control SAB (§1.1) | Opcode + WASM pointers + return values (`num_windows`, `c`, error code) + the state machine | both directions |
| `Atomics.notify` on `SLOT_STATE` | The wake-up edge that unblocks the worker's `Atomics.wait` | main → worker |
| Shared WASM linear memory | The actual payload — points (when off-SRS), scalars, descriptors, results, meta, labels. Zero-copy at every boundary. | both directions |

The worker-side wake is `postMessage` (not `Atomics.notify`) because
the main thread runs its event loop on message callbacks, not on
`Atomics.wait`. The host-side wake back to the worker is the reverse:
the worker *is* `Atomics.wait`-ing, so `Atomics.notify` does the job.

```
Worker thread (WASM, single-threaded under NO_MULTITHREADING)       │   Main thread (JS, owns the GPUDevice)
─────────────────────────────────────────────────────────────────   │   ─────────────────────────────────────────────────────────────
 1. CommitmentKey::batch_commit                                     │
    ↓                                                               │
 2. MSM::batch_multi_scalar_mul                                     │       (idle, awaiting a message)
    Guard at scalar_multiplication.cpp:545:                         │
       BN254  ∧  !handle_edge_cases  ∧  webgpu_msm_runtime_enabled()│
    ↓                                                               │
 3. batch_multi_scalar_mul_webgpu_bn254                             │
    • marshal_scalars → contiguous WASM-heap region                 │
    • pack descriptors (5 u32 / MSM) in WASM heap                   │
    • call the WASM import                                          │
    ↓                                                               │
 4. WebGpuMsmWorkerStub.callBatchMsm                                │
    • Atomics.store opcode + WASM pointers into SAB slots           │
    • postMessage('msm_request')      ──────────────────────────────▶  5. WebGpuMsmHost.handleMessage
    • Atomics.wait(SLOT_STATE, STATE_REQUEST)                       │      dispatch on SLOT_OPCODE → runBatchMsm
       ⇒ worker parks here                                          │      ↓
                                                                    │  6. Per MSM:
                                                                    │      MsmV2.prepare(scalars, srs_offset)
                                                                    │      MsmV2.encodeIntoBatch(enc, sharedStaging, off_i)
                                                                    │      ↓
                                                                    │  7. device.queue.submit([enc.finish()])
                                                                    │      ↓
                                                                    │  8. await sharedStaging.mapAsync(GPUMapMode.READ)
                                                                    │      ⇒ Montgomery 8×u32 bytes for every MSM's window sums
                                                                    │      ↓
                                                                    │  9. JS host, per MSM:
                                                                    │      • de-Montgomery:   x = (x̃ · R⁻¹) mod q   (and y)
                                                                    │      • writeBigIntLE → shared WASM memory at result_ptr_i
                                                                    │      • write (num_windows, c) → meta region
                                                                    │      ↓
                                                                    │ 10. Atomics.store(SLOT_STATE, STATE_DONE)
   worker wakes from Atomics.wait    ◀────────────────────────────── │      Atomics.notify(SLOT_STATE, 1)
    ↓                                                               │
11. Read each MSM's (num_windows × 64) canonical LE bytes from      │
    shared WASM memory; read (num_windows, c) from the meta region. │
    ↓                                                               │
12. For each MSM:                                                   │
       combine_windows()  (Horner-fold in native bb::g1, Jacobian)  │
    ↓                                                               │
13. Return std::vector<AffineElement> to CommitmentKey::batch_commit│
```

References (every step is verifiable):
- C++ delegation gate: [scalar_multiplication.cpp:545](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/scalar_multiplication.cpp#L545).
- C++ batch driver: [webgpu_msm_hook.cpp:124-306](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_hook.cpp#L124-L306).
- WASM imports declared in [webgpu_msm_hook.hpp:79-116](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_hook.hpp#L79-L116).
- Worker stub callers (`callMsm`, `callBatchMsm`, `callPublishSrs`) at [worker_stub.ts:101, 129, 142](../bridge/worker_stub.ts#L101); all funnel through the shared `signalAndWait`.
- Main-thread dispatcher: [bridge/main.ts:438](../bridge/main.ts#L438) (`runBatchMsm`), [bridge/main.ts:324](../bridge/main.ts#L324) (`runMsm` solo fallback), [bridge/main.ts:221](../bridge/main.ts#L221) (`runPublishSrs`, used once per session — see §2). All three are wrapped by `handleMessage` ([bridge/main.ts:108-118](../bridge/main.ts#L108-L118)), which writes `STATE_DONE` / `STATE_ERROR` and fires the `Atomics.notify`.
- Native Horner combine: [webgpu_msm_marshalling.hpp:104-117](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_marshalling.hpp#L104-L117).

**Same pattern, three opcodes.** The diagram above traces
`OP_BATCH_MSM`, the dominant path (~91 MSMs per Chonk proof packed
into ~6 bridge calls). The two other opcodes — `OP_MSM` for an
off-SRS solo MSM, `OP_PUBLISH_SRS` for the one-time SRS upload (§2) —
use the same SAB control protocol and same signal-and-wait
mechanics, just with a different host-side handler (`runMsm` /
`runPublishSrs`).

### 1.1 The control block

The control block is a single `SharedArrayBuffer` of 16 × i32 slots
(`CTRL_SLOTS = 16`, [protocol.ts:14](../bridge/protocol.ts#L14)).
Request-direction slots are written by the worker pre-`postMessage`
and read by the host inside `handleMessage`; response-direction slots
are written by the host pre-`Atomics.notify` and read by the worker
after wake.

| Slot | Name | Dir | Purpose |
|---|---|---|---|
| 0 | `SLOT_STATE` | ⇄ | `STATE_IDLE / STATE_REQUEST / STATE_DONE / STATE_ERROR` — the actual `Atomics.wait` target |
| 1 | `SLOT_OPCODE` | → | `OP_MSM = 1`, `OP_PUBLISH_SRS = 2`, `OP_BATCH_MSM = 3` |
| 2 | `SLOT_N` | → | $n$ for `OP_MSM`; batch count for `OP_BATCH_MSM` |
| 3 | `SLOT_POINTS_PTR` | → | WASM pointer to points bytes (`OP_MSM`) or descriptors (`OP_BATCH_MSM`); `0` for an SRS-prefix `OP_MSM` |
| 4 | `SLOT_SCALARS_PTR` | → | WASM pointer to scalars bytes (single buffer or batch-concatenated) |
| 5 | `SLOT_RESULT_PTR` | → | WASM pointer to the result region the host will write into |
| 6 | `SLOT_ERROR_CODE` | ← | Filled by host on `STATE_ERROR` |
| 7 | `SLOT_NUM_WINDOWS` | ← | Host writes $T$ after `OP_MSM` |
| 8 | `SLOT_C` | ← | Host writes $c$ after `OP_MSM` |
| 9 | `SLOT_SRS_OFFSET` | → | SRS-prefix offset for `OP_MSM` (point-index, not byte) |
| 10 | `SLOT_BATCH_META_PTR` | → | WASM pointer to the host-fillable `batch_count × (num_windows, c)` meta array |
| 11 | `SLOT_BATCH_LABELS_PTR` | → | Optional per-MSM ASCII labels for telemetry |

(→ = worker writes, host reads. ← = host writes, worker reads.
⇄ = both: it's the state machine.)

Note that **the actual MSM payload is *not* in this SAB.** The slots
just hold pointers into WASM linear memory; the linear memory itself
is the other shared region (it's a `SharedArrayBuffer` under the
threaded WASM build), and both the worker and the main thread access
the same bytes there with no copy.

Per-call worker prologue: store request slots → `postMessage('msm_request')`
→ `Atomics.wait(SLOT_STATE, STATE_REQUEST)` → on wake, read response
slots + result region. The slot-store prologue lives in each `call*`
method ([worker_stub.ts:101-146](../bridge/worker_stub.ts#L101-L146));
the wait + state check is the shared `signalAndWait` they all tail-call.

### 1.2 Concurrency model

The WASM build is single-threaded (`NO_MULTITHREADING`) so blocking on
`Atomics.wait` only stalls the *worker*, not the main UI thread. The
GPU device lives on the main thread; one MSM (or one batch) is in flight
at a time — Pippenger is a per-call function, never reentrant.

---

## 2. One-time setup — uploading the SRS

The Honk/Chonk prover issues dozens of MSMs per proof against the same
SRS. Uploading the points once and reusing them across MSMs is the
single biggest steady-state win — we explicitly want to upload, marshal,
and Montgomery-convert *each SRS point at most once per session*.

### 2.1 C++ registration

When `CommitmentKey` is constructed (or first used for a WebGPU-eligible
MSM), it calls
[`webgpu_register_full_srs_bn254`](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_hook.hpp#L126).
That records the full monomial-points table (`g_full_srs_base`,
`g_full_srs_count`) but does *not* upload the whole thing — it
publishes only an initial prefix of $2^{18} = 262\,144$ points
([webgpu_msm_hook.cpp:39](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_hook.cpp#L39)).
That's $\sim 16$ MiB of canonical bytes, $\sim 16$ MiB of GPU memory
after Montgomery conversion, and is empirically large enough that the
canonical Chonk flows (largest commit $\sim 88\,899$) never trigger a
re-upload.

If a later commit needs more, the dispatcher
([webgpu_msm_hook.cpp:147-183](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_hook.cpp#L147))
walks the batch *before* delegating any MSM, finds
$\max_i (\text{srs\_offset}_i + n_i)$, and doubles the published prefix
until it covers that bound. So a session that eventually reaches the
SRS top pays $O(\log N)$ re-uploads, not one per MSM.

### 2.2 Marshalling

The published bytes are produced by
[`marshal_points`](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_marshalling.hpp).
Each point is serialized as **64 little-endian bytes, non-Montgomery,
$[x\,(32)\,\Vert\,y\,(32)]$**. The C++ side holds points in Montgomery
form internally; marshalling decomposes back to canonical so the JS
side has the same baseline regardless of build flavor. Points at
infinity marshal as $(0, 0)$ — read back symmetrically by
[`read_affine_le`](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_marshalling.hpp#L81).

### 2.3 The bridge `OP_PUBLISH_SRS` op

`bb_publish_srs_bn254(points_ptr, n)` triggers `OP_PUBLISH_SRS` on the
host. The host destroys any previously-uploaded pool, copies the
$n \times 64$ canonical bytes out of WASM memory, and calls
`MsmV2Pool.create(device, srsCanonicalBytes)` at
[msm_v2.ts:848](../msm_v2.ts#L848).

### 2.4 GPU Montgomery conversion

`MsmV2Pool.create` does not upload pre-converted coordinates; it does
the Montgomery conversion **on the GPU** in one dispatch
([msm_v2.ts:848-934](../msm_v2.ts#L848-L934)):

1. Write the input bytes into two storage buffers (`firstHalf`,
   `secondHalf`) — split because WebGPU's per-binding storage-buffer
   size limit is 128 MiB on most adapters, and at $n = 2^{20}$ the
   $64\,\text{MiB}$ input would be fine but the split keeps headroom
   for future growth.
2. Allocate two output buffers, one per coordinate plane (`poolX`,
   `poolY`), each $n \times 32$ bytes of Montgomery-form $\mathbb{F}_q$
   in 8×u32 packed layout.
3. Dispatch `convert_points_only` ([wgsl/cuzk/convert_points_only.template.wgsl](../wgsl/cuzk/convert_points_only.template.wgsl)).
   Each thread reads one canonical point, multiplies by $R \bmod q$,
   writes the result in the pool's 8×u32 layout. Bounds-guarded so
   non-power-of-two `srsN` is safe.
4. Submit + `onSubmittedWorkDone()` to flush. Free the input staging
   buffers.

The pool from here on holds points in the form

$$
\tilde P_i = (\tilde x_i,\, \tilde y_i)
\quad\text{with}\quad
\tilde x_i = x_i\,R \bmod q,\;\; \tilde y_i = y_i\,R \bmod q
$$

stored as two 8×u32 buffers `poolX[i]`, `poolY[i]`. Every subsequent
MSM that needs $P_i$ reads exactly these bytes — no per-MSM
conversion, no per-MSM CPU→GPU upload of point bytes.

### 2.5 Prefix-of-SRS addressing

Different polynomials commit to different prefixes of the SRS
(`start_index` differs per polynomial). MsmV2 supports this with an
`srs_offset` baked into the conversion layout
([wgsl/cuzk/csr_to_v2_active_sums.template.wgsl:36-40](../wgsl/cuzk/csr_to_v2_active_sums.template.wgsl#L36-L40)):

$$
\text{slot}_k \;\longrightarrow\; P_{\text{srs\_offset} + \text{val\_idx}[k]}.
$$

So a single uploaded pool serves every commit. The C++ side detects
"is the points buffer for this MSM inside `g_published_srs_base`?" by
range check + byte alignment, computes `srs_offset` as the point-index
difference, and passes it across the bridge in `SLOT_SRS_OFFSET`
([webgpu_msm_hook.cpp:219-243](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_hook.cpp#L219-L243)).
Off-SRS commits (rare once the monomial-points SRS is registered)
fall through to a one-off pool built per MSM.

---

## 3. Per-batch dispatch (`OP_BATCH_MSM`)

A single `CommitmentKey::batch_commit` typically issues $\sim 10$ MSMs
in one batch. The C++ hook packs them into one bridge call to amortize
the dominant per-call cost (Chrome's `mapAsync` polling: $\sim 10$–$30$
ms each).

### 3.1 C++ side

[`batch_multi_scalar_mul_webgpu_bn254`](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_hook.cpp#L124-L306)
performs a 3-pass dance:

- **Pass 1**: walk the batch, decide per-MSM:
  - `n < 2^{14}` (default `WEBGPU_MSM_THRESHOLD`)? → run inline on the
    native Pippenger.
  - Off-SRS points? → single per-MSM `bb_external_msm_bn254` call.
  - SRS-prefix? → add to the batch descriptor table.
- **Pass 2**: allocate `descriptors / scalars_packed / results_packed
  / meta / labels_packed` regions in the WASM heap. Marshal each
  in-batch MSM's scalars into the contiguous region. Fire ONE
  `bb_external_batch_msm_bn254` call.
- **Pass 3**: for each in-batch MSM, read `meta[k] = (num_windows, c)`
  and call `combine_windows(results_packed + offset, num_windows, c)`
  to Horner-fold the per-window sums into the final
  `AffineElement`.

The descriptor layout is 5 × u32 = 20 bytes per MSM:
$(n,\;\text{srs\_offset},\;\text{scalars\_byte\_off},\;\text{result\_byte\_off},\;\text{reserved})$
([webgpu_msm_hook.hpp:88-95](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_hook.hpp#L88-L95)).

### 3.2 JS host side

`WebGpuMsmHost.runBatchMsm` ([main.ts:438](../bridge/main.ts#L438))
decodes descriptors and labels, then picks an encoder strategy at
[main.ts:538](../bridge/main.ts#L538):

$$
\text{hasSameNCollision} \;=\; \max_n |\{i : n_i = n\}| > 1.
$$

- **No collision** (each $n$ unique within the batch): one command
  encoder, all MSMs' passes back-to-back, one `submit()`, one shared
  staging buffer, one `mapAsync`. The cheapest path.
- **Collision** (≥2 MSMs share an $n$): they would clobber each other's
  `scalarsRawBuf` inside one encoder
  ([main.ts:484-495](../bridge/main.ts#L484-L495) explains why). Fall
  back to per-MSM `submit` + per-MSM mapAsync, but kick off all
  submits first then `Promise.all` the mapAsyncs — Chrome's polling
  cycle is shared across them.

A previous "slot-pool" experiment routed same-N MSMs through distinct
`MsmV2` instances to enable single-encoder same-N batching; it was
reverted because per-instance allocation cost (≈80–100 ms each)
overwhelmed the savings ([main.ts:525-537](../bridge/main.ts#L525-L537)).
The vestigial `slotPools` field + `getOrCreateMsmSlot` helper remain
but are not on the live path.

---

## 4. The per-MSM pipeline — overview

For one MSM, the host does two phases:

- **`prepare(scalarsBuf, srsOffset)`** — UNTIMED ([msm_v2.ts:1405](../msm_v2.ts#L1405)):
  Booth-decode scalars on the host, plan every pair-tree level, allocate
  data-dependent buffers, write uniforms. Cached on `scalarsBuf` identity.
- **`encodeIntoBatch(enc, dstStaging, dstByteOff)`** — issues the GPU
  passes ([msm_v2.ts:2061](../msm_v2.ts#L2061)). Listed in §5.

Both phases together implement, per MSM:

$$
\underbrace{
\bigl\{\,s_i \mapsto s_{i,j}\,\bigr\}
}_{\text{Booth recode, §6}}
\;\longrightarrow\;
\underbrace{
\bigl\{\,\text{group $i$'s by bucket}\,\bigr\}
}_{\text{transpose, §7}}
\;\longrightarrow\;
\underbrace{
\bigl\{\,B_{j,k}\,\bigr\}
}_{\text{pair tree, §8}}
\;\longrightarrow\;
\underbrace{
W_j
}_{\text{reduction, §9}}
\;\longrightarrow\;
\underbrace{
S
}_{\text{Horner, §10}}
$$

The GPU dispatches happen in the exact order listed at
[msm_v2.ts:2115-2152](../msm_v2.ts#L2115-L2152):

```
For each "batch of windows" bi  (window-batching is Lever G):
  decompose            // §6
  xpose_count          ┐
  xpose_reduce         │ §7
  xpose_scan           │
  xpose_scatter        ┘
  conv_active          ┐
  conv_meta            ┘ §8.0 (layout)
  For each pair-tree level lv = 0..levels-1:
    planner_a (offsets) ┐
    planner_b (emit)    │ §8.1
    fused_super (× tiles) │
    carry_copy          │
    finalize_copy       ┘
reduce_init              ┐ §9
reduce_level (× passes)  ┘
[copy per-window sums to staging]
```

---

## 5. Stage 1 — carry-free Booth decompose

**Input**: $n$ scalars in 32-byte LE canonical (non-Montgomery) form,
sitting in WASM memory at `scalarsPtr`.
**Output**: a `bucket_and_sign` array of $T \times n$ u32 entries, one
per `(window, point)`.

### 5.1 The signed digit

For window $j$ and scalar $s$, MsmV2 uses a *carry-free signed Booth
recoding* in which the digit $s_j$ is a **pure function of $c+1$ bits**
of $s$ — the window's own $c$ bits plus the high bit of the window
immediately below ("lookback bit", taken as $0$ for $j = 0$).

Define the two raw inputs:

$$
\text{winBits}_j \;=\; \Bigl\lfloor \frac{s}{2^{jc}} \Bigr\rfloor \bmod 2^c,
\qquad
\text{lookback}_j \;=\;
\begin{cases}
0 & j = 0, \\[2pt]
\Bigl\lfloor \dfrac{s}{2^{jc - 1}} \Bigr\rfloor \bmod 2 & j \ge 1.
\end{cases}
$$

The digit is built in two steps. First an unsigned $\text{encode}$
(always in $[0, 2^c]$); then the high bit of $\text{winBits}_j$
decides the sign:

$$
\text{encode}_j \;=\; \text{winBits}_j + \text{lookback}_j,
\qquad
\text{neg}_j \;=\; \Bigl\lfloor \frac{\text{winBits}_j}{2^{c-1}} \Bigr\rfloor \;\in\; \{0, 1\}.
$$

$$
\text{bucket}_j \;=\;
\begin{cases}
\text{encode}_j & \text{if } \text{neg}_j = 0, \\
2^c - \text{encode}_j & \text{if } \text{neg}_j = 1,
\end{cases}
\qquad
s_j \;=\; (-1)^{\text{neg}_j}\, \text{bucket}_j.
$$

Then $\text{bucket}_j \in [0, 2^{c-1}]$ and $s_j \in [-2^{c-1}, +2^{c-1}]$.

**Why "carry-free".** A naive signed recoder would, after deciding
$\text{neg}_j$, propagate a +1 carry into window $j+1$'s value. Here
that carry is read *directly off the scalar*: bit $jc - 1$ of $s$ is
simultaneously the high bit of $\text{winBits}_{j-1}$ (i.e.
$\text{neg}_{j-1}$) and the input $\text{lookback}_j$. So
$\text{lookback}_j = \text{neg}_{j-1}$, but window $j$ reads it from
the scalar without waiting on window $j-1$ — every $(i, j)$ digit is
computable in isolation, which is what makes the GPU shader
embarrassingly parallel.

**Exactness.** Provided $Tc > \lambda$ (the top window has at least
one padding bit above the scalar's high bit, so $\text{neg}_{T-1} = 0$),
the recoding is an *integer* identity:

$$
s \;=\; \sum_{j=0}^{T-1} s_j \cdot 2^{jc}.
$$

For BN254 with $\lambda = 254$ and every $c \in \{4, 5, 8, 10, 13, 15\}$
from `pickC` ([msm_v2.ts:372-389](../msm_v2.ts#L372-L389)), $Tc \in
\{255, 256, 260\}$ — always at least one padding bit, so the identity
always holds.

**Worked example.** $c = 3$, $s = 31 = (011111)_2$, $T = 2$ windows
(top bit is $0$, so exactness condition holds):

| $j$ | $\text{winBits}_j$ | $\text{lookback}_j$ | $\text{neg}_j$ | $\text{encode}_j$ | $\text{bucket}_j$ | $s_j$ |
|---|---|---|---|---|---|---|
| 0 | $7 \;=\; (111)_2$ | $0$ (no window below) | $1$ (top bit of $7$) | $7 + 0 = 7$ | $2^3 - 7 = 1$ | $-1$ |
| 1 | $3 \;=\; (011)_2$ | $1$ (bit $2$ of $s$) | $0$ (top bit of $3$) | $3 + 1 = 4$ | $4$ | $+4$ |

Check: $s_0 \cdot 2^0 + s_1 \cdot 2^3 = -1 + 4 \cdot 8 = 31 = s$. ✓

The example shows the carry chain at work. Window $0$'s
$\text{neg}_0 = 1$ implicitly "borrows" $2^3$ from window $1$
($-1 = 7 - 8$). Window $1$'s $\text{lookback}_1 = 1$ — read directly
from bit $2$ of $s$, *not* communicated from window $0$ — pays the
borrow back by bumping its encode from $3$ to $4$. The net is the
correct $s = 31$, computed without any sequential carry pass.

**Host vs GPU.** Same recoding, two implementations that mirror each
other:

- Host: `boothDigit` at [msm_v2.ts:159](../msm_v2.ts#L159), called
  during `prepare()` to build the level-0 bucket histogram
  ([msm_v2.ts:187-220](../msm_v2.ts#L187-L220)).
- GPU: [wgsl/cuzk/decompose_scalars_booth.template.wgsl](../wgsl/cuzk/decompose_scalars_booth.template.wgsl).
  One thread per $(j, i)$.

Both compute $\text{bucket}_j$ via the two's-complement trick
`((encode - neg) ^ negMask) & ((1<<c) - 1)` (where
`negMask = neg ? 0xffffffff : 0`) — algebraically equivalent to the
case-split above, just expressed for unsigned integer ALUs.

### 5.2 Packing

The bucket + sign are packed into a single u32 to halve the working set
([decompose_scalars_booth.template.wgsl:12-17](../wgsl/cuzk/decompose_scalars_booth.template.wgsl#L12-L17)):

$$
\text{entry}_{j,i} \;=\; (\text{neg}_{j,i} \ll 31)\;\vert\;\text{bucket}_{j,i}.
$$

The sign sits at bit 31 (a literal) rather than at bit $c$ (a uniform)
because Adreno's WGSL compiler is unreliable for runtime shift amounts
— Tint folds a constant shift cleanly on every driver. Since
`pickC()` caps $c$ at $15$, bits $[15,30]$ are unused but harmless.

---

## 6. Stage 2 — tiled counting-sort transpose

### 6.1 What's being transposed

The Booth pass leaves us with the *point-major* table

$$
\text{bucket\_and\_sign}[j \cdot n + i] \;=\; \text{entry}_{j,i}
\qquad (j \in [0, T),\; i \in [0, n)),
$$

a $T \times n$ matrix indexed *by point*: row $j$ enumerates the points
in window $j$'s natural order, each annotated with its bucket. But
Stage 3 (bucket accumulation) needs the inverse view: *bucket-major*,
where for every $(j, k)$ we have the list of points whose digit
$s_{i, j}$ landed in bucket $k$.

In sparse-matrix terms this is a **CSR → CSC transpose**. Treating
$\text{entry}_{j,i}$ as a sparse-matrix nonzero at "row $j$, column =
its bucket", the natural enumeration is CSR (we know the row, we scan
the entries). Stage 3 wants CSC (we know the column / bucket, we want
the row / point indices). Per window $j$, define:

$$
N_j[k] \;=\; |\{ i : \text{bucket}_{i,j} = k \}|,
\qquad
\text{colPtr}_j[k] \;=\; \sum_{\ell < k} N_j[\ell].
$$

Stage 2's output is, per window $j$:

- `colPtr[j][k]` for $k \in [0, B_W]$ — where bucket $k$'s slots live.
- `valIdxs[j][s]` for $s \in [0, n)$ — at slot $s$, the *point index*
  $i$ whose entry landed there. Entries with bucket $k$ occupy
  $s \in [\text{colPtr}_j[k],\; \text{colPtr}_j[k+1])$.

Here $B_W$ is the bucket-index space: $2^{c-1} + 1$ valid values
(including the zero-digit slot $k = 0$), rounded up to a multiple of
$\text{PLANNER\_TPB} = 256$ for alignment ([msm_v2.ts:1175](../msm_v2.ts#L1175)).

### 6.2 Counting sort, four-pass parallel

MsmV2 produces the CSC view with a **counting sort**, executed in
four GPU dispatches. The serial version is textbook:

1. **Count** each bucket's occurrences:    $N_j[k] \mathrel{+}= 1$ for each entry.
2. **Scan** to exclusive prefix:          $\text{colPtr}_j[k] = \sum_{\ell < k} N_j[\ell]$.
3. **Scatter**: walk the entries again; for each $(j, i)$ with bucket
    $k$, place $i$ at the next free slot starting from $\text{colPtr}_j[k]$.

On the GPU the count phase is the contention bottleneck — $n$ threads
all atomic-incrementing into the same $B_W$ histogram slots. Two
techniques cut that:

- **Privatization** — each *workgroup* (a small group of GPU threads
  on the same compute unit) keeps its own histogram in
  *workgroup-shared memory*. Atomic adds become cheap (on-chip,
  hardware-fast). The per-workgroup histograms are then summed across
  workgroups in a separate reduce pass.
- **Tiling over points** — instead of one workgroup per window, the
  $n$ points are split into $\sim B_W$-wide "tiles" of point indices.
  Each workgroup handles one (window, point-tile) pair. With one tile
  holding $\sim B_W$ entries across $B_W$ buckets, the shared-atomic
  contention per slot is on average **1-deep** — essentially
  contention-free.

This is the change in commit `83980f1930`
("tiled counting-sort transpose — fix the superlinear MSM scaling"):
the previous variant privatized per-workgroup but did not tile across
the point axis, so each window's workgroup serially walked all $n$
entries — the count phase scaled superlinearly in $n$ because GPU
occupancy was bottlenecked on the per-window workgroup count. Tiling
recovers $O(n)$ scaling.

### 6.3 The four dispatches

Driven from [msm_v2.ts:2120-2123](../msm_v2.ts#L2120-L2123). Throughout,
the entries' sign bit (bit 31) is masked off — only the bucket index
addresses the CSC.

**Pass 1 — `xpose_count_tiled`** ([wgsl/cuzk/transpose_count_tiled.template.wgsl](../wgsl/cuzk/transpose_count_tiled.template.wgsl)).
Dispatch shape: `(numPointTiles, T)`. Each workgroup `(t, j)`:
1. Zero a shared histogram $\text{hist}[0 \ldots \text{TILE}-1]$.
2. Walk the tile's point-index range; `atomicAdd(&hist[bucket], 1)`
   for each entry whose bucket falls into the current bucket
   sub-window.
3. Store the histogram to global memory:
   $\text{partials}[(j, t, k)] = \text{hist}[k]$.

When the bucket count $B_W$ exceeds the shared histogram capacity
$\text{TILE} = \min(B_W,\; 8192)$, the kernel covers $B_W$ in
$\lceil B_W / \text{TILE} \rceil$ *bucket sub-tiles*, re-scanning the
point tile for each. For all `pickC` values $c \le 13$ this is one
pass; only $c = 15$ triggers a second sub-tile.

**Pass 2 — `xpose_reduce_tiled`** ([wgsl/cuzk/transpose_reduce_tiled.template.wgsl](../wgsl/cuzk/transpose_reduce_tiled.template.wgsl)).
Dispatch shape: `(ceil(B_W / 256), T)`. Each thread owns one
$(j, k)$ pair. It walks $t = 0 \ldots \text{numPointTiles}-1$ in order
and computes both:

- the running prefix $\text{partials}[(j, t, k)] \leftarrow \sum_{t' < t} \text{partials}_0[(j, t', k)]$ — the *point-tile-exclusive prefix* (written in-place over the old per-tile counts),
- the total bucket count $N_j[k]$ — written to $\text{colPtr}[(j, k+1)]$ (slot $k+1$ of the row, with slot $0$ left at $0$).

The reduce phase is what later lets the scatter kernel compute each
entry's global slot in *constant* time without atomic-adding into a
shared global write cursor.

**Pass 3 — `xpose_scan`** ([wgsl/cuzk/transpose_parallel_scan.template.wgsl](../wgsl/cuzk/transpose_parallel_scan.template.wgsl)).
Dispatch shape: `(batchWindows, 1)`. One workgroup per window, 256
threads. Standard 3-phase chunked Hillis–Steele scan that turns the
per-window row of $N_j[\cdot]$ counts into the exclusive prefix
$\text{colPtr}_j[\cdot]$. After:
$$
\text{colPtr}[(j, k)] \;=\; \sum_{\ell < k} N_j[\ell] \quad\text{for } k \in [0, B_W],
\qquad
\text{colPtr}[(j, B_W)] \;=\; n.
$$

**Pass 4 — `xpose_scatter_tiled`** ([wgsl/cuzk/transpose_scatter_tiled.template.wgsl](../wgsl/cuzk/transpose_scatter_tiled.template.wgsl)).
Dispatch shape: `(numPointTiles, T)`, mirroring Pass 1. Each workgroup
$(t, j)$ re-scans its point tile; for every entry $(j, i)$ with bucket
$k$, it places $i$ into the CSC's `valIdxs` array at:

$$
\text{slot}_{j,i} \;=\;
\underbrace{\text{colPtr}[(j, k)]}_{\text{bucket } k\text{'s window-global start}}
\;+\;
\underbrace{\text{partials}[(j, t, k)]}_{\text{point-tile-exclusive offset}}
\;+\;
\underbrace{\text{curr}[k]}_{\text{within-tile cursor}}.
$$

The within-tile cursor `curr[k]` is the only atomic in this kernel,
and it's *workgroup-shared*: cheap and contention-bounded by tile
size. Each slot in `valIdxs` is written exactly once.

### 6.4 Worked example

One window ($T = 1$), $c = 3$, $n = 6$, $B_W = 4$ (ignoring the
PLANNER_TPB rounding for clarity). Suppose the Booth-decompose
produced the entries (= bucket indices, with sign bits dropped):

$$
\text{bucket\_and\_sign}[0 \ldots 5] \;=\; [\,2,\; 0,\; 1,\; 2,\; 3,\; 1\,].
$$

Counts: $N[0] = 1,\; N[1] = 2,\; N[2] = 2,\; N[3] = 1$.

Tile the points into two: $\text{tile}_0 = \{0, 1, 2\}$,
$\text{tile}_1 = \{3, 4, 5\}$ ($\text{numPointTiles} = 2$,
$\text{pointsPerTile} = 3$).

**Pass 1 — count.** Per tile per bucket:

| | bucket 0 | bucket 1 | bucket 2 | bucket 3 |
|---|---|---|---|---|
| tile 0 (pts 0–2, buckets $2,0,1$) | $1$ | $1$ | $1$ | $0$ |
| tile 1 (pts 3–5, buckets $2,3,1$) | $0$ | $1$ | $1$ | $1$ |

**Pass 2 — reduce.** For each bucket $k$, walk tiles in order; rewrite
each tile's slot to the *exclusive* point-tile prefix, write the
column total to `colPtr[k+1]`. Slot 0 of `colPtr` stays at 0
(host-zeroed).

| | bucket 0 | bucket 1 | bucket 2 | bucket 3 |
|---|---|---|---|---|
| partials[tile 0] | $0$ | $0$ | $0$ | $0$ |
| partials[tile 1] | $1$ | $1$ | $1$ | $0$ |
| total → `colPtr[k+1]` | $1$ | $2$ | $2$ | $1$ |

`colPtr` after Pass 2 (before scan): $[0,\; 1,\; 2,\; 2,\; 1]$.

**Pass 3 — scan.** Exclusive prefix sum of `colPtr` over $k$:

$$
\text{colPtr} \;=\; [\,0,\; 1,\; 3,\; 5,\; 6\,].
$$

So bucket $k$'s entries live in slots $[\text{colPtr}[k],
\text{colPtr}[k+1])$ of `valIdxs`.

**Pass 4 — scatter.** Per workgroup, per point, computing
$\text{slot} = \text{colPtr}[k] + \text{partials}[(t, k)] + \text{curr}[k]$:

| Tile | Point $i$ | Bucket $k$ | $\text{colPtr}[k]$ | tile-prefix | within-tile | slot | write |
|---|---|---|---|---|---|---|---|
| 0 | $0$ | $2$ | $3$ | $0$ | $0$ | $3$ | $\text{valIdxs}[3] = 0$ |
| 0 | $1$ | $0$ | $0$ | $0$ | $0$ | $0$ | $\text{valIdxs}[0] = 1$ |
| 0 | $2$ | $1$ | $1$ | $0$ | $0$ | $1$ | $\text{valIdxs}[1] = 2$ |
| 1 | $3$ | $2$ | $3$ | $1$ | $0$ | $4$ | $\text{valIdxs}[4] = 3$ |
| 1 | $4$ | $3$ | $5$ | $0$ | $0$ | $5$ | $\text{valIdxs}[5] = 4$ |
| 1 | $5$ | $1$ | $1$ | $1$ | $0$ | $2$ | $\text{valIdxs}[2] = 5$ |

Final:
$$
\text{valIdxs} \;=\; [\,1,\; 2,\; 5,\; 0,\; 3,\; 4\,].
$$

Read it through the `colPtr` boundaries to recover the bucket-major
view:

- bucket $0$: $\text{valIdxs}[0\ldots1) = \{1\}$ (point 1 → zero
  digit; skipped downstream).
- bucket $1$: $\text{valIdxs}[1\ldots3) = \{2, 5\}$.
- bucket $2$: $\text{valIdxs}[3\ldots5) = \{0, 3\}$.
- bucket $3$: $\text{valIdxs}[5\ldots6) = \{4\}$.

That's exactly the bucket-major grouping Stage 3 needs. Note that the
*within-tile* cursors (`curr[k]`) stayed at 0 throughout this example —
because no tile had two points landing in the same bucket. They start
incrementing when a tile has multiple entries with the same bucket;
that's where the per-tile atomic on shared memory pays off.

---

## 7. Stage 3 — layout conversion (`csr_to_v2`)

Stage 2 produced the CSC view of who's in what bucket: a sequence of
point indices grouped bucket-by-bucket, with `colPtr` marking the
boundaries. Stage 4 (the pair tree) wants the same information through
*its own* data structures: a flat `active_sums` buffer holding each
bucket's points, plus two small arrays — `activeCounts` and
`activeOffsets` — that tell its planner where every bucket starts and
how many entries it has.

Stage 3 does that translation in two dispatches. Neither computes
anything new; both repackage what Stage 2 produced into the layout
Stage 4 reads. The work is purely data movement (one read, one write
per slot), so the dispatches are memory-bandwidth bound.

### 7.1 `csr_to_v2_active_sums` — the points buffer

[wgsl/cuzk/csr_to_v2_active_sums.template.wgsl](../wgsl/cuzk/csr_to_v2_active_sums.template.wgsl).
One thread per *slot* (a slot is a position in the bucket-major
sequence — $T \cdot n$ of them total across all windows). Each thread:

1. Reads $\text{pt\_idx} = \text{valIdxs}[\text{slot}]$ — the original
   point index whose Booth digit landed in this slot's bucket.
2. Reads the digit's sign bit from
   $\text{bucketAndSign}[(j, \text{pt\_idx})]$ (bit 31).
3. Writes the corresponding point's data into
   $\text{activeSums}[\text{slot}]$, selecting $-y$ if the sign was
   negative.

Step 3 has two implementations, picked at shader-generation time by
the `index_mode` flag.

**Default mode — materialize the point.** Copy the full 64 bytes
$(\tilde x, \tilde y)$ in 8×u32 Montgomery form from the SRS pool.
When the sign is negative, $y$ is sourced from `new_point_y_neg` (the
precomputed $-y$ plane); the pool holds both versions, so negation is
just a buffer-selection.

The buffer is **two-plane SoA**: plane 0 holds every slot's $x$,
plane 1 holds every slot's $y$, with each coordinate taking 32 bytes
(8 u32, one Montgomery field element). Stage 4's fused kernel reads
$x_1, x_2$ contiguously from plane 0 to compute $\delta = x_2 - x_1$,
then $y_1, y_2$ from plane 1 — like coordinates stay together,
cache-friendly for the affine-add inner loop.

**Lever B (`index_mode`) — write a handle instead.** At level 0 only,
each slot is collapsed from 64 bytes to 4 bytes:

$$
\text{activeSums}[\text{slot}] \;=\; (\text{pt\_idx} + \text{srsOffset}) \;\big|\; (\text{neg} \ll 31).
$$

The bottom 31 bits hold the point's global index in the SRS pool, bit
31 holds the sign. Downstream level-0 kernels (fused super,
carry-copy, finalize-copy in §8) dereference this on the fly: read the
index, fetch $\tilde x$ and $\tilde y$ (or $-\tilde y$) from the pool,
do their arithmetic in registers. The `srsOffset` is baked in *here*,
so those kernels gather from `pool[index]` without re-applying any
polynomial's `start_index`.

The win is $16\times$ less memory at level 0, at the cost of one
indirection per pair that the fused kernel already holds live in
registers anyway. Level 0 is by far the widest level (~$n$ slots), so
the bandwidth saving is real. Levels $\ge 1$ contain *sums* of points
and have no compact handle to point at, so they fall back to the
default mode.

### 7.2 `csr_to_v2_meta` — counts and offsets for the planner

[wgsl/cuzk/csr_to_v2_meta.template.wgsl](../wgsl/cuzk/csr_to_v2_meta.template.wgsl).
One thread per $(j, k)$ pair. Each thread reads two adjacent `colPtr`
entries and emits two values:

$$
\text{activeCounts}[(j, k)] \;=\; \text{colPtr}_j[k+1] - \text{colPtr}_j[k] \;=\; N_j[k],
$$

$$
\text{activeOffsets}[(j, k)] \;=\; j \cdot n + \text{colPtr}_j[k].
$$

`activeCounts` is the bucket's level-0 size — the number of points the
pair tree needs to fold down for $(j, k)$. `activeOffsets` is the
corresponding *global* starting position in `active_sums`: window $j$'s
slots live in the $j$-th $n$-sized block of `active_sums`, so the
global index is window-base plus the window-local `colPtr` value the
transpose produced. The globalization saves the planner from having
to add window offsets itself in its inner loop.

Both arrays feed directly into the level-0 planner (§8.3). Levels
$\ge 1$ generate their own `activeCounts` and `activeOffsets` from
the previous level's residual, so this dispatch only runs once per
window-batch — at the level-0 boundary.

---

## 8. Stage 4 — pair-tree bucket accumulate

This is the algorithmic core. For each bucket $(j, k)$ with $N_{j,k}$
active points, build $B_{j,k} = \sum P_i$ by tree reduction: each level
halves $N_{j,k}$ via affine addition.

### 8.1 The affine identity + Montgomery's trick

One affine add on a short-Weierstrass curve with $a=0$:

$$
\mu = \frac{y_2 - y_1}{x_2 - x_1},
\qquad
x_3 = \mu^2 - x_1 - x_2,
\qquad
y_3 = \mu(x_1 - x_3) - y_1.
$$

Naively each add costs one inversion $\lvert I \rvert$. Montgomery's
prefix-product trick amortizes over $m$ pairs:

$$
\pi_k = \prod_{j \le k} (x_{2,j} - x_{1,j}),
\qquad
\rho_m = \pi_m^{-1},
\qquad
\delta_k^{-1} = \pi_{k-1}\,\rho_k\;\;\text{(via back-substitution)}.
$$

so $m$ adds amortize over one inversion at cost
$3\lvert M \rvert + \lvert I \rvert / m$ per pair.

**MsmV2 uses a small $m = S \in \{2, 4, 8\}$** (chosen by `pickS(n)`,
[msm_v2.ts:396-399](../msm_v2.ts#L396-L399)) — *not* the
$m \approx 1024$ that the WASM Pippenger uses. Two reasons:

1. **Register budget.** Holding $m$ field elements live across the
   forward prefix-product → inversion → backward peel exceeds the GPU
   register file for large $m$ and forces spills. Small $S$ keeps the
   inner-loop state in registers, which the WGSL compiler can schedule
   without spilling on every vendor.
2. **Parallelism dominates amortization.** WASM Pippenger has one
   thread per partition — it must amortize inversion across hundreds
   of pairs to be competitive. MsmV2 has thousands of threads (one
   `pair_block` per thread) and runs them concurrently; the per-pair
   inversion cost is hidden by parallelism, not by amortization.

The per-pair $|I|/m$ term is therefore higher than the textbook
analysis suggests, but the *aggregate throughput* per unit GPU time
is much higher.

### 8.2 Pair tree on a single bucket

For a bucket with $N$ entries, the tree has $\lceil \log_2 N \rceil$
levels. Each level reads pairs from `active_sums_old`, writes sums to
`active_sums_new`, and propagates the leftover (when $N$ is odd) to the
next level via a carry-copy.

Define $N \mapsto (\text{pc}, \text{cf}, \text{nc})$ at
[msm_v2.ts:151-155](../msm_v2.ts#L151-L155):

$$
\text{pc} = \lfloor N/2 \rfloor,
\qquad
\text{cf} = \begin{cases}0 & N = 1 \\ N \bmod 2 & \text{otherwise}\end{cases},
\qquad
\text{nc} = \text{pc} + \text{cf}.
$$

`pc` is the number of new pair-sums this level produces; `cf` is 1 iff
the bucket has an odd count that needs to be carried forward; `nc` is
the active count at the next level. A singleton bucket (`N=1`)
finalizes immediately (no carry, no further work).

### 8.3 Planner — bin-packing pairs into fused chunks

Across all buckets in a window, total pairs at this level is
$P_j = \sum_k \text{pc}_{j,k}$. The fused affine-add kernel processes
**$S$ pairs per thread**, each sharing one batched inversion (default
`S = pickS(n)`). So we need $\lceil P_j / S \rceil$ threads per window;
to keep the dispatch shape uniform across windows, the dispatch X-dim
is sized to the *max* over windows ($\text{pair\_blocks\_per\_window}$,
[msm_v2.ts:228](../msm_v2.ts#L228)).

The bin-packing — which pairs come from which buckets, where their
result goes in `active_sums_new` — is done in two GPU passes
(split for parallelism in commit `0999593b2a`):

- **`ba_planner_v2_offsets`** ([wgsl/cuzk/ba_planner_v2_offsets.template.wgsl](../wgsl/cuzk/ba_planner_v2_offsets.template.wgsl)) —
  one workgroup per window. Per-thread tally of $(\text{pc},
  \text{cf}, \text{nc})$ per bucket; workgroup Hillis-Steele scan gives
  per-bucket prefix offsets. Output: `new_counts`, `new_offsets`,
  `carry_off`, plus the per-window `plan_meta` totals that drive
  indirect dispatch sizing.
- **`ba_planner_v2_emit`** — emits the actual per-thread plans:
  `pair_block_plan` (2S source indices per pair_block — left + right
  operands), `scatter_plan` (S destination indices per pair_block in
  `active_sums_new`), `carry_plan` (source/destination pairs for the
  odd-count carries).

### 8.4 Fused super kernel (the bucket accumulate hot path)

`ba_fused_super_bench` ([wgsl/cuzk/ba_fused_super_bench.template.wgsl](../wgsl/cuzk/ba_fused_super_bench.template.wgsl))
does, per thread $t$ (one thread = one pair_block of $S$ pairs):

1. Read $2S$ source indices and $S$ destination indices from the plan.
2. Load $S$ pair-x deltas, $\delta_k = x_{2,k} - x_{1,k}$, and the
   running forward product $\pi_k = \pi_{k-1} \cdot \delta_k$.
3. **One** field inversion: $\rho_S = \pi_S^{-1}$. Variant set by
   `MsmConfig.invVariant` (default `'pk'`, the packed-2×13 safegcd —
   see §11.3).
4. **Backward peel**: for $k = S{-}1$ down to $0$,
   $$
   \delta_k^{-1} = \rho_{k+1}\,\pi_{k-1},
   \qquad
   \rho_k = \rho_{k+1}\,\delta_k,
   $$
   and compute the affine sum:
   $$
   \mu_k = (y_{2,k} - y_{1,k})\,\delta_k^{-1},
   \quad
   x_{3,k} = \mu_k^2 - x_{1,k} - x_{2,k},
   \quad
   y_{3,k} = \mu_k(x_{1,k} - x_{3,k}) - y_{1,k}.
   $$
5. Write $(x_{3,k}, y_{3,k})$ to `active_sums_new[scatter_plan[t*S +
   k]]`. **No** point-equality fallback: relies on the production
   contract (SRS-backed inputs, no $P = \pm Q$ collisions).

All field arithmetic uses 8×u32 "live form" (§11.2) so the register
pressure is bounded.

### 8.5 Carry-copy and finalize

- **`ba_carry_copy_bench`** ([wgsl/cuzk/ba_carry_copy_bench.template.wgsl](../wgsl/cuzk/ba_carry_copy_bench.template.wgsl))
  copies each odd-count bucket's leftover point from
  `active_sums_old[carry_plan[2t]]` to
  `active_sums_new[carry_plan[2t+1]]`. Pure memory shuffle (at L0 the
  copy materializes the point from the pool and applies the sign).
- **`ba_finalize_copy_bench`** — for buckets that have just become
  singletons (`nc = 1`), copy their value into the `bucket_result`
  staging region. These are the final $B_{j,k}$ values that feed Stage
  5.

#### Putting one level together

Let $N^{(\ell)}_{j,k}$ denote the active count of bucket $(j, k)$ at
level $\ell$. The four dispatches at that level together implement:

$$
N^{(\ell)}_{j,k} \;\longmapsto\;
\underbrace{\bigl\lfloor N^{(\ell)}_{j,k} / 2 \bigr\rfloor}_{\text{pc}}
\;+\;
\underbrace{\bigl(N^{(\ell)}_{j,k} \bmod 2\bigr)}_{\text{cf}}
\;=\; N^{(\ell+1)}_{j,k},
$$

with the special case $N^{(\ell)}_{j,k} = 1$ overriding the formula to
go straight to $0$ (the bucket finalizes — see below). Compactly:

$$
N^{(\ell+1)}_{j,k} \;=\;
\begin{cases}
\bigl\lceil N^{(\ell)}_{j,k} / 2 \bigr\rceil & N^{(\ell)}_{j,k} \ge 2 \quad\text{(pair tree halves up)} \\
0 & N^{(\ell)}_{j,k} \in \{0, 1\} \quad\text{(idle or finalize)}.
\end{cases}
$$

Each piece of that arithmetic is handled by one kernel:

| Quantity | Source kernel | Destination |
|---|---|---|
| $\text{pc}$ pair-sums | `ba_fused_super` (×tiles) | `active_sums_new` slots $[\text{offset}_{j,k},\;\text{offset}_{j,k} + \text{pc})$ |
| $\text{cf}$ passthroughs | `ba_carry_copy` | `active_sums_new` slot $\text{offset}_{j,k} + \text{pc}$ |
| Singleton $\to$ $B_{j,k}$ | `ba_finalize_copy` (gated by the plan) | `bucket_result[(j, k)]` |
| Plans for the above | `ba_planner_v2_{offsets,emit}` | `pair_block_plan`, `scatter_plan`, `carry_plan` |

The planner runs every level and re-derives $\{\text{pc},
\text{cf}\}_{j,k}$ from the current $N^{(\ell)}_{j,k}$; finalized
buckets get $\text{pc} = \text{cf} = 0$ and are silently skipped by
the subsequent dispatches.

#### Count progression — one bucket through its life

Take a bucket that starts at $N^{(0)}_{j,k} = 5$:

| $\ell$ | $N^{(\ell)}_{j,k}$ | pc | cf | per-level work |
|---|---|---|---|---|
| $0$ | $5$ | $2$ | $1$ | $2$ pair-adds + $1$ carry |
| $1$ | $3$ | $1$ | $1$ | $1$ pair-add + $1$ carry |
| $2$ | $2$ | $1$ | $0$ | $1$ pair-add |
| $3$ | $1$ | $-$ | $-$ | **finalize**: write $B_{j,k}$ |
| $4$ | $0$ | $-$ | $-$ | done |

Total pair-adds across this bucket's lifetime: $2 + 1 + 1 = 4 = N_0 - 1$,
matching the textbook lower bound for reducing $N_0$ points to a
single sum via a binary tree.

#### Termination

Iterating until $N^{(\ell)}_{j,k} = 0$ for every $(j, k)$ produces
$B_{j,k}$ for every bucket with at least one contribution. `prepare()`
plans every level up front
([msm_v2.ts:1444-1499](../msm_v2.ts#L1444-L1499)) — typically 8–12
levels suffice for $n \in [2^{14}, 2^{20}]$, bounded above by
$\lceil \log_2 N_{\max} \rceil + 1$ where $N_{\max}$ is the largest
level-0 bucket count.

---

## 9. Stage 5 — bucket reduction (per-window suffix sum)

Given $\{B_{j,k}\}$ for window $j$, compute

$$
W_j \;=\; \sum_{k=1}^{B} k\,B_{j,k} \;=\; \sum_{k=1}^{B} \biggl(\sum_{\ell \ge k} B_{j,\ell}\biggr)
$$

via the *running pair* identity (let $m_t, g_t$ be the suffix sum and
the weighted suffix sum at thread $t$'s slice of the buckets):

$$
m_t \;=\; \sum_{k \in S_t} B_{j,k},
\qquad
g_t \;=\; \sum_{k \in S_t} (\text{positions remaining})\,B_{j,k},
\qquad
W_j \;=\; \sum_t g_t \;+\; (\text{combine offsets}).
$$

MsmV2 implements this with two dispatches:

- **`ba_reduce_init_bench`** seeds `red_buf` (the per-window
  reduction-state buffer) from `bucket_result` and sets up the
  is-present bitmap.
- **`ba_reduce_level_bench`** runs the tree-style reduction. The
  template is generated with one of three "kinds"
  ([wgsl/cuzk/ba_reduce_level_bench.template.wgsl:1-30](../wgsl/cuzk/ba_reduce_level_bench.template.wgsl#L1-L30)):
  - phase-A suffix add (running $m$ accumulation),
  - phase-B/D tree add (combine adjacent $(m, g)$ pairs),
  - phase-C double (multiply $g$ by appropriate power of 2 for
    Horner-style combine across thread slices).

All branchless — `select` instead of `if`, no point-equality fallback.
One workgroup per window; same 8×u32 field form.

Output: `red_buf[(j, 0)] = W_j` (in Montgomery form) for each
$j \in [0, T)$.

---

## 10. Stage 6 — readback + Horner combine

### 10.1 Gather

After Stage 5, the per-window sums sit at strided offsets in `red_buf`.
The encoder finishes by copying each $W_j$ into the staging buffer
([msm_v2.ts:2147-2152](../msm_v2.ts#L2147-L2152)):

```
For w = 0..numWindows-1:
  copyBufferToBuffer(redBuf, x_off(w), staging, dstByteOff + w*64,      32);
  copyBufferToBuffer(redBuf, y_off(w), staging, dstByteOff + w*64 + 32, 32);
```

### 10.2 Readback + de-Montgomery

The host awaits `mapAsync`, reads the mapped range, and in
`decodeWindowSumsFromBytes` ([msm_v2.ts:2186](../msm_v2.ts#L2186)) converts
each window's $(x, y)$ from Montgomery to canonical:

$$
x_j = (\tilde x_j \cdot R^{-1}) \bmod q,
\qquad
y_j = (\tilde y_j \cdot R^{-1}) \bmod q.
$$

(`rinv` is `params.rinv` from `compute_misc_params`.)

### 10.3 Cross-bridge

`writeWindowSumsLE` writes the canonical $T \times 64$ bytes back to
the WASM-side result region. `SLOT_NUM_WINDOWS` and `SLOT_C` are set
so the C++ side knows the layout. `STATE_DONE` flips, the worker wakes.

### 10.4 Horner fold in native bb::g1

C++ does *not* combine on the GPU. The per-window sum count is small
($T \in [7, 33]$ for our $c$ table), so dispatch + readback would
dominate the actual compute. Instead the C++ side calls
[`combine_windows`](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_marshalling.hpp#L104):

```
acc = read_affine_le(buf[(T - 1) * 64])
for w = T - 2 down to 0:
    for d = 0 to c - 1:
        acc.self_dbl()
    acc += read_affine_le(buf[w * 64])
return acc.to_affine()
```

The fold runs in Jacobian (so every doubling is inversion-free), with
one final affine normalisation. That's *the* MSM result, ready to
return to the prover.

---

## 11. Field arithmetic on GPU

### 11.1 The 20×13 layout (and why it's there)

Most WGSL field code uses **20 limbs × 13 bits per limb** to store an
element of $\mathbb{F}_q$. Why 13?

Schoolbook multiply produces a partial product of $\sim w + w = 26$
bits per inner mul, accumulated over $L$ terms; the accumulator must
fit in 32 bits without overflow:

$$
2w + \lceil \log_2 L \rceil \;\le\; 32.
$$

For $L = 20$, $\lceil \log_2 L \rceil = 5$, giving $2w \le 27$ →
$w \le 13$. And the lower bound $L \cdot w \ge 254$ forces $w \ge 13$.
So $w = 13$ is the unique integer that satisfies both.

Inner-mul count is $L^2 = 400$ per outer multiply (vs $9 \times 9 = 81$
for 9×29 WASM and $4 \times 4 = 16$ for native 4×64). The GPU compensates
with parallelism: every thread runs an independent field mul, and the
total work scales sublinearly with $n$ once the GPU is saturated.

### 11.2 "8×u32 live form" inside fused kernels

The 20×13 layout is great for *correctness* but exhausts the register
budget when the inner loop is fused (Stage 4's `ba_fused_super_bench`
holds multiple field elements live at once). MsmV2 packs the same field
element into a tighter **8×u32 = 256-bit** representation inside the
fused kernels — same canonical residue, just packed differently. Pack
and unpack helpers (`dec_unpack`, `dec_pack`,
[field8_funcs](../wgsl/field/field8.template.wgsl)) convert between the
two when crossing the boundary into Montgomery-multiply (which still
prefers 20×13).

### 11.3 Modular inverse — `'loop'` vs `'pk'`

`MsmConfig.invVariant` ([msm_v2.ts:60](../msm_v2.ts#L60)) selects the
GPU inverse:

- `'loop'` — Bernstein-Yang safegcd with a fixed iteration count, one
  iteration per loop body.
- `'pk'` (default) — same algorithm, packed 2×13-bit-digits per loop
  body so half as many iterations. The "pk" name reflects the packed
  digit; commit `082ed17754` introduced it.

Both implement: given $u \in \mathbb{F}_q$, return $u^{-1}$. The fused
super kernel uses exactly one inverse per pair-block, so the variant
choice matters disproportionately — `'pk'` is the only one in any
production benchmark.

The host's `combineOnHost: true` mode (dev-bench path) instead uses JS
`modInverse(z, FP)` for the final Jacobian → affine; that's never on
the bridge path.

---

## 12. Coordinate-form cheat sheet

To keep track of which form a coordinate is in at each boundary:

| Boundary | Form | Encoded as | Where |
|---|---|---|---|
| Scalars in WASM memory | Canonical LE | $n \times 32$ bytes | `bb_external_msm_bn254` contract |
| Scalars in GPU `scalarsRawBuf` | Canonical LE u32 (same bytes) | $n \times 8$ × u32 | `prepare()` `writeBuffer` |
| SRS points from C++ → bridge | Canonical LE | $n \times 64$ bytes | `marshal_points` |
| SRS points in pool (`poolX`, `poolY`) | Montgomery 8×u32 | $n \times 32$ bytes each plane | `MsmV2Pool.create` |
| `active_sums` (L0, index mode) | Index + sign bit | 4 bytes | `csr_to_v2_active_sums` w/ `index_mode` |
| `active_sums` (L0+1 onward) | Montgomery packed (x, y) | $64$ bytes per slot | `csr_to_v2_active_sums` plain mode + pair-tree outputs |
| `bucket_result`, `red_buf` | Montgomery 8×u32 | $32$ bytes per coord | Stage 4/5 output |
| Per-window sums in staging | Montgomery 8×u32 | $T \times 64$ bytes | end of `encodeIntoBatch` |
| Per-window sums shipped to C++ | Canonical LE | $T \times 64$ bytes | `writeWindowSumsLE` (de-mont'd) |
| C++ combined result | `AffineElement` (Montgomery internally) | — | `combine_windows` |

---

## 13. Putting numbers on it (current measurements)

From [WEBGPU_CHONK_STATUS.md](../WEBGPU_CHONK_STATUS.md), M4 Pro,
Metal-3, Chromium headless, canonical
`ecdsar1+transfer_1_recursions+sponsored_fpc` flow (11 circuits, 91
delegated MSMs). Selected warm per-MSM GPU compute times from that
doc's measurement table:

- $n = 20\,406$ ($W_R / W_O$ warm): **8.2–9.0 ms**.
- $n = 36\,863$ ($LOOKUP\_READ\_TAGS$ warm): **10.6 ms**.
- $n = 71\,364$ ($W_4$ lone): **21.2–21.4 ms**.
- $n = 88\,899$ ($W_R / W_O$ warm): **11.7–17.9 ms**.
- $n = 131\,071$ ($ORDERED\_RANGE\_CONSTRAINTS\_*$ warm): **29.1–33.2 ms**.

Per the same doc, the CPU baseline (16-thread WASM Pippenger on M4
Pro) at these sizes is **5–30 ms** — parity-to-slight-CPU-edge at
every $n$ chonk uses. End-to-end: WebGPU 7.6 s vs WASM-MT 6.0 s =
**0.78× of CPU**.

The end-to-end gap is dominated *not* by the MSM compute but by:
- `mapAsync` Chrome polling, $\sim 20$ ms × $\sim 60$ batches ≈ 1.2 s
- Per-MSM `prepare()`, $\sim 5$–15 ms cached × 91 MSMs ≈ 0.5–1 s
- Same-N batch queue serialization, where the GPU executes 10 same-N
  passes back-to-back instead of in parallel

The structural lever for closing this is **multi-MSM concurrent shaders**
(ROADMAP M4) — rewriting the pair-tree kernels to take an
`(msm_idx, point_idx, window)` triple so one dispatch processes M
same-N MSMs in parallel. The reverted slot-pool experiment confirmed
this is the only path: multiple single-MSM-shader instances do not
parallelize on the GPU; only multi-MSM-per-shader does.
