# BaseFold: Known Issues for Production

This prototype works and produces correct gate counts, but several aspects
of the recursive verifier are NOT compatible with a fixed-circuit deployment
(e.g., as part of the Aztec root rollup).  This document explains the issues.

## The core problem: witness-dependent circuit topology

In production, the recursive verifier must be a **fixed circuit** — its gate
layout is determined at compile time, a verification key is computed once, and
every proof is verified against that same VK.  The circuit structure must not
depend on witness values.

The current BaseFold recursive verifier has **witness-dependent structure**
in several places:

### 1. Merkle branch direction (FIXED in this PR)

**Problem**: the hash argument order at each Merkle level depends on `index % 2`,
where `index` is derived from a transcript challenge (witness).

**Fix**: use `conditional_assign` — compute BOTH hash orderings and select based
on an index-bit witness.  This doubles the Merkle hashing cost (~2× Poseidon2
calls per level) but makes the circuit topology fixed.

**Status**: Fixed.  The current implementation uses `conditional_assign`.

### 2. Query index → domain pair lookup (NOT YET FIXED)

**Problem**: the fold check reads domain points `s0 = domain[j]`, `s1 = domain[j + half]`
and precomputed values `pair_diff_inv[j]`, where `j` depends on the query index
(a witness value).  In the current implementation, these are read as native
constants indexed by the native `j` — this makes the circuit topology depend
on which `j` was chosen.

**What's needed**: load the domain points into a **ROM table** (or plookup table)
and index into it with the witness `j`.  `cycle_group` already uses ROM tables
internally for Straus MSM, so the infrastructure exists.

**Cost estimate**: one ROM read per domain access.  Per round per query: 3 ROM
reads (s0, s1, pair_diff_inv) × 1 gate each = 3 gates.  Negligible compared
to the fold check (~3,000 gates).  But the ROM table construction costs ~1 gate
per entry, and the tables have up to 2^17 entries (half the domain at round 0).
This adds O(domain_size) one-time setup cost to the circuit.

For a 2^18 domain: ~2^18 gates for ROM table construction across all rounds
(dominated by round 0).  This is ~260K gates — about 7% of the current 3.5M.

### 3. Query index derivation (NOT YET FIXED)

**Problem**: query indices are computed natively via `Poseidon2::hash(seed, q)`
and used as native `size_t` values for indexing.  In a fixed circuit, the
index should be computed in-circuit and decomposed into witness bits.

**What's needed**: compute the Poseidon2 hash in-circuit (already done for Merkle),
decompose the hash output into bits, and use those bits to select the correct
Merkle path and domain pair.  The bits would drive conditional selects and ROM
lookups.

**Cost estimate**: one stdlib Poseidon2 hash per query (~74 gates) + bit
decomposition (~254 gates for a full field element, or fewer if we only need
log2(domain_size) = 18 bits).  Total: ~330 gates per query × 43 queries ≈ 14K
gates.  Negligible.

### 4. The fold scalar values depend on the pair index (NOT YET FIXED)

**Problem**: the scalars in the fold check — `s0^{-e}`, `s1^{-e}`, and `diff_inv`
— are currently constructed as bigfield constants from native values looked up
by the native pair index `j`.  In a fixed circuit, these would need to come from
ROM tables indexed by the witness `j`.

**What's needed**: same ROM approach as item 2.  Precompute `s0^{-e}` and `s1^{-e}`
for all pairs at each round (they depend only on the domain geometry and the
degree bound, both known at setup time) and store them in ROM tables.

**Cost**: same as item 2 — ROM construction is the main cost.  Could potentially
share tables with item 2 since the domain points are already in ROM.

## Summary

| Issue | Status | Estimated cost to fix |
|-------|--------|----------------------|
| Merkle branch direction | **Fixed** | ~2× Merkle hash cost (already in gate count) |
| Domain pair ROM lookup | Not fixed | ~260K gates (ROM construction) |
| Query index derivation | Not fixed | ~14K gates (negligible) |
| Fold scalar ROM lookup | Not fixed | Shared with domain pair ROM |

**Total estimated overhead for a fully fixed circuit**: ~300K gates on top of
the current 3.5M, bringing the total to ~3.8M gates.  This is still ~3× better
than the raw batch_mul MSM (~12M gates).

## Alternative: accept witness-dependent topology

Some FRI verifier implementations (e.g., Plonky2) accept witness-dependent
circuit topology by design — they generate a fresh circuit for each proof.
This works in settings where:
- The verifier circuit is compiled per-proof (no fixed VK)
- Or the circuit uses a VM/dynamic execution model

In the Aztec setting with fixed UltraHonk circuits, this is NOT acceptable.
The ROM-based approach described above is the standard solution.
