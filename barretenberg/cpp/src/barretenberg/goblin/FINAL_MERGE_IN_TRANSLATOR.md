# Final APPEND Merge in Translator

## Status

Proposal. Supersedes the final-step APPEND merge described in
[`MERGE_PROTOCOL.md`](./MERGE_PROTOCOL.md). Intermediate PREPEND merges are
untouched.

## Motivation

Today the Goblin proof runs three protocols back-to-back at the final step:
**Merge (APPEND)**, **Translator**, **ECCVM**. The APPEND-mode Merge proves

$$M_j = T_{\text{prev},j} + X^{\ell} \cdot t_{\text{hiding},j}, \qquad \deg(T_{\text{prev},j}) < \ell$$

and hands Translator a commitment $[X^t M_j]$ that Translator copy-constrains
into its own op-queue wires.

Three observations motivate eliminating this step:

1. **Translator's zero-checks replace the merge's commit-level checks.**
   Contribs 65/66/67 of `TranslatorZeroConstraintsRelationImpl` already pin
   $w_j$ to zero outside the minicircuit, which bounds $\deg(w_j)$ and makes
   Thakur's $G$ check redundant. Adding a symmetric low-side zero-pin
   replaces the merge's structural leading-zero check on $[L']$ and closes
   the MegaZK rows-0..3 gap in the same relation.
2. **The concatenation is just an addition when supports are disjoint.** If
   $T_{\text{prev},j}$ and $t_{\text{hiding},j}$ commit to polynomials with
   disjoint non-zero supports (one below row $\ell+s$, the other at/above), the
   polynomial identity $M_j = T_{\text{prev},j} + t_{\text{hiding},j}$ holds in
   the ring, and the commitment identity holds as a plain EC addition.

Taken together: the final APPEND merge can be removed entirely, saving 4 $[M_j]$
commitments, the degree-check commitment $[G]$, the Shplonk batch for merge,
and ~13 field-element evaluations — at the cost of either (a) one flavor +
trace-order change on the hiding kernel, or (b) two new subrelations in
Translator.

## Design Options

Both options share the property that no final merge proof is generated; the
difference is *how* Translator sees the concatenation.

### Option A — Commitment-level disjoint-support addition (trace reshuffle)

Reshuffle the hiding kernel's Mega execution-trace block order so `ecc_op`
starts at row $\ell + s$ instead of $s$ ($s=5$, $\ell=$ constexpr max
cumulative prev-table size). Its commitment then has zeros on $[0, \ell+s)$
and data on $[\ell+s, \ldots)$. Since $T_{\text{prev}}$'s data sits on
$[s, s+\ell)$, supports are disjoint and
$[X^s M_j] = [X^s T_{\text{prev},j}] + [t_{\text{hiding},j}]$ is a plain EC
add — no merge proof, no translator-side relation.

Requires unifying Translator's leading-zero layout with Mega
(`RANDOMNESS_START = 5`, +3 zero rows), a hiding-kernel flavor variant that
reorders trace blocks, a `static_assert` tying the offset to $\ell + s$, and
VK churn for the hiding kernel. The MegaZK rows-0..3 gap lands inside the new
leading-zero prefix and is closed by a `lagrange_rows_0_3 · w_j = 0`
subrelation. Trace reshuffle is mechanical but ripples through databus / PIs /
trace-overflow.

### Option B — Translator-side concatenation via Shplemini k-shifts (no trace changes)

Keep all Mega flavors as they are today. The hiding kernel's
`ecc_op_wire_j` commitment has data at row $s=5$; $T_{\text{prev},j}$ also has
data starting at row $s=5$. Direct addition does not work because the supports
overlap.

**Enabling primitive: Shplemini right-shift-by-$k$ opening.** The PCS batcher
can produce an opening claim for $X^k \cdot P$ from a single commitment $[P]$
via a claim-side adjustment — no second commitment. This was previously
implemented in PR #11663, removed as unused in PR #18741, and should be resurrected
here. With $k = \ell$, Shplemini delivers the evaluation of
$X^\ell \cdot t_{\text{hiding},j}$ at the sumcheck challenge $u'$ using only
$[t_{\text{hiding},j}]$.

**Split op-queue entities.** Translator's flavor adds a second family of
op-queue wires that borrow commitments from the hiding kernel's witness
commitments (already in the transcript):

```
OpQueueWires_prev:    { op_prev, x_lo_y_hi_prev, x_hi_z_1_prev, y_lo_z_2_prev }
OpQueueWires_hiding:  { op_hiding, x_lo_y_hi_hiding, x_hi_z_1_hiding, y_lo_z_2_hiding }
```

The three to-be-shifted wires in each family also need their standard
shift-by-1 mirrors (6 `_shift` entities total, same pattern as today's 3).
The `op` wire is non-shiftable in both families (2 entities total).

**Virtual op-queue wire.** Translator's relations are rewritten to consume

$$w_j(X) \;=\; T_{\text{prev},j}(X) \;+\; X^{\ell} \cdot t_{\text{hiding},j}(X)$$

wherever they currently reference the single `x_lo_y_hi / x_hi_z_1 / y_lo_z_2 / op`
entity. Because $T_{\text{prev},j}$ has data only on $[s, s+\ell)$ and
$X^\ell \cdot t_{\text{hiding},j}$ only on $[\ell+s, \ldots)$, the sum has
disjoint non-overlapping contributions — no selector, no degree increase. At
sumcheck opening time the prover sends $T_{\text{prev},j}(u')$ and
$(X^\ell t_{\text{hiding},j})(u')$; the latter is produced from
$[t_{\text{hiding},j}]$ by the Shplemini k-shift opening.

**Relation-side changes (complete list):**

1. Every existing read of an op-queue wire in Translator is substituted:

   $$\text{op}_j \;\longrightarrow\; T_{\text{prev},j} + t_{\text{hiding},j\text{-shift-}\ell}$$

   and, for the three to-be-shifted wires, the shift-by-1 mirror reads:

   $$\text{op}_j^{\text{-shift-1}} \;\longrightarrow\; T_{\text{prev},j\text{-shift-1}} + t_{\text{hiding},j\text{-shift-}(\ell+1)}$$

   where $t_{\text{hiding},j\text{-shift-}\ell}$ denotes the right-shift-by-$\ell$
   of $t_{\text{hiding},j}$ (produced from $[t_{\text{hiding},j}]$ via
   Shplemini). Both families expose standard shift-by-1 mirrors on the three
   shiftable wires; the `op` wire stays non-shiftable in both. Mechanical
   textual edit; relation degrees unchanged.
2. Contribs 65/66/67 continue to enforce $w_j = 0$ outside the minicircuit,
   now evaluated on the sum. This subsumes the degree bound on
   $T_{\text{prev}}$ previously supplied by Thakur's $G$.
3. **New subrelation.** `lagrange_prev · t_{\text{hiding},j\text{-shift-}\ell} = 0`,
   pinning the shifted $t_{\text{hiding}}$ to zero on $T_{\text{prev}}$'s data
   region $[s, s+\ell)$. This does three things at once:

   - Enforces that $t_{\text{hiding-shift-}\ell}$ vanishes on
     $T_{\text{prev}}$'s data rows, giving the disjoint-support requirement
     a direct in-Translator check.
   - Closes the MegaZK rows-0..3 gap: the unconstrained rows 0..3 of
     $t_{\text{hiding}}$ land at rows $[\ell, \ell+3]$ of the shifted poly
     (since $s=5 > 3$, these rows are inside $[s, s+\ell)$), so the
     subrelation pins them to zero automatically. Replaces
     `lagrange_hiding_boundary`.
   - Operates on the **shifted** evaluation that every other relation already
     consumes — no extra opening of unshifted $t_{\text{hiding}}$ is required.

   No `_prev`-side leading-zero relation is needed: $T_{\text{prev}}$'s leading
   zeros are carried structurally through the intermediate-merge chain from
   non-ZK Mega's `EccOpQueueRelation`.

**Cost:**

- Sumcheck relation degree: unchanged.
- Extra opening per op-queue wire at $u'$ (4 extra field elements).
- Resurrect Shplemini k-shift batcher support (#11663).
- One flavor file, one relations file, one PCS batcher file. Mega untouched.

**Invasiveness:** contained to Translator + Shplemini batcher.

### Precise value of $\ell$

$\ell$ is a single compile-time constant set to the **max cumulative
prev-table size** across every Chonk configuration (init + intermediate
kernels + tail). It appears in three roles:

- As the **right-shift amount** for $t_{\text{hiding}}$ in the Shplemini
  opening.
- As the **upper bound of $T_{\text{prev}}$'s data range** $[s, s+\ell)$
  (structurally satisfied by the intermediate PREPEND merges).
- As the **width of `lagrange_prev`**, the indicator MLE on $[s, s+\ell)$.

**Only constraint beyond "max prev-table size":** $\ell \geq s = 5$, so that
the relation `lagrange_prev · t_{\text{hiding-shift-}\ell} = 0` reaches the
rows it needs to pin. Let's verify:

- After right-shift-by-$\ell$, rows $[0, \ell)$ of $t_{\text{hiding-shift-}\ell}$
  are structurally zero. Rows $[\ell, N)$ of the shifted poly correspond to
  rows $[0, N-\ell)$ of the unshifted poly.
- $\texttt{lagrange\_prev}$'s support $[s, s+\ell)$ intersects the
  non-structurally-zero region $[\ell, N)$ in $[\ell, s+\ell)$, which
  corresponds to rows $[0, s)$ of unshifted $t_{\text{hiding}}$.
- So the subrelation effectively pins **rows 0..4 of unshifted
  $t_{\text{hiding}}$** to zero — five rows.

MegaZK requires rows 0..3 pinned (four rows, the $(1-L)$-disabled region).
Row 4 is already pinned by `EccOpQueueRelation` (row 4 is in the main
sumcheck loop, and `lagrange_ecc_op(4) = 0` since the ecc_op block starts at
row 5). The subrelation thus over-pins by one row on the shifted polynomial,
which is harmless — row 4 is already zero, so the extra constraint is a
no-op.

Since $\ell$ equals the max cumulative prev-table size (thousands of rows),
the $\ell \geq 5$ condition is satisfied trivially.

### Defensive $T_{\text{prev}}$ disjoint-support subrelation

One more subrelation is available as defense-in-depth:

$$T_{\text{prev},j} \cdot (1 - \texttt{lagrange\_prev}) = 0$$

pinning $T_{\text{prev}}$ to zero outside its designated range $[s, s+\ell)$.
Degree-1 in a single wire, negligible sumcheck cost, reuses the
$T_{\text{prev},j}(u')$ opening already emitted.

**Redundant, but cheap.** The intermediate PREPEND merges are unchanged by
this design, and each still runs Thakur's $G$ on its subtable $t_i$,
enforcing $\deg(t_i) < \ell_i$. Cumulative $\deg(T_{\text{prev}}) \leq
\sum_i \ell_i = \ell_{\max}$ follows by induction on the PREPEND chain. When
Translator interprets the committed $T_{\text{prev}}$ as an MLE over its
domain, coefficients beyond that support are zero by virtue of the polynomial's
finite degree — no new relation is strictly required.

We include it anyway: the marginal cost is negligible, and it expresses the
$\deg(T_{\text{prev}}) < \ell$ bound as a direct Translator subrelation
rather than requiring the reviewer to follow the inductive argument over the
intermediate PREPEND merges. Dropping it later is trivial if audit comfort
allows.

## Trade-off Summary

|                                | Option A (reshuffle)           | Option B (k-shift + relations)  |
| ------------------------------ | ------------------------------ | ------------------------------- |
| Final merge prover/verifier    | Gone                           | Gone                            |
| New Translator subrelations    | 1 (leading-zero)               | 1 (leading-zero)                |
| Commitment count at final step | Unchanged (adds are free)      | +4 borrowed commitments         |
| Sumcheck relation degree       | Unchanged                      | Unchanged                       |
| Mega changes                   | Hiding-kernel trace reshuffle  | None                            |
| PCS changes                    | None                           | Resurrect Shplemini k-shifts    |
| VK churn                       | Hiding kernel                  | Translator                      |
| Protocol-level cleanliness     | High (plain EC add)            | High (k-shift opening)          |
| Implementation blast radius    | Wide (trace, databus, PIs)     | Narrow (Translator + PCS)       |

## Chosen Path

**Option B (with k-shifts resurrected).** The earlier version of this plan
required a concatenation subrelation with a constexpr split selector, which
introduced a sumcheck-degree concern and an awkward "align $t_{\text{hiding}}$
to translator layout" step that multilinear sumcheck cannot do cheaply. The
Shplemini k-shift opening closes that gap: $[t_{\text{hiding}}]$ is
used *as-is* to supply the value of $X^\ell \cdot t_{\text{hiding}}$ at $u'$,
so $w_j$ reduces to a plain sum of two disjoint-support polynomials — no
concatenation relation, no degree bump, no Mega trace surgery.

Option A (hiding-kernel trace reshuffle) remains viable but is now strictly
more invasive for equal gain.

## Interaction with AVM

AVM proofs are verified by a recursive Mega circuit using `MegaAvmFlavor`
(`flavor/mega_avm_flavor.hpp`), which today sets `TRACE_OFFSET = 1` — giving
its ecc_op_wires exactly 2 leading zeros to match
`TranslatorFlavor::RANDOMNESS_START = 2`. With the final merge gone, Chonk
feeds Translator at shift 5, which makes the AVM shift-2 layout the odd one
out.

**Resolution.** Align `MegaAvmFlavor` to the standard Mega preamble
(`TRACE_OFFSET = 4`, ecc_op starts at row 5) and treat AVM as a degenerate
Chonk case: the AVM circuit's ecc_op_wire commitment is supplied as
$T_{\text{prev}}$ at shift 5, and $t_{\text{hiding}}$ is the commitment to
the zero polynomial (point at infinity). The virtual op-queue wire
$w_j = T_{\text{prev},j} + X^\ell \cdot t_{\text{hiding},j}$ reduces to
$T_{\text{prev},j}$ for AVM, and every Translator relation runs unchanged
across both paths.

Costs:

- 3 extra leading zero rows in the AVM recursive verifier circuit
  (negligible).
- `MegaAvmFlavor::TRACE_OFFSET` bump and associated VK churn.
- No AVM-side Shplemini k-shift needed; the k-shift primitive is Chonk-only.
- `APPEND_OUTPUT_SHIFT` and the $\kappa^{s-t}$ correction disappear entirely;
  `RANDOMNESS_START` unifies to 5.

This keeps the new design uniform: Translator has one internal shift, and AVM
and Chonk differ only in whether $[t_{\text{hiding}}]$ is a real commitment or
the identity.

## Implementation Plan (Option B)

1. **Resurrect Shplemini k-shifts.** Restore the right-shift-by-$k$ support
   in `PolynomialBatcher` / `ClaimBatcher` removed by PR #18741. Verify tests
   from the original PR #11663 still pass. This is prerequisite
   infrastructure.
2. **Relations (`translator_extra_relations_impl.hpp`).**
   - Add `lagrange_leading_zeros` subrelation: constexpr-MLE indicator on
     rows $[0, s+4)$, pinning the virtual $w_j$ to zero there.
   - Extend contribs 65/66/67 to read $w_j = T_{\text{prev},j} + (X^\ell \cdot t_{\text{hiding},j})$
     (computed from the two families at evaluation time) — no structural
     change, just a different input expression.
3. **Flavor (`translator_flavor.hpp`).**
   - Split op-queue entities into `_prev` and `_hiding` families with
     shift-by-1 mirrors on the three shiftable wires per family (the `op`
     wire stays non-shiftable in both).
   - Update `NUM_WITNESS_ENTITIES`, `NUM_SHIFTED_ENTITIES`, getters.
   - Flag `_hiding` entities as requiring a Shplemini k-shift claim with
     $k = \ell$.
   - Add `lagrange_leading_zeros` as a precomputed entity if not expressible
     via existing selectors.
4. **Prover/verifier plumbing.**
   - `translator_proving_key.cpp`: populate the `_prev` and `_hiding`
     polynomials from the two sub-tables the op queue already tracks
     (no new concatenation).
   - `translator_prover.cpp` / `translator_verifier.cpp`: emit/consume
     evaluations for both families at $u'$; register the k-shift opening
     claim for `_hiding` against Shplemini.
5. **Goblin (`goblin.cpp`).**
   - Remove `prove_merge(MergeSettings::APPEND)` at the final step and the
     matching `recursively_verify_merge(APPEND)` in the hiding kernel flow.
   - Intermediate PREPEND merges are untouched.
6. **Chonk plumbing (`chonk.cpp`, hiding kernel recursion).**
   - Hand $[X^s T_{\text{prev},j}]$ (tail-kernel public input) and
     $[t_{\text{hiding},j}]$ (hiding-kernel witness commitment) to the
     Translator verifier directly.
   - Remove the consumer that expected a single $[X^t M_j]$.
7. **Soundness analysis.**
   - Rewrite the "Hiding kernel ZK soundness" and ZK-budget sections of
     `MERGE_PROTOCOL.md` for the new observable set (no $\kappa$-side
     evaluations, no $[G]$, no merge Shplonk quotient; one additional
     Shplemini k-shift opening per op-queue wire).
8. **Tests.**
   - Unit tests for the new `lagrange_leading_zeros` subrelation in
     `translator_vm_tests`.
   - Reinstated PCS tests for k-shift openings from the original PR.
   - End-to-end: `native_chonk_integration.test.ts`,
     `rollup_ivc_integration.test.ts`.

## Open Questions

- **$\ell$ constexpr.** Confirm $\ell_{\max}$ (max cumulative prev-table
  size) is compile-time fixed across every Chonk configuration we build
  (init/intermediate/tail + all app-count regimes). Load-bearing for the
  k-shift value and `lagrange_prev`.
- **ZK argument rewrite.** `MERGE_PROTOCOL.md`'s ZK soundness argument is a
  full-rank analysis over merge observables ($\kappa$, $\kappa^{-1}$, $u$,
  $u'$, Shplonk $z$). The new observable set drops $\kappa$, $\kappa^{-1}$,
  $[G]$, and the merge Shplonk quotient, and adds one Shplemini k-shift
  opening per op-queue wire at $u'$. Needs a redone rank argument — strictly
  fewer observables touching the same 40 randomness coefficients, likely
  easier, but it's not automatic.
- **Effect on ECCVM.** ECCVM consumes the real-ops subset and sources its
  op-wire commitment from $[M]$ today. In the new design $[M]$ is not
  committed; ECCVM needs to either receive $[T_{\text{prev}}] + [t_{\text{hiding}}]$
  as a reconstructed EC sum or be rewired to consume the two separately.
  Confirm which, and whether it needs its own k-shift opening.
- **Interaction with Translator's own ZK masking.** Translator disables its
  main relation on masked rows via the `in_minicircuit_or_masked` factor
  used in contribs 65/66/67. The new `lagrange_prev · t_{hiding-shift-ℓ}`
  subrelation must use the same disabling factor (or be provably unaffected
  by masked-row values), otherwise a masked row at position $i \in [\ell, \ell+4)$
  could satisfy the relation with garbage. Confirm the selector product is
  correct before landing.
