# Private Kernel Reset Catalog

A reset kernel clears accumulated validation work (read checks, key validation,
transient squashing, siloing) between simulation steps. A reset variant is a
9-element vector that caps how many of each it handles. We ship many variants
so small transactions don't pay for capacity they won't use.

The catalog lives in `private_kernel_reset_config.json`. The selector
(`yarn-project/stdlib/src/kernel/hints/find_private_kernel_reset_dimensions.ts`)
picks the cheapest variant that covers the transaction.

## Principles

- **Split siloing from non-siloing.** Inner resets (between simulation
  iterations) never silo; final resets (before tail) always do. Two families
  (`inner`, `final`) so each is sized for its own job.
- **Dense at the small end, sparse at the large end.** Small transactions are
  frequent and proving-time-sensitive; large ones are dominated by content.
  Fitted entries (`xs_*`, `s_*`, `m_*`, `md_*`) cluster at the small end and
  a sparse `all_N` ladder covers the rest.
- **Real flows, but no overfitting.** Shapes are informed by production reset
  traffic, but every value is drawn from `{0, 1, 2, 4, 8, 16, 32, 64}` —
  matching the circuit's power-of-2 padding so intermediate values buy
  nothing, and keeping the catalog generic.
- **Bounded variant count.** The catalog stays small enough to leave room
  for follow-up additions (fused reset+tail variants, tiny one-shots)
  without growing the total set of VKs we ship.

## Shape

- **`inner`** (8): two sized shapes (`inner_sm`, `inner_lg`) and 6
  single-dimension overflows. Siloing dimensions always 0.
- **`final`** (17): fitted shapes (`xs_pay`, `m_bridge`, …) plus 5 uniform
  fall-throughs (`all_4` … `all_64`). The `all_64` entry is required to
  exist — it's the catch-all the selector falls back to for any input.

One `private-kernel-reset/src/main.nr` template generates both. A dimension
set to 0 short-circuits its loop, so the inner variants skip siloing for free.

## Selector

`findPrivateKernelResetDimensions(requested, config, isInner)`:

1. `catalog = isInner ? config.inner : config.final`
2. Keep entries that cover every dimension
3. Return the one minimizing `Σ dim_value × dim_cost`

## Invariants

Enforced by `generate_private_kernel_reset_data.ts` and the `shipped catalog`
tests in `find_private_kernel_reset_dimensions.test.ts`:

- No dimension exceeds protocol maxima.
- At least one final variant matches protocol maxima (the catch-all).
- Every dimension value is a power of 2 in `{0, 1, 2, 4, 8, 16, 32, 64}`.
- Inner entries have zero in all three siloing dimensions.

## Future work

- Fused reset+tail variants for tail-bound small flows.
- Splitting the reset template into separate `-inner` / `-final` crates.
- Tiny one-shot kernels.
- Real per-variant gate measurement and `dim_cost` re-derivation.
