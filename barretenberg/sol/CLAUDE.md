# Barretenberg Solidity Verifier - Development Guide

Agent notes for the Solidity Honk verifier. `README.md` in this folder lists the files, the test contracts, the prerequisites and the build/test commands.

The memory layout of the optimized verifiers (the `// {{ SECTION_START MEMORY_LAYOUT }}` block) is the source of truth in
`generate_memory_offsets` in `cpp/.../acir_proofs/honk_optimized_common.hpp`; `bb write_solidity_verifier`
regenerates it from there. Do not hand-edit those offset constants or maintain a separate generator.

## Key Scripts

### Regeneration Scripts (scripts/)

```bash
# Regenerate honk_contract.hpp and honk_zk_contract.hpp from Solidity sources
./scripts/copy_to_cpp.sh -f

# Write the optimized instances (BlakeHonkOpt.sol, BlakeOptZK.sol) from the templates
# and BlakeHonkVerificationKey.sol (--zk / --non-zk for one only)
./scripts/sync_blake_opt_vk.sh

# Copy the optimized instances to honk_optimized_contract.hpp and honk_zk_optimized_contract.hpp
# (--zk / --non-zk for one only)
./scripts/copy_optimized_to_cpp.sh -f

# Regenerate all VKs into src/honk/keys/ (requires rebuilt honk_solidity_key_gen); also runs sync_blake_opt_vk.sh
./scripts/init_honk.sh
```

### Test Scripts

Run from `barretenberg/sol` after `./bootstrap.sh` has generated the VKs (see `README.md` for prerequisites).

```bash
# Run all Solidity tests (CI form)
forge test --no-match-contract Base

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

### 2. Challenge Generation

The Solidity transcript derives each challenge with its own keccak256 hash: `eta = H(round0)`, then `romLogupGamma = H(eta)`; `beta = H(round1)`, then `gamma = H(beta)` (`Transcript.sol`). There is no 127-bit challenge split. C++ `split_challenge` (`ecc/fields/field_conversion.hpp`) serves only `get_short_challenges` (goblin merge and shplemini recursion); the keccak Oink verifier uses full-width `get_challenges`, one hash per challenge, and the Solidity transcript mirrors that. Do not add a split.

### 3. File Regeneration Order

**IMPORTANT:** `honk_contract.hpp` and `honk_zk_contract.hpp` can silently drift from the Solidity sources. Always re-run `copy_to_cpp.sh` after editing any Solidity verifier file, or the `bb write_solidity_verifier` command will generate stale contracts.

When making changes to core Solidity files:

1. Edit Solidity files (`HonkTypes.sol`, `Transcript.sol`, `Relations.sol`, etc.)
2. Run `./scripts/copy_to_cpp.sh -f` to update hpp files
3. Rebuild C++ if needed: `cd ../cpp/build && ninja honk_solidity_proof_gen`
4. Run tests: `forge test`

`copy_to_cpp.sh` bundles these files (in order): `IVerifier.sol`, `Errors.sol`, `Fr.sol`, `HonkTypes.sol`, `Transcript.sol`/`ZKTranscript.sol`, `Relations.sol`, `CommitmentScheme.sol`, `utils.sol`, `BaseHonkVerifier.sol`/`BaseZKHonkVerifier.sol`. If a new `.sol` file is added that others depend on, it must be added to this script.

For optimized verifier changes:
1. Edit `honk-optimized.sol.template` (non-ZK) or `zk-honk-optimized.sol.template` (ZK)
2. Run `./scripts/sync_blake_opt_vk.sh` to apply VK values
3. Run `./scripts/copy_optimized_to_cpp.sh -f`

Note: `copy_optimized_to_cpp.sh` copies from the concrete `BlakeHonkOpt.sol` / `BlakeOptZK.sol` instances, NOT from the templates. If you only edit a template, the hpp won't update until `sync_blake_opt_vk.sh` regenerates the instance.

## Relation Parameters

The `RelationParameters` struct contains Fiat-Shamir challenges:

```solidity
struct RelationParameters {
    Fr eta;           // Memory relation
    Fr romLogupGamma; // ROM-LogUp additive offset
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

### (0,0) handling: commitments vs. pairing points

`(0,0)` is the EIP-196 canonical identity encoding. The verifier accepts it for **commitment-position** G1 inputs (witness commitments, gemini fold commitments, shplonkQ, kzgQuotient, VK selectors/tables): polynomial commitments to identically-zero polynomials are legitimately the identity, the ecAdd/ecMul precompiles treat `(0,0)` as the additive identity, and `(0,0)` substitution for a non-zero commitment is caught downstream by sumcheck/Shplemini on inconsistent evaluations. Do not reintroduce a blanket `rejectPointAtInfinity` on those slots.

`rejectPointAtInfinity` is preserved on the **pairing points** reconstructed from `pairing_point_object` (`P_0_other`, `P_1_other` in the recursive aggregation block). A `(0,0)` there no-ops the aggregation and would give the prover a free pass on whatever recursive verification was supposed to occur. The legitimate "no recursion" case is signaled by all-zero limbs and short-circuited via `arePairingPointsDefault()` — call it before `convertPairingPointsToG1` / `rejectPointAtInfinity` on the reconstructed points.

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

The optimized verifiers (`honk-optimized.sol.template`, `zk-honk-optimized.sol.template`) use hand-tuned assembly with explicit memory offsets.

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
| `NEG_HALF_MODULO_P` | `0x183227397098d014...` | Cryptographic constant |
| `VK_HASH` | `0x...` | Circuit-specific hash |

An automated "find hex values >= X and subtract Y" script will corrupt these constants. The offsets in the MEMORY_LAYOUT block are generated by `generate_memory_offsets`; change the layout there (for example when the number of pairing point limbs changes). In code outside that block, never bulk-edit hex constants; use a targeted regex that matches only the definitions you mean to change.
