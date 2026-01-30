# Barretenberg Solidity Verifier - Development Guide

## Overview

This directory contains the Solidity implementation of the Honk verifier for on-chain proof verification.

## Architecture

### Core Verifier Files (src/honk/)

| File | Purpose |
|------|---------|
| `HonkTypes.sol` | Defines structs: `VerificationKey`, `RelationParameters`, `Proof`, `G1Point` |
| `Fr.sol` | Field arithmetic library for BN254 scalar field |
| `Transcript.sol` | Fiat-Shamir challenge generation (non-ZK) |
| `ZKTranscript.sol` | Fiat-Shamir challenge generation (ZK variant) |
| `Relations.sol` | Constraint relation evaluations (arithmetic, permutation, lookup, memory, etc.) |
| `CommitmentScheme.sol` | KZG commitment verification |
| `BaseHonkVerifier.sol` | Main verifier logic (non-ZK) |
| `BaseZKHonkVerifier.sol` | Main verifier logic (ZK variant) |

### Verification Keys (src/honk/keys/)

Circuit-specific verification keys:
- `Add2HonkVerificationKey.sol` - Simple addition circuit
- `BlakeHonkVerificationKey.sol` - Blake hash circuit
- `EcdsaHonkVerificationKey.sol` - ECDSA verification circuit
- `RecursiveHonkVerificationKey.sol` - Recursive proof circuit

### Optimized Verifier (src/honk/optimised/)

- `honk-optimized.sol` - Hand-optimized assembly verifier (uses Blake circuit for testing)
- `honk-optimized.sol.template` - Template used to generate honk-optimized.sol
- `generate_offsets.py` - Helper for memory layout

### C++ Contract Templates (cpp/src/barretenberg/dsl/acir_proofs/)

These hpp files contain embedded Solidity code used by bb CLI to generate verifiers:
- `honk_contract.hpp` - Standard Honk verifier template
- `honk_zk_contract.hpp` - ZK Honk verifier template
- `honk_optimized_contract.hpp` - Optimized verifier template

## Key Scripts

### Regeneration Scripts (scripts/)

```bash
# Regenerate honk_contract.hpp and honk_zk_contract.hpp from Solidity sources
./scripts/copy_to_cpp.sh -f

# Sync VK values from BlakeHonkVerificationKey.sol to honk-optimized.sol
./scripts/sync_blake_opt_vk.sh

# Copy honk-optimized.sol to honk_optimized_contract.hpp
./scripts/copy_optimized_to_cpp.sh -f

# Regenerate all VKs (requires rebuilt bb)
./scripts/init_honk.sh
```

### Test Scripts

```bash
# Run all Solidity tests
forge test

# Run specific test
forge test --match-test testValidProof

# Run with verbosity
forge test -vvv
```

## Common Debugging Workflow

### 1. SumcheckFailed Errors

When tests fail with `SumcheckFailed()`:

1. **Check challenge generation matches C++**
   - Solidity: `Transcript.sol` / `ZKTranscript.sol`
   - C++: `ultra_honk/oink_verifier.cpp`, `transcript/transcript.hpp`

2. **Check relation formulas match C++**
   - Solidity: `Relations.sol`
   - C++: `relations/*.hpp` (e.g., `logderiv_lookup_relation.hpp`)

3. **Verify struct fields match**
   - Solidity: `HonkTypes.sol` → `RelationParameters` struct
   - C++: `relations/relation_parameters.hpp`

4. **Rebuild proof generator**
   ```bash
   cd ../cpp/build && ninja honk_solidity_proof_gen
   ```

5. **Regenerate VKs if circuit changed**
   ```bash
   cd ../cpp/build && ninja honk_solidity_key_gen
   cd ../../sol && ./scripts/init_honk.sh
   ```

### 2. Challenge Splitting

The Solidity verifier uses keccak256 and splits 254-bit hashes into two 127-bit challenges:

```solidity
function splitChallenge(Fr challenge) returns (Fr first, Fr second) {
    uint256 lo = uint256(challenge) & 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF; // 127 bits
    uint256 hi = uint256(challenge) >> 127;
    return (Fr(lo), Fr(hi));
}
```

C++ equivalent in `field_conversion.hpp`:
```cpp
const uint256_t lo = u.slice(0, 127);
const uint256_t hi = u.slice(127, 254);
return { bb::fr(lo), bb::fr(hi) };
```

### 3. Eta/Beta Power Computation

Current approach (simplified struct):
- `eta` is a single challenge from transcript
- `eta_two = eta * eta` computed locally in Relations.sol
- `eta_three = eta_two * eta` computed locally

Same for beta powers used in lookup relation.

### 4. File Regeneration Order

When making changes to core Solidity files:

1. Edit Solidity files (`HonkTypes.sol`, `Transcript.sol`, `Relations.sol`, etc.)
2. Run `./scripts/copy_to_cpp.sh -f` to update hpp files
3. Rebuild C++ if needed: `cd ../cpp/build && ninja honk_solidity_proof_gen`
4. Run tests: `forge test`

For optimized verifier changes:
1. Edit `honk-optimized.sol.template`
2. Run `./scripts/sync_blake_opt_vk.sh` to apply VK values
3. Run `./scripts/copy_optimized_to_cpp.sh -f`

## Test Structure

| Test File | Circuit | Description |
|-----------|---------|-------------|
| `Add2.t.sol` | add2 | Simple x + y = z |
| `Blake.t.sol` | blake | Blake2 hash |
| `blakeOpt.t.sol` | blake | Optimized verifier |
| `ECDSA.t.sol` | ecdsa | Signature verification |
| `Recursive.t.sol` | recursive | Recursive proof |
| `*ZK.t.sol` | * | ZK variants |

## Relation Parameters

The `RelationParameters` struct contains Fiat-Shamir challenges:

```solidity
struct RelationParameters {
    Fr eta;           // Memory relation
    Fr beta;          // Permutation + Lookup
    Fr gamma;         // Permutation + Lookup
    Fr publicInputsDelta; // Derived value
}
```

Powers (eta², eta³, β², β³) are computed locally where needed, not stored.

## Debugging Tips

1. **Compare hashes**: Add logging to compare challenge values between Solidity and C++
2. **Isolate relations**: Comment out relation accumulations in `Relations.sol` to find the failing one
3. **Check wire mappings**: Ensure `WIRE` enum matches C++ `AllEntities` ordering
4. **Verify VK hash**: The `VK_HASH` constant must match what C++ computes
