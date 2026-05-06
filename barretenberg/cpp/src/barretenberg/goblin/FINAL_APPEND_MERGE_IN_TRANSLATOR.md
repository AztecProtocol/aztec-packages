# Final APPEND Merge in Translator

## Status

**Explored, not pursued.** The cost/benefit ratio is unfavourable; the
final APPEND merge in [`MERGE_PROTOCOL.md`](./MERGE_PROTOCOL.md) is kept.
The analysis below is preserved as a record of the design space.

### Why we stopped

The headline savings — drop the final merge, save 4 $[M_j]$ commitments,
$[G]$, the Shplonk merge batch, and ~13 field-element evaluations — are
real but modest. The integration cost grows in three places that did not
appear in the initial sketch:

1. **Two k values in the PCS, not one.** Translator's decomposition
   relation reads each op-queue wire both unshifted and shift-by-1 in the
   same row (the `(x_lo, y_hi)` / `(x_hi, z_1)` / `(y_lo, z_2)` pair
   pattern). Extending that pattern to a right-shifted hiding wire
   requires opening $t_{\text{hiding}}$ at *two* k values, $\ell$ and
   $\ell-1$. The Shplemini k-shift batch we restored on the parent branch
   supports a single $k$; multi-k is a non-trivial extension. Sidestepping
   it requires either (a) a separate `[t_hiding-shift-ℓ]` commitment plus
   a univariate consistency check (4 extra commitments per merge), or
   (b) reshuffling Translator's witness layout so the shift-by-1 pattern
   on op-queue wires goes away — a cross-cutting change to limb storage
   and range-constraint pairings.

2. **ZK-budget bleed-through onto Mega.** Each new opening of
   $[t_{\text{hiding}}]$ at the Translator-side multilinear point
   $u'$ is an extra observable that Mega's ecc_op_wire masking has to
   absorb (the polynomial is committed once by the hiding kernel and
   serves both protocols). With multi-k the hiding kernel needs ~2 more
   masked rows than today and the soundness analysis in
   `MERGE_PROTOCOL.md` (full-rank over
   $\{\kappa, \kappa^{-1}, u, u', z\}$) has to be redone over a
   different observable set. The "consistency check" alternative
   separates the budgets but at the cost of those 4 extra commitments.

3. **Translator becomes mode-dependent.** Two Translator VKs are needed,
   distinguished by the precomputed `lagrange_prev` polynomial (Chonk vs
   AVM modes). On its own this is clean — `lagrange_prev` already encodes
   the mode without an additional selector — but it adds a generation
   path, a VK pinning entry, and a verifier dispatch surface to maintain.

Each item is tractable in isolation. The aggregate, against the modest
end-state savings, is not worth it.

### What we'd resurrect this for

The conclusion is sensitive to assumptions. Reasons to revisit:

- The k-shift Shplemini PCS gains a multi-k extension for an unrelated
  reason, eliminating cost item (1).
- Mega's ecc_op masking is restructured for an unrelated reason such
  that extra observables on $[t_{\text{hiding}}]$ are free, eliminating
  cost item (2).
- Final-merge cost grows materially (e.g. larger op-queue, more wires),
  shifting the savings side of the ledger.

Until then, intermediate PREPEND merges and the final APPEND merge in
`MERGE_PROTOCOL.md` are the canonical design.

---

The remainder of this document captures the proposal as it stood when
the cost/benefit analysis was made, for reference.

## Original Status

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

Chonk and AVM share one Translator implementation; the two modes differ
only in the precomputed `lagrange_prev` polynomial (and therefore in the
Translator VK).

- **Chonk mode.** Both incoming subtables are non-empty. `lagrange_prev`
  is the indicator of $[s, s+\ell)$ — the rows where $T_{\text{prev}}$
  carries data and where the right-shifted $t_{\text{hiding}}$ must vanish.
- **AVM mode.** `_prev` carries AVM's full ecc_op; the `_hiding` family is
  absent (no commitments and no openings are sent for it). `lagrange_prev`
  is the indicator of AVM's full ecc_op data range, so
  $(1-\texttt{lagrange\_prev})$ vanishes there and the defensive
  $T_{\text{prev}} \cdot (1-\texttt{lagrange\_prev}) = 0$ subrelation is
  trivially satisfied. The new
  $\texttt{lagrange\_prev} \cdot t_{\text{hiding-shift-}\ell} = 0$
  subrelation is vacuous because $t_{\text{hiding}} \equiv 0$.

The op-queue substitution
$\text{op}_j \to T_{\text{prev},j} + t_{\text{hiding},j\text{-shift-}\ell}$
is structural — no extra mode selector is needed. In AVM mode the second
summand drops out automatically.

Consequence: `MegaAvmFlavor` keeps `TRACE_OFFSET = 1`. The
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
7. **AVM Translator VK.** Generate a separate Translator VK whose
   `lagrange_prev` is the indicator of AVM's ecc_op data range; in this
   mode the verifier consumes only the `_prev` family.
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
