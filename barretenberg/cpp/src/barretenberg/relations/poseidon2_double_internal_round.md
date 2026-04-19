# Poseidon2 Quad Internal Round Relations — 7-wire committed-state variant

> **Naming note.** This document describes the **K=4 / 7-wire** encoding: state[0] at 4 consecutive
> internal rounds is stored in the 4 main wires, and state[1..3] at row start is stored in 3
> dedicated witness wires `w_p2_s1, w_p2_s2, w_p2_s3`. File paths / selectors / relation classes
> still use `double_internal` naming until the rename lands.

## Motivation

In client IVC (chonk), ~50% of the circuit is Poseidon2 hashing. Of the 64 rows per permutation,
56 are internal rounds — roughly 44% of the entire circuit. Each committed row adds to the
Hypernova accumulator, so shortening the internal-rounds block directly shrinks every committed
polynomial and cheapens the HN decider.

## Why this works

Three facts about Poseidon2 internal rounds combine.

**Fact 1 — Sparse nonlinearity.** Each internal round applies the S-box $x \mapsto x^5$ to
**state[0] only**. State[1, 2, 3] pass through linearly.

**Fact 2 — $M_I$ is "diagonal plus all-ones".**
$$
M_I = \begin{pmatrix} D_1 & 1 & 1 & 1 \\ 1 & D_2 & 1 & 1 \\ 1 & 1 & D_3 & 1 \\ 1 & 1 & 1 & D_4 \end{pmatrix}
$$
Each round's new state[j], $j > 0$, is $u_k + \mathbf{1}^T \mathbf{s}^{(k)} + (D_{j+1} - 1) s_j^{(k)}$,
linear in $\{u_k, s_1^{(k)}, s_2^{(k)}, s_3^{(k)}\}$.

**Fact 3 — Full state committed at row start.** We commit
$(s_0^{(4i)}, s_0^{(4i+1)}, s_0^{(4i+2)}, s_0^{(4i+3)})$ in the 4 main wires AND
$(s_1^{(4i)}, s_2^{(4i)}, s_3^{(4i)})$ in 3 dedicated witness wires. The relation advances the
state 4 rounds natively with only the 4 S-boxes $u_0, u_1, u_2, u_3$ (one per round), each
applied to its own committed wire (degree firewall intact). State[1..3] at round 4 are
constrained against the next row's committed state[1..3] at that row's start.

**Why the degree doesn't blow up.** Each $u_k$ is degree 5 in its OWN wire — $u_0$ in $w_l$,
$u_1$ in $w_r$, $u_2$ in $w_o$, $u_3$ in $w_4$. State[1..3] at any round is a linear
combination of $\{u_0, \ldots, u_{k-1}\}$ and the committed $\{w_{p2\_s1}, w_{p2\_s2},
w_{p2\_s3}\}$; no S-box composes on a derived quantity. Each subrelation univariate degree
stays at 5 + selector + gate separator = **7**.

**One-line summary.** Committing state[1..3] at row start — 3 extra sparse witness wires —
removes the 3×3 Vandermonde row-reduction, all 3 next-pair firewall S-boxes, and the `q_5`
precomputed column that the 4-wire Vandermonde variant needs.

### Why this is specific to Poseidon2 internal rounds

- External rounds S-box all four elements: no redundant-wire story.
- Full Poseidon (non-2) has the same issue.
- The "forward recurrence is linear in `sum_k`" property is what makes the $K$-round
  computation $O(K)$ linear work in addition to the $K$ S-boxes.

### Why the extra wires are cheap

bb's Pippenger MSM explicitly skips zero scalars (see
`ecc/scalar_multiplication/scalar_multiplication.cpp::transform_scalar_and_get_nonzero_scalar_indices`).
The 3 new wires are zero on every row except the ~14 Poseidon2 compressed rows per permutation,
so their per-wire MSM cost is ~$14P / T$ of a dense wire — a small single-digit percentage of
the total commitment work.

## Scope

The compressed encoding is **Mega-only**. UltraFlavor and its derivatives retain the standard
56-single-round layout. Mega stdlib dispatches on `Builder` at compile time:

```cpp
if constexpr (std::is_same_v<Builder, MegaCircuitBuilder>) {
    // 1 entry + 13 interior + 1 terminal + 1 bridge
} else {
    // original 56 single-round layout
}
```

## Ultra (baseline) encoding

Per row: $w_l = s_0, w_r = s_1, w_o = s_2, w_4 = s_3$; one internal round. 73 gates per
permutation, degree 7.

## Mega compressed encoding (7-wire)

### Per-row wire layout

For a compressed row $i$ processing rounds $4i, 4i+1, 4i+2, 4i+3$:

| Wire       | Content                                |
|------------|----------------------------------------|
| $w_l$      | $s_0$ at round $4i$                    |
| $w_r$      | $s_0$ at round $4i+1$                  |
| $w_o$      | $s_0$ at round $4i+2$                  |
| $w_4$      | $s_0$ at round $4i+3$                  |
| $w_{p2\_s1}$ | $s_1$ at round $4i$                  |
| $w_{p2\_s2}$ | $s_2$ at round $4i$                  |
| $w_{p2\_s3}$ | $s_3$ at round $4i$                  |

Non-gate selectors on interior rows:

| Selector | Content   | Purpose               |
|----------|-----------|-----------------------|
| $q_l$    | $c_{4i}$  | round-0 S-box constant |
| $q_r$    | $c_{4i+1}$ | round-1              |
| $q_o$    | $c_{4i+2}$ | round-2              |
| $q_4$    | $c_{4i+3}$ | round-3              |

`q_5, q_m, q_c` are no longer overloaded on Poseidon2 rows — the firewall S-boxes for the next
pair are gone in this encoding. `q_5` as a precomputed column **can be removed** from the Mega
VK (1 precomputed commitment dropped).

## Per-permutation layout (Mega)

Round numbering is relative to the internal-rounds block (0..55).

| Rows | Block | Active selector | Purpose |
|----:|-------|-----------------|---------|
| 6 | `arithmetic` | `q_arith` | initial external linear layer |
| 4 + 1 propagate | `poseidon2_external` | `q_poseidon2_external` | first-half external rounds |
| 1 | `poseidon2_double_internal` | `q_poseidon2_transition_entry` | standard → compressed entry |
| 13 | `poseidon2_double_internal` | `q_poseidon2_double_internal` | interior compressed quads |
| 1 | `poseidon2_double_internal` | `q_poseidon2_double_internal_terminal` | terminal compressed quad |
| 1 | `poseidon2_double_internal` | none | compressed → standard bridge |
| 4 + 1 propagate | `poseidon2_external` | `q_poseidon2_external` | second-half external rounds |

**Total: 32 rows per permutation** (same as the 4-wire Vandermonde variant; the 7-wire encoding
does not change row count, only per-row relation work and VK footprint).

## The core algebraic step — forward recurrence

Let state at round $k$ be $(s_0^{(k)}, \mathbf{s}^{(k)})$ with $\mathbf{s} = (s_1, s_2, s_3)^T$;
let $u_k = (s_0^{(k)} + c_{4i+k})^5$. The recurrence:
$$
s_0^{(k+1)} = D_1 u_k + \mathbf{1}^T \mathbf{s}^{(k)}, \qquad
\mathbf{s}^{(k+1)} = u_k \mathbf{1} + M \mathbf{s}^{(k)}
$$
where $M$ is the $3 \times 3$ reduced internal matrix with diagonal $(D_2, D_3, D_4)$ and
off-diagonal 1s.

We carry `sum_k := s_1^{(k)} + s_2^{(k)} + s_3^{(k)}` across rounds; each subrelation
captures one "checkpoint":

$$
\boxed{
\begin{aligned}
A_0 &:\ D_1 u_0 + \text{sum}_0 = w_r            & (\text{state}[0]\ \text{at round 1}) \\
A_1 &:\ D_1 u_1 + \text{sum}_1 = w_o            & (\text{state}[0]\ \text{at round 2}) \\
A_2 &:\ D_1 u_2 + \text{sum}_2 = w_4            & (\text{state}[0]\ \text{at round 3}) \\
A_3 &:\ D_1 u_3 + \text{sum}_3 = w_{l,\text{shift}}  & (\text{state}[0]\ \text{at round 4}) \\
A_4 &:\ s_1\ \text{at round 4} = w_{p2\_s1,\text{shift}} & (\text{state}[1]\ \text{at round 4}) \\
A_5 &:\ s_2\ \text{at round 4} = w_{p2\_s2,\text{shift}} & \\
A_6 &:\ s_3\ \text{at round 4} = w_{p2\_s3,\text{shift}} &
\end{aligned}
}
$$

**7 subrelations, each of degree 5 + selector (1) + gate-separator (1) = 7.**

## Three relations, all degree 7

### 1. `Poseidon2TransitionEntryRelation` (entry) — 6 subrelations

The entry row holds the external output $(s_0, s_1, s_2, s_3)$ in standard encoding. The
successor's 4 main wires pin state[0] at rounds 0..3 via the firewall-S-box chain; the
successor's 3 extra wires pin state[1..3] at round 0 directly (linear).

$$
\begin{aligned}
A_0 &:\ w_{r,\text{shift}} - D_1 u_0 - w_r - w_o - w_4 = 0 & (\text{state}[0]\ \text{at round 1}) \\
A_1 &:\ w_{o,\text{shift}} - D_1 (w_{r,\text{shift}} + q_r)^5 - 3 u_0 - \text{(lin.)} = 0 & (\text{round 2}) \\
A_2 &:\ w_{4,\text{shift}} - D_1 (w_{o,\text{shift}} + q_o)^5 - 3 u_1 - (\Sigma + 6) u_0 - \text{(lin.)} = 0 & (\text{round 3}) \\
A_3 &:\ w_{p2\_s1,\text{shift}} - w_r = 0 & \\
A_4 &:\ w_{p2\_s2,\text{shift}} - w_o = 0 & \\
A_5 &:\ w_{p2\_s3,\text{shift}} - w_4 = 0 &
\end{aligned}
$$

$w_{l,\text{shift}} = s_0$ is copy-constrained via sigma (shared witness index with the entry row's $w_l$).

### 2. `Poseidon2DoubleInternalRelation` (interior) — 13 rows, 7 subrelations

As boxed above.

### 3. `Poseidon2DoubleInternalTerminalRelation` (terminal) — 1 row, 7 subrelations

Same 4-round forward recurrence as interior. Successor is the standard-encoded bridge row:
$A_4/A_5/A_6$ match round-4 state[1..3] against $(w_{r,\text{shift}}, w_{o,\text{shift}},
w_{4,\text{shift}})$ directly (bridge row's state[1..3]).

## Soundness

**Entry boundary.** Entry row's $(w_l, w_r, w_o, w_4)$ = external output via sigma. $A_0, A_1,
A_2$ pin state[0] at rounds 1, 2, 3 of the first compressed row via the firewall-S-box chain
(each subrelation uses the successor's committed wire as a fresh degree-5 input). $A_3, A_4,
A_5$ pin state[1..3] at round 0 of the first compressed row linearly.

**Interior chain.** For each interior row: the 4 state[0] checkpoints $(w_r, w_o, w_4,
w_{l,\text{shift}})$ and 3 state[1..3] checkpoints $(w_{p2\_s_k,\text{shift}})$ uniquely
determine the entire row given the committed input state. Zero prover freedom once the entry
relation is fixed.

**Terminal + bridge.** Terminal pins the bridge row's standard state. Bridge row shares witness
indices with the first final-external gate via sigma.

## Prover skip optimization

Each relation is gated by its own selector and implements `skip(AllEntities)` returning true
when the selector is identically zero. Entry and terminal fire on exactly one row per
permutation; interior on 13 rows.

## Cost comparison (vs 4-wire Vandermonde variant)

|                              | Ultra | Mega K=4 (4-wire Vandermonde) | Mega K=4 (7-wire, this design) |
|------------------------------|------:|------------------------------:|-------------------------------:|
| Rows per permutation         | 73    | 32                            | 32                             |
| Witness wires (Mega-wide)    | 4 + deriv | 4 + deriv                  | 4 + deriv + **3 sparse**       |
| Precomputed cols vs Ultra    | —     | +3 (new gate selectors + `q_5`)| +2 (new gate selectors; no `q_5`) |
| Firewall S-boxes / interior row | — | 3 (next-pair)                | **0**                          |
| Vandermonde solve / row      | —     | 15 Acc-scalar mults           | **0**                          |
| S-boxes / interior row       | —     | 7 (4 main + 3 firewall)       | **4**                          |
| Interior relation subrels    | —     | 4                             | 7                              |
| Max subrelation degree       | 7     | 7                             | 7                              |
| Per-row relation work (length-7 mults) | — | ~448                  | **~245 (−45%)**                |
| MSM extra-wire cost          | —     | 0                             | ~3 × 10% of a dense wire       |

**Net prover-time estimate** (chonk profile, commitment ~55%, sumcheck ~25%): **~−2%** on top
of the 4-wire K=4 win versus Ultra.

## Precomputed column delta (vs Ultra)

**Added:**
- `q_poseidon2_transition_entry` (gate selector)
- `q_poseidon2_double_internal` (gate selector)
- `q_poseidon2_double_internal_terminal` (gate selector)

**Removed:**
- `q_poseidon2_internal` (compressed block covers all 56 internal rounds)

**Net: +2** precomputed columns. `q_5` is NOT added in the 7-wire variant.

## Witness column delta (vs Ultra)

**Added:**
- `w_p2_s1` (witness wire, non-zero only on Poseidon2 compressed rows)
- `w_p2_s2`
- `w_p2_s3`

Each is sparse; bb's Pippenger skips zero scalars so per-wire MSM cost ≈ (Poseidon2 row fraction) × (dense wire MSM).

## Files

- `poseidon2_transition_entry_relation.hpp` — entry (6 subrels, deg 7)
- `poseidon2_double_internal_relation.hpp` — interior (7 subrels, deg 7)
- `poseidon2_double_internal_terminal_relation.hpp` — terminal (7 subrels, deg 7)
- `poseidon2_quad_params.hpp` — just $D_i$ and $\Sigma$; no Vandermonde algebra
- `flavor/mega_flavor.hpp` — add `w_p2_s1, w_p2_s2, w_p2_s3` to `DerivedEntities`; add
  `w_p2_s1_shift, w_p2_s2_shift, w_p2_s3_shift` to `ShiftedEntities`; drop `q_5` from
  `PrecomputedEntities` and `get_non_gate_selectors`
- `honk/execution_trace/mega_execution_trace.hpp` — `MegaTracePoseidon2DoubleInternalBlock`
  needs per-row storage for the 3 new wire values (prototype leaves this as TODO)
- `honk/execution_trace/gate_data.hpp` — `poseidon2_double_internal_gate_` and
  `poseidon2_transition_entry_gate_` gain fields for the row's starting (s_1, s_2, s_3)
- `stdlib_circuit_builders/ultra_circuit_builder.cpp` — `create_poseidon2_double_internal_gate`
  and `create_poseidon2_transition_entry_gate` populate the 3 new wires
- `stdlib/hash/poseidon2/poseidon2_permutation.cpp` — Mega dispatch emits (s_1, s_2, s_3) per
  compressed row alongside the 4 state[0] values

## Finishing checklist (TODOs for this prototype)

This PR contains the algorithmic prototype (relations + `poseidon2_quad_params.hpp` +
`mega_flavor.hpp` entity additions). The following integration steps are NOT yet done and are
required before any tests can pass:

- [ ] `TraceToPolynomials` path populating `w_p2_s1/s2/s3` from the circuit builder's
  per-block state-value storage.
- [ ] Circuit builder changes in `ultra_circuit_builder.cpp` to plumb (s_1, s_2, s_3) values
  into that storage on every compressed row.
- [ ] `MegaTracePoseidon2DoubleInternalBlock` extended to carry the 3 state-value vectors.
- [ ] `gate_data.hpp` struct updates.
- [ ] Drop `q_5` from the trace and flavor non-gate selector list.
- [ ] `circuit_checker/ultra_circuit_checker.cpp` wired relation checks updated for the new
  subrelation counts (6 / 7 / 7).
- [ ] Drop `q_m, q_c` overloading with next-pair round constants on Poseidon2 rows.
- [ ] Update `poseidon2.double_internal_soundness.test.cpp` for the new layout.
- [ ] Constants: `CHONK_PROOF_LENGTH`, `HIDING_KERNEL_VK_LENGTH_IN_FIELDS`,
  `NUM_WITNESS_ENTITIES` (changes due to the 3 new witness cols + 3 new shifts).
- [ ] Noir `constants.nr` + `yarn remake-constants`.
- [ ] VK pin regeneration via `test_chonk_standalone_vks_havent_changed.sh --update_inputs`
  (requires explicit permission).
- [ ] Chonk proof-compression codec update (subrelation count changes).
- [ ] Prover.toml regenerations for noir-protocol-circuits VK pins.
