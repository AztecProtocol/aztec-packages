# Optimized Honk Verifier - Audit Scope

**Primary file to audit**: `barretenberg/sol/src/honk/optimised/honk-optimized.sol.template`

## Generation Pipeline

The optimized verifier is a **circuit-agnostic** template. Blake is used only as the test circuit for Solidity test coverage.

1. **honk-optimized.sol.template** (source of truth)
   - Generic Honk verifier logic (sumcheck, shplemini, KZG)
   - Contains Blake VK values as placeholders for testing
   - Contract name: `BlakeOptHonkVerifier` (for Solidity tests)

2. **sync_blake_opt_vk.sh** injects VK from `BlakeHonkVerificationKey.sol`

3. **honk-optimized.sol** (testable contract)
   - Used by Solidity tests (`blakeOpt.t.sol`)
   - Has concrete Blake circuit VK values

4. **copy_optimized_to_cpp.sh** templatizes VK values
   - Replaces hardcoded VK values with `{{ TEMPLATE }}` placeholders
   - Renames contract to `HonkVerifier`

5. **honk_optimized_contract.hpp** (C++ template)
   - Contains `HONK_CONTRACT_OPT_SOURCE` with `{{ placeholders }}`
   - `get_optimized_honk_solidity_verifier(vk)` injects any circuit's VK

6. **bb CLI** with `--optimized` flag produces **HonkVerifier.sol**
   - Circuit-specific VK values injected
   - Ready for on-chain deployment

## What It Does

Gas-optimized Solidity assembly verifier for Honk proofs. Uses EVM precompiles:
- `ecAdd` (0x06), `ecMul` (0x07), `ecPairing` (0x08)

## C++ Reference

Must match: `UltraVerifier_<UltraKeccakFlavor, DefaultIO>` in `ultra_honk/ultra_verifier.cpp`

## Verification Steps (Solidity ↔ C++)

| Step | Solidity | C++ |
|------|----------|-----|
| VK Loading | `loadVk()` | `OinkVerifier::verify()` |
| Public Inputs | `computePublicInputDelta()` | `OinkVerifier::verify()` |
| Sumcheck | `verifySumcheck()` | `SumcheckVerifier::verify()` |
| Shplemini | `computeBatchOpeningClaim()` | `ShpleminiVerifier::compute_batch_opening_claim()` |
| KZG | `batchAccumulate()` + pairing | `KZG::reduce_verify_batch_opening_claim()` |

## Security Focus Areas

- Field arithmetic overflow (all ops must be mod P)
- EC point validation (must be on BN254 curve)
- Memory bounds in assembly
- Precompile return value checks
- Fiat-Shamir challenge derivation

## Upcoming Change: Public Input Encoding

**Current**: 4 limbs per Fq (16 Fr elements for pairing points)
**Planned**: 2 limbs per Fq (8 Fr elements for pairing points)

Affects pairing point encoding in final verification step.

## Testing

```bash
cd barretenberg/sol

# Primary test for optimized verifier
forge test --match-path test/honk/blakeOpt.t.sol

# Regenerate after changes
./scripts/sync_blake_opt_vk.sh && ./scripts/copy_optimized_to_cpp.sh -f
```

**Primary test**: `blakeOpt.t.sol` - tests the optimized assembly verifier

**Standard verifier tests** (different code path, for reference only): `Add2`, `Blake`, `ECDSA`, `Recursive` (+ ZK variants)
