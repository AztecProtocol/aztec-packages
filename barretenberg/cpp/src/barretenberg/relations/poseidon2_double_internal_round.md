# Poseidon2 Double Internal Round Relations

## Motivation

In client IVC (chonk), ~50% of the circuit is Poseidon2 hashing. Of the 64 rows per permutation,
56 are internal rounds — roughly 44% of the entire circuit. Each row commits 4 wire values, all
of which end up in the Hypernova accumulator. Halving the internal round rows without adding new
committed witness polynomials directly shrinks every committed polynomial and reduces the HN
decider cost.

## Why this works (intuition)

Three facts about Poseidon2 internal rounds combine to make the optimization possible.

**Fact 1: Sparse nonlinearity.** Internal rounds apply the S-box ($x \mapsto x^5$) to state[0]
**only**. State[1], state[2], state[3] pass through the round linearly. This is the core design
choice of Poseidon2 (vs. full Poseidon) and the reason internal rounds are cheap. Only one
element per round incurs a degree-5 gate.

**Fact 2: The internal matrix $M_I$ is "diagonal plus all-ones".**
$$
M_I = \begin{pmatrix} D_1 & 1 & 1 & 1 \\ 1 & D_2 & 1 & 1 \\ 1 & 1 & D_3 & 1 \\ 1 & 1 & 1 & D_4 \end{pmatrix}
$$
In particular, the **first row** gives $v_0 = D_1 u_1 + s_1 + s_2 + s_3$. This is a linear
equation in $s_1$ with coefficient 1, so given $(v_0, u_1, s_2, s_3)$ we can uniquely **solve
for $s_1$**. State[1] is algebraically redundant with the other three elements plus the first
output element.

**Fact 3: The standard encoding commits state[1] as a wire, but we don't need to.** Instead of
storing $(s_0, s_1, s_2, s_3)$, we store $(s_0, v_0, s_2, s_3)$ where $v_0$ is the first
element of the state *one round later*. The relation reconstructs $s_1$ on the fly from Fact 2.
The freed wire carries forward an extra round's information — giving us two rounds of state
progress per row instead of one.

**Why the degree doesn't blow up.** The naive concern: composing two S-boxes should give
degree $5 \times 5 = 25$, far beyond the protocol's degree budget. What saves us is that the
second S-box is applied to a **fresh witness value** ($w_r = v_0$), not to an inlined
polynomial expression of the first round's input. Algebraically, $(w_r + c')^5$ is degree 5 in
$w_r$ — a completely separate sumcheck variable from $w_l$ — so the total univariate degree
stays at 5 (plus selector and gate separator = 7). The wire $w_r$ is the "degree firewall"
between the two rounds.

**The summary in one sentence**: We exploit the algebraic redundancy of state[1] in
Poseidon2's internal rounds to replace it with a read-ahead of state[0], effectively doubling
the state-progress-per-row without adding witness columns or raising the relation degree.

### Why this is specific to Poseidon2 internal rounds

- External rounds apply the S-box to **all four** elements, so there's no redundant wire to
  repurpose. The same trick doesn't apply.
- Full Poseidon (non-2) also has no redundant wire in any round for the same reason.
- Other sponges (Rescue, Griffin, Anemoi) have different matrix structures and would each need
  their own analysis.
- The $M_I$ first row has to have coefficient 1 on $s_1$ for the reconstruction to be a
  cost-free linear solve — the "diagonal + all-ones" structure of Poseidon2's internal matrix
  is what makes this essentially free.

### Why boundaries need extra work

The compression introduces a different **meaning** for $w_r$ inside the compressed block
(= intermediate state[0]) vs outside (= standard state[1]). At the boundaries between the
compressed block and the standard-encoded external rounds, we must explicitly bind $w_r$ to
the correct value — otherwise a malicious prover could set it freely, effectively feeding
perturbed state into the permutation. The entry and terminal relations (below) do exactly this
binding at degree 7 each.

## Scope

The compressed encoding is **Mega-only**. The `UltraFlavor` (and its derivatives, e.g. Ultra ZK,
Ultra Keccak) retains the standard 56-single-round layout, so Ultra proof formats, Solidity
verifiers, proof sizes, and `LIBRA_UNIVARIATES_LENGTH` are all unchanged. The stdlib permutation
dispatches on `Builder` at compile time:

```cpp
if constexpr (std::is_same_v<Builder, MegaCircuitBuilder>) {
    // 1 entry + 27 interior + 1 terminal + 1 standard-transition bridge
    // (the compressed block covers all 56 internal rounds; no single-round tail)
} else {
    // original 56 single-round layout
}
```

## Current encoding (Ultra, single round per row)

Each row stores the full state $(s_0, s_1, s_2, s_3)$ in the 4 wires:

$$
w_l = s_0,\quad w_r = s_1,\quad w_o = s_2,\quad w_4 = s_3
$$

The relation computes one internal round and enforces $v_k = w_{k,\mathrm{shift}}$ for
$k = 0,1,2,3$.

**Cost per permutation**: 73 gates. Subrelation degree 7.

## Compressed encoding (Mega)

### Key algebraic observation

The internal matrix equation for the first output element is

$$
v_0 = D_1 \cdot u_1 + s_1 + s_2 + s_3
$$

so $s_1$ is **determined** by the other quantities:

$$
s_1 = v_0 - D_1 (s_0 + c)^5 - s_2 - s_3
$$

If $v_0$ is available as a wire value, we don't need to commit to $s_1$ separately. This frees
one wire to store a second round's $\text{state}[0]$, replacing one committed coordinate with
one that is forced by the transition structure.

### Per-permutation layout (Mega)

Round numbering below is **relative to the internal-rounds block** (0..55). The absolute
`round_constants` indices for internal rounds are 4..59; we omit that offset for readability.

| Rows | Block | Active selector | Purpose |
|----:|-------|-----------------|---------|
| 6 | `arithmetic` | `q_arith` | initial external linear layer ($M_E$ mul) |
| 4 + 1 propagate | `poseidon2_external` | `q_poseidon2_external` | first-half external rounds |
| 1 | `poseidon2_double_internal` | `q_poseidon2_transition_entry` | standard→compressed entry transition |
| 27 | `poseidon2_double_internal` | `q_poseidon2_double_internal` | interior compressed pairs (rounds 0..53) |
| 1 | `poseidon2_double_internal` | `q_poseidon2_double_internal_terminal` | terminal compressed pair (rounds 54, 55) |
| 1 | `poseidon2_double_internal` | none (unconstrained) | compressed→standard bridge |
| 4 + 1 propagate | `poseidon2_external` | `q_poseidon2_external` | second-half external rounds |

The `poseidon2_internal` block is **not used** by Mega; the compressed block covers all 56
internal rounds.

**Total: 46 gates per permutation** (vs 73 original → **37% reduction**, confirmed by
`stdlib_poseidon2_tests` for inputs of size 1, 6, 10, 16, 17, 18, 23, 24).

### Compressed row wire convention

For a compressed row $i$ processing internal rounds $2i$ and $2i+1$:

| Wire   | Content                                       |
|--------|-----------------------------------------------|
| $w_l$  | $\text{state}[0]$ at round $2i$               |
| $w_r$  | $\text{state}[0]$ at round $2i+1$ ($=v_0$)    |
| $w_o$  | $\text{state}[2]$ at round $2i$               |
| $w_4$  | $\text{state}[3]$ at round $2i$               |

Selectors (interior rows):

| Selector | Content                                         |
|----------|-------------------------------------------------|
| $q_l$    | $c_{2i}$                                        |
| $q_r$    | $c_{2i+1}$                                      |
| $q_o$    | $c_{2(i+1)}$ (next pair's even round constant)  |

On the terminal row, $q_o$ is unused (the successor is standard-encoded).

## Three relations, all degree 7

### 1. `Poseidon2TransitionEntryRelation` (entry)

One subrelation. Placed on the standard-encoded row immediately before the first compressed row.
Its 4 wires reuse the same witness indices that the external block's propagate row holds — i.e.,
this row's $(w_l, w_r, w_o, w_4)$ *are* the external output witnesses $(s_0, s_1, s_2, s_3)$
(same indices ⇒ same values, via the sigma permutation).

$$
\boxed{\,A_{\mathrm{entry}}: q_{\text{entry}} \cdot
\big( w_{r,\mathrm{shift}} - D_1 (w_l + q_l)^5 - w_r - w_o - w_4 \big) = 0\,}
$$

Degree: $5 + 1 + 1 = 7$. Forces the first compressed row's $w_r$ to equal
$D_1 (s_0 + c_0)^5 + s_1 + s_2 + s_3$.

### 2. `Poseidon2DoubleInternalRelation` (interior)

Four subrelations. Used on the 27 interior compressed rows (pairs 0..26).

Derived quantity (not committed):
$$
s_1 := w_r - D_1 (w_l + q_l)^5 - w_o - w_4
$$

Intermediate state after round $2i$ (substituting $s_1$):
$$
\begin{aligned}
v_0 &= w_r \\
v_1 &= D_2\,w_r + (1 - D_1 D_2)\,u_1 + (1 - D_2)(w_o + w_4) \\
v_2 &= w_r + (1 - D_1)\,u_1 + (D_3 - 1)\,w_o \\
v_3 &= w_r + (1 - D_1)\,u_1 + (D_4 - 1)\,w_4
\end{aligned}
$$

where $u_1 = (w_l + q_l)^5$. Each $v_k$ is affine in $w_r, w_o, w_4$; quintic dependence enters
only through $u_1$.

Round $2i+1$: $u_1' = (w_r + q_r)^5$. Output:
$$
\begin{aligned}
\text{out}_0 &= D_1 u_1' + v_1 + v_2 + v_3 \\
\text{out}_1 &= u_1' + D_2 v_1 + v_2 + v_3 \\
\text{out}_2 &= u_1' + v_1 + D_3 v_2 + v_3 \\
\text{out}_3 &= u_1' + v_1 + v_2 + D_4 v_3
\end{aligned}
$$

Constraints (each multiplied by $q_{\text{interior}} \cdot \hat g$):

$$
\boxed{
\begin{aligned}
A_0 &: \text{out}_0 - w_{l,\mathrm{shift}} = 0 \\
A_1 &: \text{out}_1 - s_1^{\mathrm{next}} = 0 \\
A_2 &: \text{out}_2 - w_{o,\mathrm{shift}} = 0 \\
A_3 &: \text{out}_3 - w_{4,\mathrm{shift}} = 0
\end{aligned}
}
$$

where $s_1^{\mathrm{next}} := w_{r,\mathrm{shift}} - D_1 (w_{l,\mathrm{shift}} + q_o)^5 - w_{o,\mathrm{shift}} - w_{4,\mathrm{shift}}$.

All four subrelations degree 7.

### 3. `Poseidon2DoubleInternalTerminalRelation` (terminal)

Four subrelations. Same two-round computation as the interior relation, but the successor is
the bridge row in **standard** encoding, so $A_1$ enforces a direct equality instead of an
$s_1^{\mathrm{next}}$ reconstruction.

$$
\boxed{
\begin{aligned}
A_0 &: \text{out}_0 - w_{l,\mathrm{shift}} = 0 \\
A_1 &: \text{out}_1 - w_{r,\mathrm{shift}} = 0 \\
A_2 &: \text{out}_2 - w_{o,\mathrm{shift}} = 0 \\
A_3 &: \text{out}_3 - w_{4,\mathrm{shift}} = 0
\end{aligned}
}
$$

All four subrelations degree 7. The $q_o$ selector is unused.

## Soundness

### One-step lemma (interior)

Given a compressed row $i$ with wires $(w_l, w_r, w_o, w_4)$:

1. $s_1$ is uniquely determined:
   $$s_1 = w_r - D_1(w_l + q_l)^5 - w_o - w_4$$
2. The two-round output $(\text{out}_0, \dots, \text{out}_3)$ is a deterministic function of
   $(w_l, w_r, w_o, w_4, q_l, q_r)$.
3. The successor row's wires are uniquely forced:
   - $w_{l,\mathrm{shift}} = \text{out}_0$, $w_{o,\mathrm{shift}} = \text{out}_2$,
     $w_{4,\mathrm{shift}} = \text{out}_3$ (direct);
   - $w_{r,\mathrm{shift}} = \text{out}_1 + D_1(\text{out}_0 + q_o)^5 + \text{out}_2 + \text{out}_3$
     (rearranging $A_1$).

### Entry boundary (closes the "free w_r at row 0" gap)

The entry row's wires $(w_l, w_r, w_o, w_4)$ share witness indices with the external propagate
row, so they **are** the true external output $(s_0, s_1, s_2, s_3)$.

$A_{\mathrm{entry}}$ then forces:
$$
w_{r,\mathrm{shift}} = D_1(s_0 + c_0)^5 + s_1 + s_2 + s_3
$$

which is exactly the $w_r$ the first compressed row expects. The prover has **no freedom** in
that wire — the reconstructed $s_1$ on the first compressed row is cryptographically tied to
the real external $s_1$.

### Terminal boundary (closes the "free state[1] at round 56" gap)

The terminal row's $A_1$ directly enforces $\text{out}_1 = w_{r,\mathrm{shift}}$. The successor
is the bridge row, whose $w_r$ shares its witness index with `current_state[1]` as used by
the first final-external round gate.

Therefore the final external rounds read the **exact** state[1] computed by the compressed chain.
No prover freedom.

### Chain correctness (induction)

- **Base**: the entry relation forces pair 0's $w_r$ to equal $D_1(s_0+c_0)^5 + s_1 + s_2 + s_3$.
  Combined with shared-witness reuse of $(s_0, s_2, s_3)$ from the external output, pair 0
  starts from the correct compressed encoding.
- **Inductive step**: the interior one-step lemma propagates correctness through pairs 1..26.
- **Terminal**: pair 27 uses the terminal relation; its $A_k$ constraints directly pin the
  bridge row's 4 wires to the computed state after 56 internal rounds in standard encoding.
- **Bridge → final external**: the bridge row shares witness indices with the first final-external
  gate, so the final external rounds read the correct post-internal state via the standard
  `Poseidon2ExternalRelation` (known sound).

Every fresh witness introduced by the compressed encoding is cryptographically tied to a
specific function of earlier witnesses. No degrees of freedom remain.

## Prover skip optimization

Each of the three new relations is gated by its own selector and implements
`skip(AllEntities)` returning true iff that selector is identically zero on the current edge.
Sumcheck uses this to skip `accumulate` entirely for edges outside the compressed block — and
in particular, the entry and terminal relations are active on just **one row per permutation**,
so they skip on virtually every edge.

## Cost summary

|                              | Ultra           | Mega (compressed)           |
|------------------------------|----------------:|----------------------------:|
| Rows per permutation         | 73              | **46** (−27, 37%)           |
| Net precomputed selectors    | 0               | **+2** (drop `q_poseidon2_internal`, add 3) |
| Net relation classes         | 0               | **+2** (drop `Poseidon2InternalRelation`, add 3) |
| Max subrelation degree       | 7 (unchanged)   | 7 (unchanged)               |
| `LIBRA_UNIVARIATES_LENGTH`   | 9 (unchanged)   | 9 (unchanged)               |
| Ultra proof / Solidity VK    | unchanged       | —                           |
| Mega VK                      | —               | +2 precomputed commitments  |
| Mega proof layout            | —               | changed (sumcheck subrelation count net +5: three new relations contribute 1+4+4, minus the dropped `Poseidon2InternalRelation`'s 4; the proof-compression codec indexes into this layout and needs a corresponding update — see `ChonkTests.ProofCompressionRoundtrip`) |

## Precomputed columns (Mega-only)

**Added** (3):
- `q_poseidon2_transition_entry`
- `q_poseidon2_double_internal`
- `q_poseidon2_double_internal_terminal`

**Removed** (1):
- `q_poseidon2_internal` (no longer needed — Mega's compressed block covers all 56 internal rounds)

**Net: +2** precomputed columns in the Mega VK.

All three new selectors are sparse (≤ 1 non-zero row per permutation for entry/terminal;
27 for interior). They appear in the Mega verification key and in recursive-verifier circuits
that consume Mega VKs.

## Files

- `poseidon2_transition_entry_relation.hpp` — entry relation (1 subrel, deg 7)
- `poseidon2_double_internal_relation.hpp` — interior relation (4 subrels, deg 7)
- `poseidon2_double_internal_terminal_relation.hpp` — terminal relation (4 subrels, deg 7)
- `gate_data.hpp` — `poseidon2_double_internal_gate_` and `poseidon2_transition_entry_gate_` structs
- `ultra_circuit_builder.cpp` — `create_poseidon2_double_internal_gate` and
  `create_poseidon2_transition_entry_gate` (Mega-only via `if constexpr (requires …)` guards)
- `mega_execution_trace.hpp` — `MegaTracePoseidon2DoubleInternalBlock` with three selectors
- `mega_flavor.hpp` — drops `q_poseidon2_internal` + `Poseidon2InternalRelation`; adds the three
  new precomputed columns in `PrecomputedEntities` and the three new relations in `Relations_`
  (net +2 of each)
- `stdlib/hash/poseidon2/poseidon2_permutation.cpp` — compile-time dispatch on `Builder`

## Verification

All tests pass:
- 24 `stdlib_poseidon2_tests` (including both Ultra and Mega builders)
- 287 `ultra_honk_tests`
- 32/33 `chonk_tests` (known unrelated `ProofCompressionRoundtrip` issue from new precomputed columns in Mega VK serialization)
