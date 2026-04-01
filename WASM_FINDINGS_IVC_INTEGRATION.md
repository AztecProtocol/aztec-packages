# WASM Findings: Goblin Flush in IVC Integration

## Summary

The goblin flush test (`generateTestingIVCStack(1, 0, true)`) was crashing in WASM but working correctly with NativeUnixSocket. Root cause: WASM stack overflow due to large recursive verifier types on the stack. Fixed by increasing the WASM stack from 1 MB to 2 MB.

## Root Cause: WASM Stack Overflow

The crash was **not** a heap memory issue — WASM heap usage was only 338 MiB at crash time, well below the 4 GiB maximum. The problem was the 1 MB WASM stack being exhausted by the ECCVM recursive verifier's large stack-allocated types.

### Why recursive types are so large

The ECCVM recursive verifier operates on `bigfield` elements (`stdlib::bigfield<UltraCircuitBuilder, Bn254FqParams>`) instead of native field elements. Each `bigfield` contains 4 limbs (each a `field_t` + `uint256_t` max value) plus a `prime_basis_limb`, making it ~492 bytes in WASM release vs 32 bytes for a native field element — a **15x** blowup.

### Stack size breakdown (native debug build, measured via sizeof)

| Type | sizeof | Notes |
|------|--------|-------|
| `bigfield` (recursive FF) | 1,280 B | 4 limbs × (field_t + uint256_t) + prime_basis_limb |
| `field_t<Builder>` | 224 B | ptr + 2×fr + witness_index + OriginTag (debug only) |
| `ECCVMSumcheckVerifier` | **343,200 B** (335 KB) | Dominates the stack |
| `ECCVMSumcheckRound` | 172,896 B (169 KB) | Contains `TupleOfArraysOfValues relation_evaluations` |
| `AllValues` (118 × FF) | 151,040 B (147 KB) | 118 entities × 1,280 bytes each |
| `TranslatorSumcheckVerifier` | 66,400 B (65 KB) | Smaller but still significant |
| `TranslatorSumcheckRound` | 33,408 B (33 KB) | |
| `ECCVMRecursiveVerifier` | 31,616 B (31 KB) | |
| `TranslatorRecursiveVerifier` | 23,680 B (23 KB) | |
| `Builder` | 4,864 B | |

In WASM release builds (no OriginTag, 4-byte pointers), sizes are roughly **2.6x smaller** than native debug. Estimated peak stack usage during ECCVM recursive verification: **~300-500 KB**.

### Why the stack overflows

The main culprits are value-type members allocated on the stack:

1. **`SumcheckVerifierRound::relation_evaluations`** (`TupleOfArraysOfValues`) — a flat tuple of arrays of `bigfield`, one per subrelation across ~134 ECCVM subrelations. This is a **member** of `SumcheckVerifierRound`, which is a **member** of `SumcheckVerifier`, which is a **local** in `reduce_to_ipa_opening()`.

2. **`SumcheckVerifier::alphas`** (`std::array<FF, NUM_SUBRELATIONS - 1>`) — another large array of `bigfield` elements.

3. **`ClaimedEvaluations`** (`AllEntities<FF>`) — 118 `bigfield` elements, allocated as a local in `SumcheckVerifier::verify()`.

These all live on the stack simultaneously during ECCVM sumcheck verification.

### Call stack during peak usage

```
build_goblin_flush_circuit          ~15 KB (builder, verifiers, proof)
  └─ reduce_to_ipa_opening         ~130 KB (SumcheckVerifier as local)
       └─ verify()                 ~70 KB (ClaimedEvaluations, gate separators)
```

The Translator verification runs sequentially after ECCVM, so their frames don't overlap.

## Fix Applied

1. **`barretenberg/cpp/src/CMakeLists.txt`**: WASM stack size 1 MB → **2 MB** (2097152)
2. **`barretenberg/ts/src/barretenberg_wasm/barretenberg_wasm_main/index.ts`**: initial memory pages 35 → **49** (to match WASM module's declared minimum with larger stack)
3. **`yarn-project/ivc-integration/src/chonk_integration.test.ts`**: goblin flush test now runs on both WASM and NativeUnixSocket

Note: WASM test binaries already use 8 MB stack (`barretenberg/cpp/cmake/module.cmake`), which is why C++ tests never hit this issue.

## Potential Future Optimization

The `relation_evaluations` tuple in `SumcheckVerifierRound` could be heap-allocated (e.g. via `std::unique_ptr`) to reduce stack pressure. This would allow reverting the stack size increase, but 2 MB is a reasonable default with ~4-6x headroom over estimated peak usage.
