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

**Concrete cost**: at blowup 8, this added ~1.1M gates (from 3.47M to 4.60M).
This is the single largest overhead for fixed-circuit compatibility.  If the
ROM-based approach (item 2 below) is implemented, the index bits become proper
circuit witnesses and we could potentially use a single conditional hash per
level instead of double-hashing, recovering most of this cost.

### 2. Domain pair lookup + fold scalar lookup (NOT YET FIXED)

**Problem**: the fold check reads domain points `s0 = domain[j]`,
`s1 = domain[j + half]`, precomputed `pair_diff_inv[j]`, and fold scalars
`s0^{-e}`, `s1^{-e}` — all indexed by the pair index `j`, which depends on
the query index (a witness value).  In the current implementation, these are
read as native constants indexed by the native `j`, making the circuit topology
depend on which `j` was chosen.

**What's needed**: load all per-pair data into **ROM tables** (or plookup tables)
and index into them with the witness `j`.  `cycle_group` already uses ROM tables
internally for Straus MSM, so the infrastructure exists.  All five values
(s0, s1, pair_diff_inv, s0^{-e}, s1^{-e}) can share a single ROM per round,
storing one struct per pair.

**Cost estimate**: ROM table construction costs ~1 gate per entry.  At blowup 32
(the recommended configuration), the domain has 2^20 entries and round 0 has
2^19 pairs.  Total ROM construction across all rounds (dominated by round 0):
~2^20 ≈ 1M gates.  This is significant — about 30% of the current 3.25M gate
count.  However, the read cost is negligible (~5 ROM reads per fold check ×
26 queries × 20 rounds ≈ 2,600 gates).

Note: at smaller blowup (e.g., blowup 8, domain 2^18), the ROM cost is ~260K
gates (~5% of the 4.6M count).  The ROM cost scales linearly with domain size,
so higher blowup makes this overhead proportionally larger.  This trade-off
may affect the optimal blowup choice for a production deployment.

### 3. Query index derivation (NOT YET FIXED)

**Problem**: query indices are computed natively via `Poseidon2::hash(seed, q)`
and used as native `size_t` values for indexing.  In a fixed circuit, the
index should be computed in-circuit and decomposed into witness bits.

**What's needed**: compute the Poseidon2 hash in-circuit (already done for Merkle),
decompose the hash output into bits, and use those bits to select the correct
Merkle path and domain pair.  The bits would drive conditional selects and ROM
lookups.

**Cost estimate**: one stdlib Poseidon2 hash per query (~74 gates) + bit
decomposition (~20 bits for log2(domain_size) = 20).  Total: ~100 gates per
query × 26 queries ≈ 2,600 gates.  Negligible.

## Summary

| Issue | Status | Estimated cost to fix |
|-------|--------|----------------------|
| Merkle branch direction | **Fixed** | ~1.1M gates (already in measurements) |
| Domain pair + fold scalar ROM | Not fixed | ~1M gates at blowup 32, ~260K at blowup 8 |
| Query index derivation | Not fixed | ~2,600 gates (negligible) |

**Estimated total at blowup 32 with all fixes**: 3.25M (current) + 1M (ROM) ≈
**4.25M gates**.  However, if the ROM enables single-hash Merkle (replacing the
current double-hash `conditional_assign` approach), we'd recover ~1M gates,
netting out to approximately the same ~3.25M.

**Estimated total at blowup 8 with all fixes**: 4.6M + 260K ≈ 4.86M gates
(with double-hash Merkle), or ~3.75M with single-hash Merkle.

## Alternative: accept witness-dependent topology

Some FRI verifier implementations (e.g., Plonky2) accept witness-dependent
circuit topology by design — they generate a fresh circuit for each proof.
This works in settings where:
- The verifier circuit is compiled per-proof (no fixed VK)
- Or the circuit uses a VM/dynamic execution model

In the Aztec setting with fixed UltraHonk circuits, this is NOT acceptable.
The ROM-based approach described above is the standard solution.
