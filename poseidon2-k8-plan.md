# Poseidon2 K=8 + compressed external rounds — implementation plan

Closing variant for the Poseidon2 compression saga. Adds two pieces on top of the K=4 idea:

1. **K=8 internal compression** with **4 extra committed wires** so each row encodes `s_0` at 8 consecutive internal rounds without the heavy shift-side Vandermonde algebra K=4 needs.
2. **2-per-row external block compression** so the 8 external rounds collapse to 4 rows.

**Branch policy:** implement on a fresh branch off `origin/merge-train/barretenberg`, *not* on top of the current K=4 branch (`si/poseidon2-opt-attempt`). The K=4 selectors/wires are not present in merge-train; this variant introduces its own. No K=4 carryover.

---

## Motivation

Per-permutation cost on Mega today:

| Layout | Internal rows | External rows | Total rows |
|--------|--------------:|--------------:|-----------:|
| Stock (`mt`) | 56 | 8 | 64 |
| K=4 (`si/...`) | 16 | 8 | 24 |
| **K=8 + ext-2 (this plan)** | **10** | **4** | **14** |

Going from K=4 (16) to K=8 (10) is +37.5% row reduction in the internal block. The K=4 → K=8 step is small in absolute rows but **the new wires let us avoid the 7×7 Vandermonde explosion** that pure K=8 would otherwise require — that's the whole point of "4 extra wires".

External-block compression is independent: 8 external rounds → 4 rows costs no extra committed state if we lay them out as `(s, M_E·s)` pairs in width-4+4 form.

Goal: confirm whether further row compression past K=4 produces a real prove-time win once we've already paid the per-poly fixed costs from extra commits. Per the analysis in `poseidon2-compression-analysis.md`, the K=4 win was bottlenecked by the per-row sumcheck cost growing faster than the row count fell. This plan tests whether **trading committed-state for relation simplicity** flips that ledger.

---

## Internal block: K=8 layout

Each compressed-internal row commits `s_0` at 8 consecutive internal rounds **across 8 wire columns**:

| Wire | Holds |
|------|-------|
| `w_l` | `s_0^{(0)}` |
| `w_r` | `s_0^{(1)}` |
| `w_o` | `s_0^{(2)}` |
| `w_4` | `s_0^{(3)}` |
| `w_5` (new) | `s_0^{(4)}` |
| `w_6` (new) | `s_0^{(5)}` |
| `w_7` (new) | `s_0^{(6)}` |
| `w_8` (new) | `s_0^{(7)}` |

Selectors carry the 8 round constants `c_0…c_7` of this row's pair, plus the next-pair's first 7 round constants for the shifted check (same pattern as K=4 but with more entries).

Non-S-boxed state cells `(s_1, s_2, s_3)` at row-start are **derived inside the relation** the same way as K=4: a 3×3 Vandermonde solve with nodes `(D_2, D_3, D_4)`. The relation between consecutive `s_0` values still gives one equation for the `(s_1, s_2, s_3)` linear combination per round — we use the first 3 of the 7 available equations to invert the Vandermonde, and the remaining 4 inter-round relations become **redundant subrelations that we drop**. (Concretely: the 7×7 system is rank 3, so we only need the 3-row solve.)

Once `(s_1, s_2, s_3)` at round 0 are recovered, the 8 internal rounds are unrolled natively inside the relation (8 step calls) to produce `(out_0, out_1, out_2, out_3)` at round 8.

**Subrelations (interior row):**

1. `A_0`: `out_0 = w_l_shift` (direct S-box-free match into next row's first `s_0` slot)
2. `A_1..A_3`: forward-Vandermonde check on shifted side (same as K=4):
   - `out_1 + out_2 + out_3 = b_1_next`
   - `D_2 out_1 + D_3 out_2 + D_4 out_3 = b_2_next`
   - `D_2² out_1 + D_3² out_2 + D_4² out_3 = b_3_next`

where `b_k_next` is computed from the *shifted* row's wires and next-pair selectors, **using the new wires `w_5..w_8`** to access `s_0^{(0..3)}` of the next row directly. Crucially: because the next row has its own `w_5..w_8` carrying `s_0^{(4..7)}` of *that* pair, the shift-side u-values needed for `b_k_next` only need 3 S-boxes (rounds 0,1,2 of the next row), the same as K=4's shift side. **The 4 extra wires don't add S-box cost on the shift side.**

**S-box counts per interior row:**

- 8 current-row S-boxes (one per committed `s_0` round): `(w_X + q_X)^5` for `X ∈ {l, r, o, 4, 5, 6, 7, 8}`.
- 3 shift-side S-boxes (same as K=4: building `b_1_next, b_2_next, b_3_next`).
- **Total: 11 S-boxes per interior row** (vs K=4's 7).

**Subrelation degree:** unchanged at 5 in any single sumcheck variable — each S-box lands on a distinct wire. Plus selector + gate separator → partial length 7. Same accumulator shape as K=4.

**Row count:** 56 internal rounds / 8 = 7 interior rows. Plus:
- 1 transition-entry row (same role as K=4's: bridges last external row into first compressed-internal row, asserts `w_l_shift = s_0` at round 0)
- 1 terminal row (K=8 variant; successor is standard-encoded)
- 1 standard-encoded transition row on the post-internal side

**Total internal block: 10 rows per permutation.**

---

## External block: 2-per-row compression

Stock external block: 8 rows, each `(s, M_E·s)` with full 4-wide state and 4 round constants.

Compressed: 4 rows, each holding state at **2 consecutive external rounds**. Layout per row:

| Wires (8 total) | Holds |
|-----------------|-------|
| `w_l..w_4` | full state at round `2k` |
| `w_5..w_8` | full state at round `2k+1` |

Selectors carry 8 round constants (4 for round `2k`, 4 for round `2k+1`).

The relation enforces both `M_E` applications natively in one row: `(w_5..w_8) = M_E · sbox(w_l..w_4 + c_{2k})` and `next_row.(w_l..w_4) = M_E · sbox(w_5..w_8 + c_{2k+1})`.

**S-box counts per external-compressed row:** 4 (round `2k`) + 4 (round `2k+1`) = 8.

**Row count:** 8 → 4. Plus the transition rows on each side of the external block remain (same as today; they're standard-encoded for permutation-argument consistency with the surrounding circuit).

This piece is **independent of K=8 internal** — could land separately if the internal-block change misbehaves.

---

## Wire / selector budget

New committed wires: `w_5, w_6, w_7, w_8`. These are added to MegaFlavor permanently.

- Internal block uses them for K=8 layout (s_0 at rounds 4..7).
- External-compressed block uses them for the second-round state.
- Outside Poseidon2 rows they are zero → Pippenger filters them. Per the bench data in `poseidon2-compression-analysis.md`, zero-poly extras are nearly free in MSM.

New selectors: same shape as K=4 but more constants per row. Specifically:
- `q_poseidon2_quad_internal_k8` (interior-row activator)
- `q_poseidon2_quad_internal_k8_terminal`
- `q_poseidon2_transition_entry_k8`
- `q_poseidon2_external_compressed`

Selector polys are also zero outside their blocks → no MSM cost there.

Round constants: K=4 uses 7 selector channels per row (4 own + 3 next-pair). K=8 needs 8 own + 3 next-pair, but **the next-pair constants can be read via shifts of the row-after's own selectors** — `q_l_shift, q_r_shift, q_o_shift` on a K=8 interior row equal the next row's `q_l, q_r, q_o` = its current-row rounds 0, 1, 2 = the next pair's first three round constants in the global sequence. No dedicated next-pair selectors needed.

That brings the per-row count down to 8 own constants. Existing channels are `q_l, q_r, q_o, q_4, q_m, q_c, q_5` = 7. Add **1 new selector** `q_6` to reach 8. (`q_m, q_c, q_5` get repurposed as current-row rounds 4, 5, 6 on K=8 rows; they are zero on rows of other kinds.)

Caveat: the **K=8 terminal row cannot use shifts** for next-pair constants because its successor is standard-encoded, not K=8. Same as the K=4 terminal, it simply skips the shift-side Vandermonde — its successor is glued in via the standard 4-wire copy constraint, not the forward Vandermonde check. So the shift trick is safe.

### Activator selectors

Mirroring K=4's pattern, K=8 needs separate activator selectors per row type. **4 new gate-style selectors** in total:

| Selector | Active rows | Role |
|----------|-------------|------|
| `q_poseidon2_transition_entry_k8` | 1 entry row | Bridges external block's standard 4-wire output into the K=8 layout. Enforces the K=8-row-derived `(s_1, s_2, s_3)` at round 0 (from the Vandermonde solve) match the external block's actual output state. Without this, the prover could pick any consistent triple and the chain becomes unconstrained. |
| `q_poseidon2_k8_internal` | 7 interior rows | The K=8 compressed internal-round relation (this document's main subject). |
| `q_poseidon2_k8_internal_terminal` | 1 terminal row | Maps state at round 56 back to the standard 4-wire encoding for the post-internal external block. Skips the shift-side Vandermonde since its successor is standard-encoded, not K=8. |
| `q_poseidon2_external_compressed` | 4 compressed external rows | Two-rounds-per-row external block. **No** entry/exit selectors needed: each compressed row's row-boundary state lives in standard 4 wires (incoming `(w_l..w_4)`, outgoing `(w_l_shift..w_4_shift)`), copy-constrainable to surrounding code. The auxiliary `(p2_w_5..p2_w_8)` only holds intermediate (round 2k+1) state — never crosses a row boundary. |

The standard `q_poseidon2_internal` and `q_poseidon2_external` selectors are **kept** in the flavor — they're for non-K=8 Mega circuits. K=8-using circuits leave them zero. The two systems coexist at the flavor level but never activate on the same row.

---

## Cost model

Approximate Acc-mul count per row (current K=4 interior is 461 muls; this is the comparison point):

| Component | K=4 | K=8 |
|-----------|----:|----:|
| Current-row S-boxes (each: sqr;sqr;mul = 21 muls) | 4 × 21 = 84 | **8 × 21 = 168** |
| Shift-side S-boxes (3 × 21) | 63 | 63 (same) |
| Vandermonde RHS `b_1, b_2, b_3` | 44 | ~50 (more `u_k` terms in `b_3`) |
| Lagrange solve (9 × Acc×Fr) | 63 | 63 (same — still 3×3) |
| Recurrence step ×K (3 × 7 each) | 84 | **168** |
| `out_0` linearization | 7 | 7 |
| Shift-side `b_k_next` | 44 | 44 |
| Subrelation A_0..A_3 outputs | 70 | 70 |
| Selector × scaling factor | 2 | 2 |
| **Total** | **461** | **~635** |

Per **internal-round** (divide by K):
- K=4: 461 / 4 = **115 muls/round**
- K=8: 635 / 8 = **79 muls/round**

So K=8 is ~31% cheaper per internal round in raw mul count. Whether that translates to wall-time depends on:

1. **Sumcheck fixed costs.** Same accumulator shape and partial length; the per-round overhead in `compute_univariate_with_row_skipping` is dominated by `NUM_SUBRELATIONS` and `NUM_ALL_ENTITIES`. K=8 adds 4 entities (4 new wires) and at most 4 subrelations (the K=8 interior + terminal + entry + external-compressed), so per-round overhead grows by ~10–15% — marginally worse than K=4 in this dimension.

2. **Row-count win on internal block.** 16 → 10 = −37.5% rows. Per-row cost grows ~1.4× (461 → 635), so total internal-block sumcheck contribution: `10 × 635 = 6350` vs K=4's `16 × 461 = 7376` → **~14% reduction in mul-count contribution from internal block**.

3. **External-block compression.** 8 → 4 rows independently of the K=8 internal change. External relation is degree-5 already, partial-length 7 like everything else. Halving rows ≈ halves external-block sumcheck contribution.

**Net target: ~10–15% sumcheck reduction on Poseidon2-heavy traces vs K=4.** Per the existing analysis where K=4 vs `mt` saw ~−10% native end-to-end, this could plausibly push the cumulative win to ~−15–20% vs `mt` — but the prior K=4 → K=8 increment alone is the smaller piece.

---

## Implementation steps (against clean `merge-train/barretenberg`)

1. **Branch off merge-train.**
   ```
   git fetch origin merge-train/barretenberg
   git checkout -b si/poseidon2-k8 origin/merge-train/barretenberg
   ```
   Confirm no K=4 selectors/wires/relations are present before starting.

2. **Add the 4 new wires to MegaFlavor as shift-only auxiliary state.**
   - Add to `WireEntities` / `ALL_ENTITIES` and the shifts table (so `w_5..w_8` and their shifts are visible to sumcheck/PCS/relations).
   - **Do NOT extend the permutation argument** — these wires never participate in σ copy constraints; their across-row consistency is enforced by shifts inside the K=8 relation. σ/id polys stay 4-wide.
   - VK gains 4 commitments; update `MEGA_VK_LENGTH_IN_FIELDS` and downstream Noir/TS constants.

3. **Add 1 new selector `q_6`** for the 8th current-row round constant; reuse `q_m, q_c, q_5` for rounds 4..6. Next-pair constants come from `q_l_shift, q_r_shift, q_o_shift`. Update `mega_circuit_builder` to expose the setter.

4. **New relation files in `barretenberg/cpp/src/barretenberg/relations/`:**
   - `poseidon2_quad_internal_k8_relation.hpp` (interior K=8 row)
   - `poseidon2_quad_internal_k8_terminal_relation.hpp`
   - `poseidon2_transition_entry_k8_relation.hpp`
   - `poseidon2_external_compressed_relation.hpp`
   
   Each follows the K=4 structure (see `poseidon2_double_internal_relation.hpp` for the template). Most useful crib: the Vandermonde solve is identical to K=4 — same `Poseidon2QuadBn254Params` constants. Just more S-boxes and recurrence steps in the interior body.

5. **Trace block layout in `mega_circuit_builder.cpp`:**
   - Add Poseidon2 internal-K8 block (writes 1 entry + 7 interior + 1 terminal + 1 standard-transition row per permutation).
   - Add Poseidon2 external-compressed block (writes 4 compressed rows + 1 transition row per side per permutation).
   - Update `create_poseidon2_internal_gate` / `create_poseidon2_external_gate` builder methods to emit the new layout.

6. **Update sumcheck/decider relations registration.** Add the new relations to `MegaFlavor::Relations_`.

7. **VK regen + chonk standalone test**:
   - Build native: `AVM=0 ./bootstrap.sh build_native`
   - Update VKs: `cd barretenberg/cpp/scripts && ./test_chonk_standalone_vks_havent_changed.sh --update_inputs`
   - Verify: `--prove_and_verify`

8. **CI labels:** `ci-barretenberg` is fine for the iteration; `ci-barretenberg-full` before merge to catch ARM/macOS/SMT regressions.

9. **Tests:**
   - Unit-level: extend `crypto/poseidon2/poseidon2_quad_params.test.cpp` (or sibling) to cover the K=8 algebra against the reference Poseidon2 hash.
   - Relation-level: add a `poseidon2_k8_relations.test.cpp` that builds a small circuit, materializes the trace, and runs each subrelation pointwise.
   - Circuit-level: add `mega_poseidon2_k8.test.cpp` that proves a hash and verifies — guardrails against permutation-argument bugs from the new wires.

10. **Benches:**
    - Reuse the new `construct_proof_megahonk_poseidon2_hash` bench (added in this branch's diff). Sweep 1500..50000.
    - Compare K=8 vs K=4 vs `mt` on the 11 pinned IVC flows (CI bench page).
    - Critical metric: sumcheck wall-time at 2^16..2^21, since that's where the K=4 → K=8 trade-off lives.

---

## Risk areas

- **Trace block alignment.** New blocks must respect `TRACE_OFFSET` and dyadic rounding rules. K=8 internal block has 7 interior rows per permutation — non-power-of-2 row counts have historically caused alignment quirks.
- **Boundary copy constraints to standard 4-wire neighbors.** The transition rows (between external and compressed-internal blocks, and the post-internal side) still rely on the 4-wire permutation argument to glue Poseidon2 state into the surrounding circuit. Make sure the K=8 entry/terminal rows expose the right slice of state in `w_l..w_4` for those copy constraints.
- **VK length growth.** 4 new wires + 1 new selector `q_6` + a handful of new Poseidon2-block activator selectors (~4) = ~9 new committed polynomials in VK. Update all length-asserting constants and Noir/TS mirrors.
- **Browser/WASM memory.** Going from ~22 to ~30 committed Mega polynomials means more N-sized buffers allocated. Per the K=4 bench data, native is fine but WASM peak memory was sensitive — re-check `wasm-threads` peaks at the largest IVC flow.
- **Sumcheck per-round overhead.** Adding 4 entities + 4 subrelations grows `c_M` (per-round amortized cost). Per the analysis, this hurts the small-N ratio more than the large-N ratio. Keep an eye on the per-row `μs/row` curve at 2^15..2^17.

---

## Decision points to revisit during implementation

- **Selector channels (Option A vs B).** If A blows up VK length or per-row commit count uncomfortably, fall back to a small lookup table of round constants.
- **External-block compression alone.** If K=8 internal turns out to underperform, ship the external 8→4 piece independently — it's a cleaner, less risky change.
- **Drop redundant subrelations.** The 7×7 system has rank 3, so 4 of the inter-round equations are redundant. We use the first 3 only. Confirm during impl that no soundness gap is introduced (the redundancy is over the field, not the constraint system — each redundant equation is implied by the others *on the constraint*, but a cheating prover could in principle violate one without affecting the kept three. Need to verify all 7 rounds' algebra is captured by the 3-row Vandermonde + the K=8 native unroll inside the relation).
