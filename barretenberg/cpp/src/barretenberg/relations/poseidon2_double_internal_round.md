# Poseidon2 Quad Internal Round Relations

> **Naming note.** This document describes a **K=4** compressed encoding (4 internal rounds per
> compressed row). Earlier iterations used K=2 and referred to the construction as "double";
> the file paths / selectors / relation classes still use `double_internal` naming until the
> rename lands. Treat "double" in code identifiers as "quad" semantically.

## Motivation

In client IVC (chonk), ~50% of the circuit is Poseidon2 hashing. Of the 64 rows per permutation,
56 are internal rounds — roughly 44% of the entire circuit. Each committed row adds to the
Hypernova accumulator, so shortening the internal-rounds block directly shrinks every committed
polynomial and cheapens the HN decider.

## Why this works (intuition)

Three facts about Poseidon2 internal rounds combine.

**Fact 1 — Sparse nonlinearity.** Each internal round applies the S-box $x \mapsto x^5$ to
**state[0] only**. State[1, 2, 3] pass through linearly. This is the core design choice of
Poseidon2 (vs. full Poseidon) and the reason internal rounds are cheap.

**Fact 2 — $M_I$ is "diagonal plus all-ones".**
$$
M_I = \begin{pmatrix} D_1 & 1 & 1 & 1 \\ 1 & D_2 & 1 & 1 \\ 1 & 1 & D_3 & 1 \\ 1 & 1 & 1 & D_4 \end{pmatrix}
$$
The first row gives $v_0 = D_1 u_1 + s_1 + s_2 + s_3$ — linear in $(s_1, s_2, s_3)$ with
coefficient 1 on each. Every round produces one such linear equation that lets us *solve
backwards* for the non-S-boxed state elements given enough state[0] values.

**Fact 3 — One wire = one round's state[0].** Instead of committing
$(s_0, s_1, s_2, s_3)$ per row (standard encoding), we commit **four consecutive state[0]
values**: $w_l, w_r, w_o, w_4$ = $s_0^{(0)}, s_0^{(1)}, s_0^{(2)}, s_0^{(3)}$ at the start of
4 consecutive internal rounds. Three applications of Fact 2 give a 3×3 linear system for
$(s_1, s_2, s_3)$ at row-start. We then compute 4 rounds per row instead of 1.

**Why the degree doesn't blow up.** Each S-box $u_k = (s_0^{(k)} + c_k)^5$ is degree 5 in
*its own wire*. The linear solve produces $(s_1, s_2, s_3)$ as fixed-coefficient combinations
of $\{u_0, u_1, u_2\}$ and $\{w_r, w_o, w_4\}$ — still degree 5 in any single wire. Subsequent
rounds compose these with more $u_k$ on *different* wires. No wire appears as an inlined degree-5
input to another wire's S-box — each wire is its own "degree firewall". Max univariate degree
per subrelation stays at 5; with selector + gate separator: **7**.

**One-line summary.** We exploit the algebraic redundancy of $(s_1, s_2, s_3)$ in Poseidon2
internal rounds — reducible to state[0] chains via $M_I$'s first-row equation — to commit 4
rounds of state[0] per row instead of 1 round of full state.

### Why this is specific to Poseidon2 internal rounds

- External rounds S-box all four elements: no linear-only elements to eliminate.
- Full Poseidon (non-2) same story.
- Other sponges with different matrix structures need separate analyses.
- $M_I$'s "diagonal + ones" structure is what makes the 3 derived linear equations land in a
  **Vandermonde** form (see §3), which has a clean closed-form inverse.

### Why boundaries need extra work

The compression changes the *meaning* of $w_r, w_o, w_4$ (state[0] at later rounds inside the
compressed block vs. state[1, 2, 3] outside). At the boundaries with standard-encoded rows
(first and last external rounds), dedicated transition relations cryptographically bind the
new wires to the true chain values.

## Scope

The compressed encoding is **Mega-only**. `UltraFlavor` and its derivatives retain the standard
56-single-round layout, so Ultra proof formats, Solidity verifiers, proof sizes, and
`LIBRA_UNIVARIATES_LENGTH` are all unchanged. The stdlib permutation dispatches on `Builder`
at compile time:

```cpp
if constexpr (std::is_same_v<Builder, MegaCircuitBuilder>) {
    // 1 entry + 13 interior + 1 terminal + 1 standard-transition bridge
    // (all 56 internal rounds packed into 14 compressed rows at K=4)
} else {
    // original 56 single-round layout
}
```

## Ultra (baseline) encoding

Per row: $w_l = s_0, w_r = s_1, w_o = s_2, w_4 = s_3$; one internal round, 4 subrelations
enforcing $v_k = w_{k,\mathrm{shift}}$. **73 gates per permutation**, subrelation degree 7.

## Mega compressed encoding — per-row wire layout

For a compressed row $i$ processing rounds $4i, 4i+1, 4i+2, 4i+3$:

| Wire   | Content                                     |
|--------|---------------------------------------------|
| $w_l$  | $s_0^{(0)} = \text{state}[0]$ at round $4i$ |
| $w_r$  | $s_0^{(1)} = \text{state}[0]$ at round $4i+1$ |
| $w_o$  | $s_0^{(2)} = \text{state}[0]$ at round $4i+2$ |
| $w_4$  | $s_0^{(3)} = \text{state}[0]$ at round $4i+3$ |

Non-gate selectors (interior rows) carry round constants:

| Selector | Content                                       | Purpose                                  |
|----------|-----------------------------------------------|------------------------------------------|
| $q_l$    | $c_{4i}$                                      | this pair's round-0 S-box                |
| $q_r$    | $c_{4i+1}$                                    | round-1 S-box                            |
| $q_o$    | $c_{4i+2}$                                    | round-2 S-box                            |
| $q_4$    | $c_{4i+3}$                                    | round-3 S-box                            |
| $q_m$    | $c_{4(i+1)}$                                  | next pair's round-0 (for $s_1^{\mathrm{next}}$ recon) |
| $q_c$    | $c_{4(i+1)+1}$                                | next pair's round-1 (for $s_2^{\mathrm{next}}$ recon) |
| $q_5$    | $c_{4(i+1)+2}$                                | next pair's round-2 (for $s_3^{\mathrm{next}}$ recon) |

`q_5` is a **new precomputed non-gate selector column**. `q_m` and `q_c` are existing Mega
columns; overloading them on compressed rows is safe since `q_arith = 0` there, so the
arithmetic relation vanishes regardless.

## Per-permutation layout (Mega)

Round numbering is relative to the internal-rounds block (0..55). Absolute `round_constants`
indices are 4..59 (offset by `rounds_f_beginning = 4`).

| Rows | Block | Active selector | Purpose |
|----:|-------|-----------------|---------|
| 6 | `arithmetic` | `q_arith` | initial external linear layer ($M_E$ mul) |
| 4 + 1 propagate | `poseidon2_external` | `q_poseidon2_external` | first-half external rounds |
| 1 | `poseidon2_double_internal` | `q_poseidon2_transition_entry` | standard → compressed entry transition |
| 13 | `poseidon2_double_internal` | `q_poseidon2_double_internal` | interior compressed quads (rounds 0..51) |
| 1 | `poseidon2_double_internal` | `q_poseidon2_double_internal_terminal` | terminal compressed quad (rounds 52..55) |
| 1 | `poseidon2_double_internal` | none (unconstrained) | compressed → standard bridge |
| 4 + 1 propagate | `poseidon2_external` | `q_poseidon2_external` | second-half external rounds |

The `poseidon2_internal` block is **not used** by Mega; the compressed block covers all 56
internal rounds.

**Total: 32 gates per permutation** (vs 73 original → **56% reduction**).

## The core algebraic step — solving for $(s_1, s_2, s_3)$

Let state after $k$ rounds be $(s_0^{(k)}, \mathbf{s}^{(k)})$ with $\mathbf{s} = (s_1, s_2, s_3)^T$;
let $u_k = (s_0^{(k)} + c_{4i+k})^5$. The recurrence is:
$$
s_0^{(k+1)} = D_1 u_k + \mathbf{1}^T \mathbf{s}^{(k)}, \qquad \mathbf{s}^{(k+1)} = u_k \mathbf{1} + M \mathbf{s}^{(k)}
$$
where $M$ is the $3 \times 3$ reduced internal matrix
$$
M = \begin{pmatrix} D_2 & 1 & 1 \\ 1 & D_3 & 1 \\ 1 & 1 & D_4 \end{pmatrix}.
$$

Applying the recurrence three times yields the **Vandermonde** system
$$
\underbrace{\begin{pmatrix} 1 & 1 & 1 \\ D_2 & D_3 & D_4 \\ D_2^2 & D_3^2 & D_4^2 \end{pmatrix}}_{V} \mathbf{s} = \mathbf{b}
$$
with
$$
\begin{aligned}
b_1 &= w_r - D_1 u_0 \\
b_2 &= w_o - 2 w_r + (2 D_1 - 3) u_0 - D_1 u_1 \\
b_3 &= w_4 - w_o - (\Sigma + 2) w_r + \big((\Sigma + 2) D_1 - \Sigma - 3\big) u_0 + (D_1 - 3) u_1 - D_1 u_2
\end{aligned}
$$
and $\Sigma = D_2 + D_3 + D_4$.

### Invertibility

$\det V = (D_3 - D_2)(D_4 - D_2)(D_4 - D_3)$. BN254's Poseidon2 diagonals (minus 1) are:
- $D_2 - 1 = $ `0x0c28145b6a44df3e0149b3d0a30b3bb599df9756d4dd9b84a86b38cfb45a740b`
- $D_3 - 1 = $ `0x00544b8338791518b2c7645a50392798b21f75bb60e3596170067d00141cac15`
- $D_4 - 1 = $ `0x222c01175718386f2e2e82eb122789e352e105a3b8fa852613bc534433ee428b`

Three distinct values well below the scalar prime, so $D_2, D_3, D_4$ are pairwise distinct
and $\det V \ne 0$. **The Vandermonde system is invertible for BN254 Poseidon2.** Adding a
`static_assert` on pairwise distinctness in the relation guards against future parameter changes.

### Closed-form inverse (Lagrange)

$$
s_j = \sum_{k=1}^{3} \alpha_j^{(k)} \, b_k, \qquad
\alpha_j^{(k)} \text{ = coefficient of } x^{k-1} \text{ in } L_j(x) = \prod_{l \ne j+1} \frac{x - D_l}{D_{j+1} - D_l}
$$

Concretely (taking $j \in \{1,2,3\}$ corresponding to nodes $D_2, D_3, D_4$):

| $j$ | $\alpha_j^{(1)}$ | $\alpha_j^{(2)}$ | $\alpha_j^{(3)}$ |
|---|---|---|---|
| 1 | $\dfrac{D_3 D_4}{(D_2-D_3)(D_2-D_4)}$ | $\dfrac{-(D_3+D_4)}{(D_2-D_3)(D_2-D_4)}$ | $\dfrac{1}{(D_2-D_3)(D_2-D_4)}$ |
| 2 | $\dfrac{D_2 D_4}{(D_3-D_2)(D_3-D_4)}$ | $\dfrac{-(D_2+D_4)}{(D_3-D_2)(D_3-D_4)}$ | $\dfrac{1}{(D_3-D_2)(D_3-D_4)}$ |
| 3 | $\dfrac{D_2 D_3}{(D_4-D_2)(D_4-D_3)}$ | $\dfrac{-(D_2+D_3)}{(D_4-D_2)(D_4-D_3)}$ | $\dfrac{1}{(D_4-D_2)(D_4-D_3)}$ |

All 9 coefficients are **fixed field constants** computable as `constexpr fr` from the Poseidon2
parameters. Each $s_j$ is degree 5 in a single wire variable.

## Three relations, all degree 7

Throughout, $u_k = (\cdot + q_\cdot)^5$ denotes degree-5 S-box applications.

### 1. `Poseidon2TransitionEntryRelation` (entry)

**Four subrelations**, one per wire on the successor (first compressed) row.

The entry row holds the external output $(s_0, s_1, s_2, s_3)$ in standard encoding (shared
witness indices with the `poseidon2_external` block's propagate row). Its successor's 4 wires
$(w_{l,\mathrm{shift}}, w_{r,\mathrm{shift}}, w_{o,\mathrm{shift}}, w_{4,\mathrm{shift}})$ must
equal state[0] at rounds 0, 1, 2, 3 respectively.

Using **each shifted wire as a fresh degree-firewall variable**:
$$
\boxed{
\begin{aligned}
A_0 &: w_{l,\mathrm{shift}} - w_l = 0 & \text{(copy; state[0] at round 0 = } s_0\text{)} \\
A_1 &: w_{r,\mathrm{shift}} - D_1(w_l + q_l)^5 - w_r - w_o - w_4 = 0 & \text{state[0] at round 1} \\
A_2 &: w_{o,\mathrm{shift}} - D_1(w_{r,\mathrm{shift}} + q_r)^5 - \text{(lin.)} = 0 & \text{state[0] at round 2} \\
A_3 &: w_{4,\mathrm{shift}} - D_1(w_{o,\mathrm{shift}} + q_o)^5 - \text{(lin.)} = 0 & \text{state[0] at round 3}
\end{aligned}
}
$$

Linear parts for $A_2, A_3$ involve earlier $u_k$ terms on distinct wires — no composed S-boxes.
Each subrelation degree 5 + 1 (selector) + 1 (gate sep) = **7**.

### 2. `Poseidon2DoubleInternalRelation` (interior) — 13 rows

Four subrelations: $A_0$ for next-row $w_l$ (direct), $A_1, A_2, A_3$ for
$(s_1^{\mathrm{next}}, s_2^{\mathrm{next}}, s_3^{\mathrm{next}})$ via the Vandermonde
reconstruction on the shifted wires using $q_m, q_c, q_5$ as the next-pair round constants.

All four degree 7. See §3 for the Vandermonde solve.

### 3. `Poseidon2DoubleInternalTerminalRelation` (terminal) — 1 row

Same 4-round computation, but the successor is the standard-encoded bridge row:
$$
A_k: \text{out}_k - w_{k,\mathrm{shift}} = 0 \quad \text{for } k \in \{0,1,2,3\}
$$
where $\text{out}_k$ is state[k] after the 4 rounds (computed natively inside the relation from
$w_l, w_r, w_o, w_4$ and the 4 round constants). All four degree 7.

## Soundness

### Entry boundary

The entry row's $(w_l, w_r, w_o, w_4)$ equal the external output witnesses (shared indices).
The four entry subrelations cryptographically bind the first compressed row's 4 wires to the
correct state[0] values at rounds 0..3 — using each earlier shifted wire as a degree firewall
to avoid composed S-boxes.

### Interior chain

**One-step lemma.** Given interior row $i$'s wires $(w_l, w_r, w_o, w_4)$:
1. $(s_1, s_2, s_3)$ at row-start are uniquely determined via the Vandermonde solve.
2. Applying 4 rounds deterministically gives state[0] at round $4(i+1)$, $4(i+1)+1$, $4(i+1)+2$,
   $4(i+1)+3$.
3. $A_0$ fixes $w_{l,\mathrm{shift}}$ (= state[0] at next row's round-0).
4. $A_1, A_2, A_3$ fix $w_{r,\mathrm{shift}}, w_{o,\mathrm{shift}}, w_{4,\mathrm{shift}}$ via
   the inverse of the next-row Vandermonde using $q_m, q_c, q_5$.

Therefore all four successor wires are uniquely forced. The prover has **zero freedom** in any
compressed row once the entry row is fixed.

### Terminal and bridge

Terminal row's $A_k$ directly pin the bridge row's 4 wires (standard encoding). The bridge row
shares witness indices with the first final-external gate, so the final external rounds read
the correct post-internal state via the standard `Poseidon2ExternalRelation` (known sound).

### Chain induction

- **Base**: entry relation forces the first compressed row's wires.
- **Step**: one-step lemma propagates through rows 0..12.
- **Terminal**: terminal relation pins the bridge row's standard state.
- **Exit**: shared witness indices to final external rounds; original Poseidon2 soundness.

Every fresh witness is cryptographically tied to a function of earlier witnesses. No degrees of
freedom remain.

## Prover skip optimization

Each of the three relations is gated by its own selector (`q_poseidon2_transition_entry`,
`q_poseidon2_double_internal`, `q_poseidon2_double_internal_terminal`) and implements
`skip(AllEntities)` that returns true iff the selector is identically zero on the current edge.
The entry and terminal relations are active on **one row per permutation** — skipped on
virtually every edge.

## Cost summary

|                              | Ultra           | Mega (K=4 compressed)       |
|------------------------------|----------------:|----------------------------:|
| Rows per permutation         | 73              | **32** (−41, 56%)           |
| Net precomputed columns      | 0               | **+2**: drop `q_poseidon2_internal`, add `q_poseidon2_double_internal`, `q_poseidon2_double_internal_terminal`, `q_poseidon2_transition_entry`, plus `q_5` as a non-gate selector → +3 gate selectors − 1 + 1 non-gate column = +3 total |
| Net relation classes         | 0               | +2 (drop `Poseidon2InternalRelation`, add 3) |
| Max subrelation degree       | 7 (unchanged)   | 7 (unchanged)               |
| `LIBRA_UNIVARIATES_LENGTH`   | 9 (unchanged)   | 9 (unchanged)               |
| Shifted entities             | 5 (unchanged)   | 5 (unchanged)               |
| Ultra proof / Solidity VK    | unchanged       | —                           |
| Mega VK                      | —               | +3 precomputed commitments (2 gate selectors + 1 non-gate) |
| Mega proof layout            | —               | changed (sumcheck subrelation count net +5); proof-compression codec needs an update |

Per-row prover work is ~4× a single internal round (4 S-boxes + Vandermonde solve vs.
1 S-box), but row count drops from 56 to 14 — a ~1.6× aggregate reduction in prover work on
top of the commitment-size win.

## Precomputed columns (Mega-only)

**Added** (3):
- `q_poseidon2_transition_entry` (gate selector)
- `q_poseidon2_double_internal` (gate selector)
- `q_poseidon2_double_internal_terminal` (gate selector)
- `q_5` (non-gate selector, holds next-pair round constant $c_{4(i+1)+2}$)

**Removed** (1):
- `q_poseidon2_internal` (no longer needed — compressed block covers all 56 internal rounds)

**Net: +3** precomputed columns in the Mega VK (3 gate selectors add +3; non-gate selector
addition of `q_5` adds +1; removal of `q_poseidon2_internal` subtracts 1 → +3).

## HN folding considerations

HN folds per-instance state. The decision to encode next-pair constants in a **new precomputed
column** rather than via **shifted selectors** (a rejected alternative) was driven by folding
cost: precomputed commitments live in the VK, which is shared across folded instances and not
folded per round. Shifted selectors would have cost 3 extra scalar evaluations per instance
per fold step — multiplied across ~50 folds per chonk run. Per-proof scalar cost compounds;
per-VK commitment cost is fixed.

## Files

- `poseidon2_transition_entry_relation.hpp` — entry relation (4 subrels, deg 7)
- `poseidon2_double_internal_relation.hpp` — interior relation (4 subrels, deg 7; Vandermonde solve)
- `poseidon2_double_internal_terminal_relation.hpp` — terminal relation (4 subrels, deg 7)
- `gate_data.hpp` — `poseidon2_double_internal_gate_` and `poseidon2_transition_entry_gate_`
  structs (carrying the 4 round indices for the current pair + starting round index for the
  next pair's 3 constants)
- `ultra_circuit_builder.cpp` — `create_poseidon2_double_internal_gate` and
  `create_poseidon2_transition_entry_gate` (Mega-only via `if constexpr (requires …)` guards)
- `mega_execution_trace.hpp` — `MegaTracePoseidon2DoubleInternalBlock` with three gate
  selectors; base class `MegaTraceBlock` gains the `q_5` non-gate selector
- `mega_flavor.hpp` — drops `q_poseidon2_internal` + `Poseidon2InternalRelation`; adds the
  three new gate selectors, `q_5`, and the three new relations
- `stdlib/hash/poseidon2/poseidon2_permutation.cpp` — compile-time dispatch on `Builder`
- `crypto/poseidon2/poseidon2_quad_params.hpp` — pre-computed `constexpr` Vandermonde-inverse
  coefficients $\alpha_j^{(k)}$, $\Sigma = D_2+D_3+D_4$, and pairwise-distinct `static_assert`s
- `circuit_checker/ultra_circuit_checker.{hpp,cpp}` — the three new relations are wired into
  `check_block` under `if constexpr (IsMegaBuilder<Builder>)`

## Open questions / follow-ups

1. **Rename** `*_double_*` → `*_quad_*` throughout. Semantics are K=4, but selector / relation
   / block / gate-struct names still carry the legacy `double_internal` label from the K=2
   prototype. Touching this is mechanical but spans flavor, trace, builder, and checker files.

*(Previously open; now resolved:)*
- Proof compression codec was updated in sync with the new precomputed column and subrelation
  count (`CHONK_PROOF_LENGTH` 1330 → 1332, `HIDING_KERNEL_VK_LENGTH_IN_FIELDS` 127 → 135 in
  `constants.nr`, matching Prover.toml inputs repopulated).
- Pairwise-distinctness `static_assert`s on `(D_2, D_3, D_4)` are in
  `poseidon2_quad_params.hpp` (all three differences checked).

## Verification plan

- All 24 `stdlib_poseidon2_tests` pass (Ultra baseline + Mega K=4).
- 287+ `ultra_honk_tests` pass.
- `chonk_tests` pass (including `ProofCompressionRoundtrip` after codec/constants update).
- `circuit_checker_tests` pass for the new Mega subrelations (entry, interior, terminal).
- VK pinning updated; `test_chonk_standalone_vks_havent_changed.sh --update_inputs` re-runs
  after permission is granted.
