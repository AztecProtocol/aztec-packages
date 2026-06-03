# WebGPU Kernel-Design Plan: MegaFlavor Sumcheck Relation-Accumulate

This plan drives the WGSL port of the O(n) map-reduce `accumulate_relation_univariates` → `Relation::accumulate` over all 14 MegaFlavor relations, mirroring the short-monomial path (`USE_SHORT_MONOMIALS = true`). All Fr arithmetic uses the GPU-verified 8×u32 Montgomery primitives (sumcheck phase 0).

Derived by a 19-agent source-reading pass (see commit history); all facts confirmed against `flavor/mega_flavor.hpp`, `polynomials/univariate_coefficient_basis.hpp`, `sumcheck/sumcheck_round.hpp`, and the 14 `relations/*.hpp`.

---

## 1. Accumulator layout — the 345-Fr per-thread state

The per-thread accumulator is `SumcheckTupleOfTuplesOfUnivariates` flattened to a single contiguous Fr buffer. Layout order is **(relation_idx, subrelation_idx, eval_idx)**, matching `Relations_` tuple order in `mega_flavor.hpp:67-80` and each relation's `SUBRELATION_PARTIAL_LENGTHS`. Each leaf is a `Univariate<FF,len>` = `len` Fr evaluations on the domain `{0..len-1}` (Lagrange/value basis). `len = 1 + subrelation_degree`.

The flat offset table (units = Fr elements, each Fr = 8×u32 = 32 bytes):

| # | Relation | Subrelation lengths | Sub-total Fr | Start | End |
|---|---|---|---|---|---|
| 0 | ArithmeticRelation | 6, 5 | 11 | 0 | 11 |
| 1 | UltraPermutationRelation | 6, 3, 3 | 12 | 11 | 23 |
| 2 | LogDerivLookupRelation | 5, 5, 3 | 13 | 23 | 36 |
| 3 | DeltaRangeConstraintRelation | 6, 6, 6, 6 | 24 | 36 | 60 |
| 4 | EllipticRelation | 6, 6 | 12 | 60 | 72 |
| 5 | MemoryRelation | 6, 6, 6, 6, 6, 6 | 36 | 72 | 108 |
| 6 | NonNativeFieldRelation | 6 | 6 | 108 | 114 |
| 7 | EccOpQueueRelation | 3×8 | 24 | 114 | 138 |
| 8 | DatabusLookupRelation | 6×15 (5 buses × {6,6,6}) | 90 | 138 | 228 |
| 9 | Poseidon2ExternalRelation | 7, 7, 7, 7 | 28 | 228 | 256 |
| 10 | Poseidon2InitialExternalRelation | 3, 3, 3, 3 | 12 | 256 | 268 |
| 11 | Poseidon2QuadInternalRelation | 7, 7, 7, 7 | 28 | 268 | 296 |
| 12 | Poseidon2QuadInternalTerminalRelation | 7, 7, 7, 7 | 28 | 296 | 324 |
| 13 | Poseidon2TransitionEntryRelation | 7, 7, 7 | 21 | 324 | 345 |

**Total: 345 Fr = 11040 bytes per thread-accumulator** (63 subrelations). `MAX_PARTIAL_RELATION_LENGTH = 7`, `BATCHED_RELATION_PARTIAL_LENGTH = 8`.

Emit this as WGSL `const SUBREL_OFFSET[63]` / `SUBREL_LEN[63]` so each relation kernel writes into the exact slice. **Never pad subrelations to a uniform length** — wastes ~30% of the buffer and breaks the diff against the tightly-packed CPU golden.

**GPU vs CPU split:**

- **GPU (O(n), the only size-dependent work):** `extend_edges` (length-2 edge gather, no muls) + `Relation::accumulate` per edge pair, writing into the 345-Fr accumulator. One partial 345-Fr buffer per workgroup/partition.
- **CPU (size-independent, ~hundreds of Fr ops/round × ~log_n rounds):** the entire `batch_over_relations` tail (`sumcheck_round.hpp:601-663`):
  - `add_nested_tuples` — flat 345-element reduction merging partition partials.
  - `scale_univariates(alphas)` — multiply each subrelation by its `alpha^i` power, **except** subrelation 0 and except linearly-*dependent* subrelations.
  - `extend_and_batch_univariates` — `random_polynomial = {1, gate_separators.current_element()}`, `extend_to<8>`, then per subrelation `extend_to<8>` and accumulate. Linearly-**dependent** subrelations (LogDerivLookup subrel 1, DatabusLookup subrel `3*bus+2`) are added **raw** (no alpha, no pow factor); linearly-independent ones are `result += extended * extended_random_polynomial * partial_evaluation_result`.

Keep the tail on CPU: it needs the per-subrelation `SUBRELATION_LINEARLY_INDEPENDENT` flags, the `alpha` array, and per-round gate-separator scalars — all tiny and round-specific.

**Ordering hazard:** `batch_over_relations` calls `zero_univariates` at the end (`sumcheck_round.hpp:612`). When generating goldens, dump the raw 345-Fr **before** invoking it.

---

## 2. Kernel decomposition

**Recommendation: relation-(group-)per-kernel, workgroup-strided over edges. Reject the single mega-kernel.**

One lane running all 14 relations is infeasible: 345 Fr × 32 B = 11 KB of live state per lane + ~30 live operands at the Poseidon2/Databus/Memory peaks → spills, occupancy collapses to ~1 wave.

**Chosen structure — one kernel per relation (14), grouping the trivial ones:**

- Each kernel materializes only *its own* subrelation slice (6–90 Fr) and *its own* live operands. Arithmetic needs 11 Fr + ~6 operands; Poseidon2External needs 28 Fr + a dozen length-7 temporaries — but never both at once.
- Within a kernel: **one lane per edge pair**, strided by `global_invocation_id` across `2^(log_n - round)` active edge pairs. Private 6–90 Fr partial → workgroup tree-reduce → one partial/workgroup to global → host (or tiny final-reduce kernel) sums. Fr add is associative, no atomics.
- Group cheap, low-footprint relations to amortize dispatch: **{Arithmetic, DeltaRangeConstraint, NonNativeField, Poseidon2InitialExternal (+EccOpQueue)}** can share a kernel. Keep heavy relations isolated.

**Heaviest relations (must be isolated):** DatabusLookup (90 Fr, 5-bus, ~36 Fr live shared terms — iterate the 5 buses sequentially), Poseidon2 family (28 Fr; `pow5` promotes to length-7 and squares twice — QuadInternal holds 7 fifth-powers = 49 Fr live), Memory (36 Fr, heavy live-set), UltraPermutation (12 Fr but 16 entities + 8 monomials + 2 length-6 products).

**Selector sparsity / stream-compaction:** every relation has a `skip()` gate on a sparse selector (`q_arith`, `q_delta_range`, `q_elliptic`, `q_memory`, `q_nnf`, `q_busread`, `lagrange_ecc_op`, five `q_poseidon2_*`, plus data-dependent gates: `z_perm − z_perm_shift` for UltraPermutation, `q_lookup || lookup_read_counts` for LogDeriv). In real Mega circuits these are extremely sparse.
- **Phase 1 (correctness):** `skip()` as a per-lane early-out.
- **Phase 2 (performance):** **stream-compact each relation's active rows into an index buffer once per proof** (selector support is a fixed row property; only edge pairing changes per round). Prefix-sum compaction → dispatch each relation only over its compacted edge list (~50× fewer lanes for a relation firing on ~2% of rows). This is the single biggest perf lever and *why* per-relation kernels are mandatory — each needs its own iteration domain.

---

## 3. GPU data layout

**62 storage buffers, one per unshifted column, in `get_all` order (absolute indices 0..61):**

- **Precomputed (0..34):** `q_m`(0), `q_c`(1), `q_l`(2), `q_r`(3), `q_o`(4), `q_4`(5), `q_5`(6), `q_busread`(7), `q_lookup`(8), `q_arith`(9), `q_delta_range`(10), `q_elliptic`(11), `q_memory`(12), `q_nnf`(13), `q_poseidon2_external`(14), `q_poseidon2_external_initial`(15), `q_poseidon2_quad_internal`(16), `q_poseidon2_quad_internal_terminal`(17), `q_poseidon2_transition_entry`(18), `sigma_1..4`(19-22), `id_1..4`(23-26), `table_1..4`(27-30), `lagrange_first`(31), `lagrange_last`(32), `lagrange_ecc_op`(33), `databus_id`(34).
- **Witness wires (35..38):** `w_l`(35), `w_r`(36), `w_o`(37), `w_4`(38).
- **Witness derived (39..61):** `z_perm`(39), `lookup_inverses`(40), `lookup_read_counts`(41), `lookup_read_tags`(42), `ecc_op_wire_1..4`(43-46), `kernel_calldata`(47), `kernel_calldata_read_counts`(48), `kernel_calldata_inverses`(49), `first_app_calldata{,_read_counts,_inverses}`(50-52), `second_app_*`(53-55), `third_app_*`(56-58), `return_data{,_read_counts,_inverses}`(59-61).

Each buffer: `2^log_n` Fr in 8×u32 Montgomery layout. Bind in `get_all` order so a column index maps directly to a binding slot.

**Shifted-column aliasing (no extra buffers):** the 5 shifted columns (`w_l/w_r/w_o/w_4/z_perm`_shift, absolute 62..66) read their **source buffer at `row+1`** (`w_l_shift → w_l[row+1]`, …, `z_perm_shift → z_perm[row+1]`). Guard the top boundary so `row+1` stays in-bounds (virtual-zero trace tail). Zero extra memory/upload.

**beta_products residency + doubling stride:** upload the gate-separator pow polynomial once as a read-only buffer of length `2^log_n`. At round `i`, the edge's scaling factor is `beta_products[edge_idx]` read at `periodicity = 2^(i+1)` stride. Pass `periodicity` as a uniform; no re-upload.

**relation_parameters upload:** a tiny uniform of **9 Fr** — `eta, eta_two, eta_three, beta, gamma, public_input_delta, beta_sqr, beta_cube, beta_quartic`. Omit all Translator/ECCVM-only fields (Mega never reads them).

---

## 4. Per-edge WGSL execution (short-monomial path)

Each lane processes one edge pair at row `r` (even; source rows `r`, `r+1`). Replicate the C++ short-monomial algebra exactly — **never materialize length-7 Univariates inline**; `extend_to<8>` is per-round CPU work.

**Edge representation:** for each column, `v0 = col[r]`, `v1 = col[r+1]` (for `*_shift`, source at `r+1`, `r+2`). Monomial form:
```
struct Mono { c0: Fr, c1: Fr, c2: Fr }   // c0=a0=v0, c1=a1=v1-v0, c2=a0+a1=v1 (Karatsuba cache)
```
Edge→mono is one `fr_sub`; `c2 = v1` is free (cache valid only for fresh degree-1 edges).

**Exact per-edge ops:**
1. Mono ± Fr const: `c0` only (one add/sub); clears the `a0+a1` cache.
2. Mono × Fr scalar: `fr_mul` on `c0, c1` (and `c2` if length-3).
3. Mono ± Mono: add/sub on `c0, c1` (and `c2`); result `has_a0_plus_a1 = false`.
4. **deg1×deg1 Karatsuba → length-3 Mono** (the only mul cluster — **3 muls**):
   ```
   t0 = a.c0*b.c0;  t2 = a.c1*b.c1
   a_sum = cached ? a.c2 : a.c0+a.c1;  b_sum = cached ? b.c2 : b.c0+b.c1
   t1 = a_sum*b_sum - t0
   result = Mono{c0:t0, c1:t1, c2:t2}   // c1 is the PACKED value the length-3 ctor expects
   ```
   `sqr()`: `c0=a0^2`, `c2=a1^2`, `c1=(a0+a1+a0)*a1` using the cache. Emit `mono_mul_known` (uses c2) and `mono_mul_general` (recomputes sums); pick by static cache-validity per call site (WGSL has no templates).
5. **Promote Mono → length-N Lagrange evals (add-only), N = SUBRELATION_PARTIAL_LENGTH:**
   - length-2 mono: `out[0]=c0; out[i]=out[i-1]+c1`.
   - length-3 mono: `out[0]=c0; to_add=c1; deriv=c2+c2; out[i]=out[i-1]+to_add; to_add+=deriv` (second-difference).
   Accumulate elementwise into the subrelation slice. N ≤ 6 in the cheap relations; **never 7 here**.

**Degree > 2** (Arithmetic, DeltaRange, Elliptic, Memory, NNF, Permutation, LogDeriv, Databus, all Poseidon2): keep degree-1 factor assembly in monomial form, promote to length-N at the point degree exceeds 2, then multiply pointwise (elementwise `fr_mul`). Poseidon2 `pow5`: promote `(wire+const)` to length-7 immediately, `sqr; sqr; mul` as 7-wide elementwise (the only relation family legitimately holding length-7 — as the *output* length, not an inline `extend_to`).

**Sign/gating subtleties to port verbatim:** Elliptic computes both ADD and DOUBLE branches, masked (`-= x_add_identity * neg_mask`, `+= x_double * double_mask`; `neg_y_double_identity` pre-negated; `curve_b = 3`). DeltaRange: `T=(D-3)*D; T*(T+2)`. LogDeriv subrel 1 and Databus `3*bus+2` are **NOT** scaled by `scaling_factor` (linearly dependent). Memory: fold `scaling_factor` early, reuse shared multipliers, watch `+1` constants (c0 only). NNF: reproduce the `limb_subproduct` in-place mutation; embed `2^68`, `2^14`, etc.

---

## 5. Golden-reference & isolation test

**Producer (C++):** add a Mega-flavor `TEST` in `sumcheck/sumcheck_round.test.cpp` (model on the existing `AccumulateRelationUnivariatesSumcheckTestFlavor` test, lines 477-679):
1. Build `ProverPolynomials` with **fixed deterministic** Fr per column so TS/WGSL can embed identical inputs — one fixture with all gating selectors nonzero (no skips), one with selectors zeroed (exercise `skip()`).
2. `round.extend_edges(...)` to produce the exact `ExtendedEdges`; dump each entity's length-2 edge.
3. `zero_univariates(accumulator)`.
4. `accumulate_relation_univariates_public(accumulator, extended_edges, relation_parameters, gate_separators[edge_idx])`.
5. **Before** any reduction, walk the tuple-of-tuples in `(relation_idx, subrelation_idx, eval_idx)` order and serialize each `Univariate` via `to_buffer()` (32-byte big-endian, non-Montgomery) → the 345-Fr golden vector.
6. Optionally also dump the reduced length-8 round univariate after `batch_over_relations` (snapshot raw first — line 612 zeroes the accumulator).

**Diff strategy:** GPU writes the same flat 345-Fr buffer with the §1 offsets; download, Montgomery→canonical, **diff per subrelation slice**. A mismatch localizes to `(relation_idx, subrelation_idx)`. Diff at 345-Fr granularity first; only then reproduce the reduction and diff the 8-Fr round univariate.

**Highest-signal failure modes:** (a) per-subrelation length mismatch, (b) linearly-dependent subrelations wrongly scaled, (c) length-3 `c1` packing re-derived instead of replicated, (d) Elliptic sign bookkeeping, (e) Montgomery vs canonical encoding.

---

## 6. Implementation order

Climb the difficulty/footprint ladder. **Validation gate after each:** GPU 345-Fr slice byte-matches the CPU golden (both fixtures) before proceeding.

1. **Fr/Mono harness** — Mono type + Karatsuba `mono_mul`/`sqr` + the length-2/length-3 promotion recurrences. Unit-test against a polynomial reference. Foundation — gate hard here.
2. **ArithmeticRelation** (idx 0, 11 Fr, low).
3. **DeltaRangeConstraintRelation** (idx 3, 24 Fr, low).
4. **EccOpQueueRelation** (idx 7, 24 Fr, low).
5. **Poseidon2InitialExternalRelation** (idx 10, 12 Fr, low).
6. **NonNativeFieldRelation** (idx 6, 6 Fr, medium) — large Fr constants.
7. **UltraPermutationRelation** (idx 1, 12 Fr, medium) — first params relation; shifted-column aliasing.
8. **LogDerivLookupRelation** (idx 2, 13 Fr, medium) — linearly-dependent subrel 1; precomputed inverse column.
9. **EllipticRelation** (idx 4, 12 Fr, high) — both-branches + signs.
10. **MemoryRelation** (idx 5, 36 Fr, high).
11. **Poseidon2 family** — External (9), QuadInternal (11), QuadInternalTerminal (12), TransitionEntry (13) — length-7 `pow5`.
12. **DatabusLookupRelation** (idx 8, 90 Fr, high) — final, heaviest.
13. **Integration:** assemble the dispatch graph, add stream-compaction (§2 phase 2), wire the CPU `batch_over_relations` tail, diff the end-to-end 8-Fr round univariate.

---

## 7. Top risks and mitigations

**Correctness:**
1. **Length-3 `c1` packing** — `c1 = (a0+a1)(b0+b1) − c0` is the value the second-difference recurrence consumes, not the bare X¹ coeff. Unit-test the promotion before any relation.
2. **Linearly-dependent subrelations scaled** — drive both GPU accumulate and CPU tail from one `SUBRELATION_LINEARLY_INDEPENDENT[63]` table; diff flagged subrelations explicitly.
3. **Shifted-column boundary** — `row+1` at the tail must mirror the virtual-zero region, not wrap. Include the last edge pair in the golden.
4. **Montgomery vs canonical** on the interchange — convert on download only; assert round-trip at bring-up.
5. **Elliptic signs** — transcribe sign-for-sign; per-subrelation x/y diff catches a flip.

**Performance:**
6. **Register spill from over-broad kernels** — per-relation kernels; split 4-lane Poseidon2 further if needed.
7. **Wasted lanes on sparse selectors** — stream-compact active rows per relation once per proof.
8. **Length-7 inline materialization** — keep `extend_to<8>` + pow on CPU; per-edge kernel never exceeds subrelation length.
9. **Karatsuba cache (`has_a0_plus_a1`)** — specialize `mono_mul_known` vs `_general` by static cache-validity; never read `c2` from an arithmetic result.
