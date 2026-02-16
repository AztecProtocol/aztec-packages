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

**IMPORTANT:** `honk_contract.hpp` and `honk_zk_contract.hpp` can silently drift from the Solidity sources. Always re-run `copy_to_cpp.sh` after editing any Solidity verifier file, or the `bb write_solidity_verifier` command will generate stale contracts.

When making changes to core Solidity files:

1. Edit Solidity files (`HonkTypes.sol`, `Transcript.sol`, `Relations.sol`, etc.)
2. Run `./scripts/copy_to_cpp.sh -f` to update hpp files
3. Rebuild C++ if needed: `cd ../cpp/build && ninja honk_solidity_proof_gen`
4. Run tests: `forge test`

`copy_to_cpp.sh` bundles these files (in order): `IVerifier.sol`, `Errors.sol`, `Fr.sol`, `HonkTypes.sol`, `Transcript.sol`/`ZKTranscript.sol`, `Relations.sol`, `CommitmentScheme.sol`, `utils.sol`, `BaseHonkVerifier.sol`/`BaseZKHonkVerifier.sol`. If a new `.sol` file is added that others depend on, it must be added to this script.

For optimized verifier changes:
1. Edit `honk-optimized.sol.template`
2. Run `./scripts/sync_blake_opt_vk.sh` to apply VK values
3. Run `./scripts/copy_optimized_to_cpp.sh -f`

Note: `copy_optimized_to_cpp.sh` copies from the concrete `BlakeHonkOpt.sol` instance, NOT from the template. If you only edit the template, the hpp won't update until `sync_blake_opt_vk.sh` regenerates the instance.

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

## Common Pitfalls

### Default pairing points and on-curve validation

Non-recursive circuits have default pairing points at infinity, represented as (0,0). The EVM precompiles (ecAdd/ecMul) accept (0,0) as the identity element, but `validateOnCurve` rejects it because `0² ≠ 0³ + 3`. Similarly, `rejectPointAtInfinity` rejects (0,0) by design.

When pairing points are default (all-zero limbs), the entire pairing aggregation block must be skipped. Use `arePairingPointsDefault()` to check before calling `convertPairingPointsToG1`, `validateOnCurve`, or `rejectPointAtInfinity` on the reconstructed points.

### Running ACIR Solidity tests locally

Use `AVM=0` when running with a locally-built `bb` (not `bb-avm`):
```bash
AVM=0 barretenberg/acir_tests/scripts/bb_prove_sol_verify.sh assert_statement --disable_zk
AVM=0 USE_OPTIMIZED_CONTRACT=true barretenberg/acir_tests/scripts/bb_prove_sol_verify.sh assert_statement --disable_zk
```

### Proof format for Solidity

The proof bytes sent to the Solidity verifier contain pairing point limbs at the front, followed by honk proof data. The `loadProof` function in `Transcript.sol` reads them in this order:
1. Pairing point limbs (8 × 32 bytes)
2. Witness commitments (G1 points: w1, w2, w3, lookupReadCounts, lookupReadTags, w4, lookupInverses, zPerm)
3. Sumcheck univariates and evaluations
4. Gemini fold commitments and evaluations
5. Shplonk Q and KZG quotient commitments

Public inputs (user-facing, not including pairing points) are passed separately via `bytes32[] calldata publicInputs`.

## Optimized Verifier Memory Layout

The optimized verifier (`blake-opt.sol.template`) uses hand-tuned assembly with explicit memory offsets.

### Limb Encodings (Two Different Schemes)

**Public inputs / Pairing points** use 2 limbs with 136-bit encoding:
```solidity
// Reconstruct 256-bit value from 2 limbs (136 bits each)
value := or(shl(136, hi_limb), lo_limb)
```

**Non-native field arithmetic** (in Relations.sol) uses 4 limbs with 68-bit encoding:
```solidity
uint256 internal constant LIMB_SIZE = 0x100000000000000000; // 1 << 68
```

These are different encodings for different purposes - don't confuse them.

### Eta Buffer Structure

The eta challenge input is computed from:
```
eta_input = VK_HASH (32 bytes) + public_inputs + pairing_point_limbs + w1,w2,w3 (192 bytes)
```

With 8 pairing point limbs (2 per coordinate × 4 coordinates):
```solidity
let eta_input_length := add(0x1e0, public_inputs_size)
// 0x1e0 = 0x20 (VK_HASH) + 0x100 (8 limbs × 32 bytes) + 0xC0 (w1,w2,w3)
```

### Pitfall: Automated Offset Updates

**Never use automated scripts to bulk-update hex offsets.** Many hex constants look like memory offsets but are actually cryptographic values:

| Constant | Value | NOT an offset |
|----------|-------|---------------|
| `LIMB_SIZE` | `0x100000000000000000` | 1 << 68 |
| `SUBLIMB_SHIFT` | `0x4000` | 1 << 14 |
| `LOWER_127_MASK` | `0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF` | (1 << 127) - 1 |
| `NEG_HALF_MODULO_P` | `0x183227397098d014...` | Cryptographic constant |
| `VK_HASH` | `0x...` | Circuit-specific hash |

An automated "find hex values >= X and subtract Y" script will corrupt these constants. Always update memory offsets manually or use very targeted regex that only matches offset constant definitions.

### Memory Layout Changes

When changing the number of pairing point limbs (e.g., 16 → 8):
1. Update `PAIRING_POINTS_SIZE` constant
2. Remove/add `PAIRING_POINT_N` constants
3. Shift all memory offsets after pairing points by `delta × 32 bytes`
4. Update eta buffer calldatacopy sizes and `eta_input_length`
5. Update pairing reconstruction code (shift amounts: 136-bit for 2 limbs)
