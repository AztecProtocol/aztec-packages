# Pippenger Multi-Scalar Multiplication (MSM)

This directory computes the multi-scalar multiplication

$$\mathrm{MSM}(\vec{s}, \vec{P}) \;=\; \sum_{i=0}^{n-1} s_i \cdot P_i,$$

the dominant cost of an ECC-based proving system. The default implementation is **round-parallel**:
it parallelises a single MSM by distributing its windows (rounds) across the thread pool, so each
worker runs whole windows independently. The `legacy` namespace keeps the previous implementation,
which parallelises the other axis — it partitions the points across threads, accumulates per-thread
bucket sets, and reduces them. `legacy` is the default; the round-parallel implementation is opt-in
via `BB_MSM_NEW` (or the API override), so the two can be A/B compared.

## Cost model

Fix a window width $c$ (`window_bits`). The scalar bit-length $q$ is split into

$$r = \left\lceil \frac{q + 2}{c} \right\rceil \quad\text{windows (rounds),}$$

and each window accumulates points into $2^{\,c-1}$ signed buckets (the $-1$ is the Booth-recoding
halving, below). Per window the prover pays one bucket scatter over all $n$ points plus a reduction
over the buckets, so the native cost model is

$$\mathrm{cost}(c) \;=\; r \cdot \bigl(n + \kappa \cdot 2^{\,c-1}\bigr), \qquad \kappa = 15,$$

minimised by brute force over $c \in [2, 20)$ in `choose_window_bits`. The constant $\kappa$
(`BUCKET_ACC_COST`) is an empirically tuned weight for a bucket-reduction step relative to one
scatter addition. Larger $c$ cuts the round count $r$ but grows the bucket array $2^{c-1}$ — the
cost model picks the balance. With $c \approx \log_2 n$ this yields $O\!\bigl(n q / \log n\bigr)$
versus $O(n q)$ for naive per-point scalar multiplication.

On WASM (`#ifdef __wasm__` branch) `choose_window_bits` skips the brute-force search and derives $c$
from a closed-form `target_load` heuristic instead.

## Parameters

| Symbol | Code identifier | Meaning | Bound |
|---|---|---|---|
| $n$ | `n_input` | number of (scalar, point) pairs | $< 2^{29}$ (`SCHEDULE_INDEX_MASK`) |
| $q$ | `NUM_BITS` | scalar bit-length (post-GLV: half-width) | $\le 254$ (BN254 $\mathbb{F}_r$) |
| $c$ | `window_bits` | bits per window | $2 \le c < 20$ |
| $r$ | `num_windows` | number of windows / rounds | $\lceil (q+2)/c \rceil \le 128$ (`MAX_SCHEDULE_WINDOWS`) |
| — | `BUCKET_ACC_COST` | $\kappa$, bucket-step cost weight | $15$ |
| $T$ | `num_threads` | logical workers | machine-dependent |

The $+2$ on the bit budget in `build_window_schedule` accommodates the carry-less top bit of the
Constantine signed-Booth recoder.

## Entry points

The public facade in `scalar_multiplication.hpp` (`namespace bb::scalar_multiplication`) dispatches
to `legacy::` by default and to the round-parallel implementation when `use_legacy_msm()` returns
false. The rewrite is opt-in while it soaks: select it with the `BB_MSM_NEW` environment variable or
`set_legacy_msm_override(false)`. `BB_MSM_LEGACY` is still honoured as an explicit force-legacy.

| Facade | `handle_edge_cases` | Use when |
|---|---|---|
| `pippenger()` | `true` | general points (may collide / be infinity) |
| `pippenger_unsafe()` | `false` | points known linearly independent (e.g. SRS) |
| `MSM<Curve>::msm()` | arg, default `false` | single MSM, returns `AffineElement` |
| `MSM<Curve>::batch_multi_scalar_mul()` | `true` | many MSMs over one shared point set |

`handle_edge_cases = false` selects the fast affine path, which uses batched affine addition and
**assumes no point-at-infinity and no equal-x collision within a bucket**. `handle_edge_cases = true`
routes to a Jacobian path (`pippenger_round_parallel_jacobian_fast`) that handles those cases at
higher per-operation cost. Each facade entry also takes a `dedup_hint` (below).

The implementation layer (`scalar_multiplication_fast.hpp`) mirrors these as `pippenger_fast`,
`pippenger_unsafe_fast`, and `MSM_fast<Curve>`; the engine is `pippenger_round_parallel`.

## Algorithm

`pippenger_round_parallel` runs in phases. Phase 1–3 are the per-MSM prologue; Stages 1–7 are the
per-window pipeline, dispatched across `num_threads` workers.

### Phase 1 — scalar transform and optional GLV split

`pippenger_round_parallel` converts the input scalars out of Montgomery form (bucket indexing needs
the integer representation) and records the per-scalar most-significant-bit in `msb_per_scalar`,
which feeds the adaptive window range.

When $n \le$ `GLV_SMALL_N_THRESHOLD` ($2^{13}$ native, $2^{16}$ WASM) each scalar $s_i$ is
GLV-decomposed into two half-width scalars $s_i = s_i^{(0)} + \lambda\, s_i^{(1)} \pmod r$ against the
endomorphism $\phi$, doubling the point count to $\{P_i, \phi P_i\}$ but halving $q$ and hence the
window count $r$. Above the threshold the $2n$ point-count cost outweighs the saving, so the split
is skipped. A batched caller may pass `external_glv_doubled` to share the doubled SRS prefix across
MSMs instead of recomputing it.

### Phase 2 — small-N fallback

If, after dropping zero scalars (`n_active`), each worker would receive fewer than
`MIN_PTS_PER_THREAD_FOR_PIPPENGER` ($=24$) points, the Pippenger scaffolding (digit extraction,
histograms, bucket scratch) costs more than it saves. `pippenger_round_parallel` then delegates to
`trivial_msm_threaded` (parallel Straus windowed double-and-add with GLV), which is robust to all
edge cases.

### Phase 3 — window schedule and pipeline

`choose_window_bits` picks $c$ and `build_window_schedule` produces a `WindowSchedule`: a uniform
layout of `num_windows` windows, each $c$ bits wide except the final remainder window, with
`bit_base[w]` $= \sum_{k<w} c_k$. The per-window bucket count is not stored — the schedule is uniform,
so the widest window's count is always $2^{c-1}+1$, computed where needed.

The signed-Booth (Constantine) recoder maps each $c$-bit slice into the signed range
$[-(2^{c-1}-1),\, 2^{c-1}-1]$. A point with a negative digit $-d$ is accumulated into bucket $d$ with
its negation, so only $2^{c-1}$ buckets per window are needed rather than $2^c$ — the source of the
$2^{c-1}$ in the cost model. The recoder lives in `pippenger_constantine.hpp`.

### Stages 1–4 — bucket scatter (counting sort)

Per window $w$, the points are scattered into buckets by their signed digit. This is a counting sort
built per worker:

1. **Stage 1 — digit extraction.** Each thread decodes the signed digits for its scalar slice and
   tallies a per-(thread, window, digit) histogram.
2. **Stage 2 — histogram.** Per-window per-digit totals plus per-thread within-digit offsets.
3. **Stage 3 — prefix sum.** A per-window serial prefix sum over `bucket_start` turns the totals into
   bucket base offsets.
4. **Stage 4 — scatter.** Each thread writes its points' schedule entries `(sign | scalar_idx)` into
   the sorted slots. The bucket magnitude is recovered from the schedule position later, so each entry
   stores only the sign bit and the scalar index, which must fit the 29-bit schedule payload
   (`SCHEDULE_INDEX_MASK`) — capping $n$ at $2^{29}$.

### Stages 6a–6b — bucket reduction

After the scatter, bucket $k$ in window $w$ holds $B_k^{(w)} = \sum_{\{i:\, d_i^{(w)} = k\}} P_i$, and
the window's contribution is the weighted sum

$$R^{(w)} \;=\; \sum_{k=1}^{2^{c-1}} k \cdot B_k^{(w)} \;=\; \sum_{k=1}^{2^{c-1}} \Bigl(\sum_{m \ge k} B_m^{(w)}\Bigr),$$

evaluated as a running suffix sum (high digit to low).

- **Stage 6a** runs per thread: each worker reduces the contiguous schedule range it owns into
  per-thread bucket partials, using batched affine addition (`BATCH_CAPACITY` $= 256$ independent
  additions per Montgomery batch inversion; 6M per addition, 7M per doubling, $M$ = field
  multiplication). Sub-chunks that straddle a thread boundary emit seam-overflow partials.
- **Stage 6b** is a cross-thread reduction: the bucket range is partitioned evenly across rebalanced
  tasks, and each task sums the contributing threads' Stage 6a partials (plus merged seam overflow)
  into the window result $R^{(w)}$.

The affine path assumes linear independence; collisions and infinities are handled only on the
Jacobian path selected by `handle_edge_cases = true`.

### Stage 7 — cross-window combine

The window results are combined MSB-first by Horner's rule, doubling by `window_bits_per_window[w]`
between adjacent windows:

$$\mathrm{MSM} \;=\; \Bigl(\!\cdots\bigl(R^{(0)} \cdot 2^{c_1} + R^{(1)}\bigr)\cdot 2^{c_2} \cdots\Bigr) + R^{(r-1)}.$$

## Duplicate stripping (Phase A)

Witness commitments and permutation polynomials contain many repeated base points. When the caller
sets `dedup_hint`, `pippenger_round_parallel` runs **Phase A** at most once per MSM, on window 0: it
detects clusters of equal points and consolidates each cluster's scalars onto a single
representative, writing the consolidated points to `extra_points`. The detection is bounded by
`DEDUP_MAX_CLUSTERS` ($16384$) and `DEDUP_MAX_MEMBERS` ($32768$); inputs exceeding the caps fall back
to the normal (non-deduped) path. Dedup adds ~5% overhead on random inputs, so it is opt-in and off
by default. The machinery is in `pippenger_dedup.hpp`.

## Memory: the single arena

To bound peak memory and avoid WASM heap fragmentation, all per-MSM scratch is carved from one
contiguous buffer sized at runtime by `compute_arena_bytes_for_msm` to fit `BATCH_MEM_BUDGET`
(~32 MiB). The buffer is a local `unique_ptr` allocated per MSM and freed on return (or supplied by a
batched caller via `external_arena`). It has three zones:

- **Zone P** — per-MSM prologue (`msb_per_scalar`, GLV scalars/points) and dedup state, retained
  through the last Stage 6a.
- **Zone W** — per-worker slabs. Stage 6a, Stage 6b, and Phase A overlay the same per-worker bytes
  because their `parallel_for` invocations never run concurrently on one worker; the
  windows-per-batch-dependent Stage 6 tail sits immediately after the union. `pippenger_arena_layout.hpp`
  is the single source of truth for this byte walk (the sizer, the live allocator, and the test all
  call `PerWorkerArenaLayout`), which removes a class of arena-drift bugs that arose when those copies
  disagreed.
- **Zone S** — the point schedule.

The number of windows processed per batch (`windows_per_batch`) is solved from the per-window byte
cost so the slab fits the budget (`solve_wpb`).

## File structure

| File | Contents |
|---|---|
| `scalar_multiplication.hpp` | public facade + `legacy::` namespace + `use_legacy_msm` dispatch |
| `scalar_multiplication_fast.hpp` / `.cpp` | round-parallel engine (`pippenger_round_parallel`) and `MSM_fast` |
| `pippenger_arena_layout.hpp` | `WindowSchedule`, `choose_window_bits`, `build_window_schedule`, `PerWorkerArenaLayout`, arena sizing constants |
| `pippenger_constantine.hpp` | signed-Booth window recoder (scalar + SIMD x4) |
| `pippenger_dedup.hpp` | Phase A duplicate-stripping pre-pass |
| `pippenger_batched.hpp` | shared-SRS batched-commit driver |
| `pippenger_fallbacks.hpp` | `trivial_msm` / `trivial_msm_threaded` small-N Straus paths |
| `process_buckets.*` | bucket index sorting helpers |

## References

1. N. Pippenger, *On the Evaluation of Powers and Monomials*, SIAM J. Comput. 9(2), 1980.
2. A. D. Booth, *A Signed Binary Multiplication Technique*, Quarterly J. of Mechanics and Applied Math 4(2), 1951 (origin of the signed-digit recoding).
3. D. Hankerson, A. Menezes, S. Vanstone, *Guide to Elliptic Curve Cryptography*, Springer 2004 (windowed / signed-window scalar multiplication).
4. Constantine — pairing-friendly-curve & MSM implementation, https://github.com/mratsim/constantine.
</content>
