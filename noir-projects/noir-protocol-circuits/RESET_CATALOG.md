# Private Kernel Reset Catalog

A reset kernel clears accumulated validation work (read checks, key validation,
transient squashing, siloing) between simulation steps. A reset variant is a
9-element vector that caps how many of each it handles. We ship many variants
so small transactions don't pay for capacity they won't use.

The catalog lives in `private_kernel_reset_config.json`. The selector
(`yarn-project/stdlib/src/kernel/hints/find_private_kernel_reset_dimensions.ts`)
picks the cheapest variant that covers the transaction.

## Pre-V5

Variants were a cartesian product of per-dimension value lists, plus
per-dimension overflow entries, plus 4 hand-written uniform vectors. The
selector ran three passes (cartesian → overflow → special-case). After dedup,
~42 variants. Values were a best-guess sweep, never measured against real
flows, and the cartesian shape produced combinations that don't occur in
practice (e.g. heavy reads + heavy siloing + heavy squashing in one tx).

## V5

### Principles

- **Split siloing from non-siloing.** Inner resets never silo; final resets
  always do. Two families (`inner`, `final`) so each is sized for its own job.
- **Dense at the small end, sparse at the large end.** Small transactions are
  frequent and proving-time-sensitive; large ones are dominated by content.
  We pack fitted entries (`xs_*`, `s_*`, `m_*`, `md_*`) at the small end and
  fall through to a sparse `all_N` ladder for the rest.
- **Real flows, but no overfitting.** Shapes are informed by production reset
  traffic, but every value is drawn from `{0, 1, 2, 4, 8, 16, 32, 64}` —
  matching the circuit's power-of-2 padding so intermediate values buy
  nothing, and keeping the catalog generic.
- **Fewer variants than before.** 25 vs ~42, leaving room to add e.g. reset+tail variants later without growing the total.

### Shape

- **`inner`** (8): two sized shapes (`inner_sm`, `inner_lg`) and 6
  single-dimension overflows. Siloing dimensions always 0.
- **`final`** (17): fitted shapes (`xs_pay`, `m_bridge`, …) plus 5 uniform
  fall-throughs (`all_4` … `all_64`).

One `private-kernel-reset/src/main.nr` template generates both. A dimension
set to 0 short-circuits its loop, so the inner variants skip siloing for free.

## Selector

`findPrivateKernelResetDimensions(requested, config, isInner)`:

1. `catalog = isInner ? config.inner : config.final`
2. Keep entries that cover every dimension
3. Return the one minimizing `Σ dim_value × dim_cost`

Costs come from the old config so tie-breaks are unchanged. The three-pass
logic from before is gone — single uniform pick.

## Results

Versus the pre-V5 catalog, multi-app kernels held constant: **−2.0% total
proving time across 11 representative flows.** Biggest wins on private-FPC
and AMM (−3.3% to −3.9%); flows dominated by non-reset work see ~−1%.
Gate-count drops in individual variants are bigger than these wall-time
deltas suggest — power-of-2 padding absorbs most, and reset is 1 of 9–19
IVC steps.

Per-flow gate reduction numbers: PR #23164 comment.
