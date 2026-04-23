# Final APPEND Merge in Translator

## Status

Proposal. Supersedes the final-step APPEND merge in
[`MERGE_PROTOCOL.md`](./MERGE_PROTOCOL.md). Intermediate PREPEND merges are
untouched.

## Motivation

At the final Goblin step, Merge (APPEND) proves
$M_j = T_{\text{prev},j} + X^{\ell} \cdot t_{\text{hiding},j}$ with
$\deg(T_{\text{prev},j}) < \ell$, then hands Translator a commitment
$[X^t M_j]$.

Two observations make the final merge unnecessary:

1. **Translator already does the work.** Contribs 65/66/67 of
   `TranslatorZeroConstraintsRelationImpl` pin $w_j$ to zero outside the
   minicircuit. That bounds $\deg(w_j)$ (Thakur's $G$ is redundant). A
   symmetric low-side zero-pin replaces the merge's leading-zero check on
   $[L']$ and closes the MegaZK rows-0..3 gap in one relation.
2. **Concatenation is addition when supports are disjoint.** If
   $T_{\text{prev},j}$ and $X^\ell t_{\text{hiding},j}$ have disjoint
   non-zero supports, then $M_j = T_{\text{prev},j} + X^\ell t_{\text{hiding},j}$
   holds as a polynomial identity — and $[M_j]$ as a plain EC addition.

Removing the final merge saves 4 $[M_j]$ commitments, $[G]$, the Shplonk
batch for merge, and ~13 field-element evaluations.

## Design

### Option A (MegaZK trace reshuffle) — too invasive

Reshuffle the hiding kernel's Mega trace so `ecc_op` starts at row $\ell+s$
instead of $s$. Supports become disjoint at the commitment level:
$[X^s M_j] = [X^s T_{\text{prev},j}] + [t_{\text{hiding},j}]$, a plain EC
add. Requires unifying Translator to `RANDOMNESS_START = 5`, a
hiding-kernel trace-layout variant, and touches databus / public-input
positions / trace-overflow logic.

### Option B (Shplemini k-shifts)

Keep all Mega trace layouts. $T_{\text{prev},j}$ and $t_{\text{hiding},j}$
both have data starting at row $s=5$, supports overlap. Resolve via:

**Shplemini right-shift-by-$k$ opening.** The PCS batcher produces an
opening claim for $X^k \cdot P$ from a single commitment $[P]$ via a
claim-side adjustment — no second commitment. Originally PR #11663, removed
unused by PR #18741, resurrected here. With $k = \ell$, Shplemini delivers
$(X^\ell \cdot t_{\text{hiding},j})(u')$ from $[t_{\text{hiding},j}]$.

**Split flavor entities.** Translator's op-queue wires become two families:

```
OpQueueWires_prev:    op_prev,   x_lo_y_hi_prev,   x_hi_z_1_prev,   y_lo_z_2_prev
OpQueueWires_hiding:  op_hiding, x_lo_y_hi_hiding, x_hi_z_1_hiding, y_lo_z_2_hiding
```

The three to-be-shifted wires in each family have shift-by-1 mirrors (6
`_shift` entities total); `op` stays non-shiftable in both (2 entities
total). `_prev` commitments come from tail-kernel public inputs, `_hiding`
from hiding-kernel witness commitments.

**Virtual op-queue wire.** Translator's existing relations are rewritten
wherever they read `x_lo_y_hi / x_hi_z_1 / y_lo_z_2 / op`:

$$\text{op}_j \;\longrightarrow\; T_{\text{prev},j} + t_{\text{hiding},j\text{-shift-}\ell}$$

$$\text{op}_j^{\text{-shift-1}} \;\longrightarrow\; T_{\text{prev},j\text{-shift-1}} + t_{\text{hiding},j\text{-shift-}(\ell+1)}$$

Because $T_{\text{prev},j}$ has data only on $[s, s+\ell)$ and
$X^\ell t_{\text{hiding},j}$ only on $[s+\ell, \ldots)$, supports are
disjoint — no selector, no relation-degree increase.

### Complete relation-side change list

1. Substitute op-queue reads per the formulas above. Mechanical.
2. Contribs 65/66/67 continue to enforce $w_j = 0$ outside the minicircuit,
   evaluated on the sum. Subsumes the degree bound on $T_{\text{prev}}$.
3. **New subrelation:**
   `lagrange_prev · t_{hiding,j-shift-ℓ} = 0`, pinning the shifted
   $t_{\text{hiding}}$ to zero on $[s, s+\ell)$. Simultaneously:
   - enforces the disjoint-support requirement directly in Translator;
   - pins rows 0..4 of unshifted $t_{\text{hiding}}$ (which land at rows
     $[\ell, \ell+4]$ of the shifted poly, inside $[s, s+\ell)$ since $s=5$),
     closing the MegaZK rows-0..3 gap and replacing `lagrange_hiding_boundary`;
   - reuses the already-emitted shifted opening — no unshifted
     $t_{\text{hiding}}$ opening is required anywhere.

$T_{\text{prev}}$'s leading zeros need no extra relation: non-ZK Mega's
`EccOpQueueRelation` pins them, carried structurally through the
intermediate-merge chain.

### Precise value of $\ell$

$\ell$ is a single compile-time constant = **max cumulative prev-table
size** across every Chonk configuration. It plays three roles: k-shift
amount, upper bound of $T_{\text{prev}}$'s data range, and width of
`lagrange_prev`. The only coupling to the MegaZK fix is $\ell \geq s = 5$,
trivially satisfied.

Row accounting: after right-shift-by-$\ell$, `lagrange_prev` ∩ (non-zero
region of shifted poly) = $[\ell, s+\ell)$, corresponding to rows $[0, s)$
of unshifted $t_{\text{hiding}}$. That pins rows 0..4. Row 4 is already
zero (pinned by `EccOpQueueRelation` since it's in the main sumcheck loop
and `lagrange_ecc_op(4) = 0`); the extra pin is a harmless no-op. Rows
0..3 are the MegaZK-unconstrained ones that actually need it.

### Defensive $T_{\text{prev}}$ subrelation

$$T_{\text{prev},j} \cdot (1 - \texttt{lagrange\_prev}) = 0$$

Degree-1, negligible cost, reuses the already-emitted $T_{\text{prev},j}(u')$
opening. Redundant — cumulative $\deg(T_{\text{prev}}) \leq \ell$ follows
by induction on the PREPEND chain from each intermediate merge's Thakur $G$
check — but cheap enough to include so the bound is a direct Translator
subrelation rather than an inductive argument over the intermediate merges.

## Cost

- Sumcheck relation degree: unchanged.
- 4 extra openings per op-queue wire at $u'$.
- Resurrect Shplemini k-shift batcher support (#11663).
- One flavor file, one relations file, one PCS batcher file. Mega untouched.

## Interaction with AVM

`MegaAvmFlavor` sets `TRACE_OFFSET = 1`, giving its ecc_op_wires 2 leading
zeros to match the current `TranslatorFlavor::RANDOMNESS_START = 2`. After
unifying translator to shift 5, align `MegaAvmFlavor::TRACE_OFFSET = 4`
(ecc_op at row 5) and treat AVM as a degenerate Chonk case: AVM's ecc_op
commitment is supplied as $T_{\text{prev}}$, $t_{\text{hiding}}$ is the
identity (point at infinity). $w_j$ reduces to $T_{\text{prev},j}$;
Translator relations run unchanged across both paths. Cost: 3 extra zero
rows in the AVM recursive verifier, VK churn, no AVM-side k-shift needed.
`APPEND_OUTPUT_SHIFT` and the $\kappa^{s-t}$ correction disappear entirely.

## Implementation Plan

1. **Resurrect Shplemini k-shifts.** Restore right-shift-by-$k$ support in
   `PolynomialBatcher` / `ClaimBatcher` removed by PR #18741.
2. **Translator flavor.** Split op-queue entities into `_prev` / `_hiding`
   families with shift-by-1 mirrors on the three shiftable wires. Flag
   `_hiding` entities as requiring a k-shift claim with $k = \ell$. Update
   entity counts / getters.
3. **Translator relations.** Substitute op-queue reads (item 1 in the
   relation list). Add `lagrange_prev · t_{hiding-shift-ℓ} = 0` and (optional)
   $T_{\text{prev}} \cdot (1-\texttt{lagrange\_prev}) = 0$.
4. **Translator prover/verifier.** Populate `_prev` and `_hiding`
   polynomials from the op queue's two sub-tables; emit/consume both sets of
   evaluations at $u'$; register the k-shift claim against Shplemini.
5. **Goblin.** Drop `prove_merge(APPEND)` and the corresponding
   `recursively_verify_merge(APPEND)` in the hiding kernel.
6. **Chonk plumbing.** Hand $[X^s T_{\text{prev},j}]$ and
   $[t_{\text{hiding},j}]$ to Translator directly; remove the $[X^t M_j]$
   consumer.
7. **MegaAvm alignment.** Bump `MegaAvmFlavor::TRACE_OFFSET` to 4.
8. **Soundness.** Rewrite the "Hiding kernel ZK soundness" and ZK-budget
   sections of `MERGE_PROTOCOL.md` for the new observable set.


## Open Questions

- **$\ell$ constexpr.** Confirm $\ell_{\max}$ is compile-time fixed across
  every Chonk configuration (init/intermediate/tail + all app counts).
  Load-bearing.
- **ZK argument rewrite.** `MERGE_PROTOCOL.md`'s full-rank analysis is over
  $\{\kappa, \kappa^{-1}, u, u', z\}$; the new observable set drops
  $\kappa, \kappa^{-1}, [G]$, merge Shplonk quotient, and adds one Shplemini
  k-shift opening per op-queue wire. Likely strictly easier (fewer
  observables over the same 40 randomness coefficients), but needs a redo.
- **Effect on ECCVM.** None expected. The ECCVM–Translator consistency
  check reconciles ECCVM's op-queue view with Translator's via openings at
  a shared challenge, not via a shared commitment. In the new design
  Translator's op-queue-wire opening at $z$ is
  $T_{\text{prev}}(z) + z^\ell \cdot t_{\text{hiding}}(z)$, computed from
  openings already in the transcript. ECCVM sees no change.
- **Translator ZK masking.** Contribs 65/66/67 multiply by
  `in_minicircuit_or_masked`. The new `lagrange_prev · t_{hiding-shift-ℓ}`
  subrelation must use the same factor (or be provably unaffected by
  masked-row values), otherwise a masked row at $i \in [\ell, \ell+4)$ could
  satisfy it with garbage.
