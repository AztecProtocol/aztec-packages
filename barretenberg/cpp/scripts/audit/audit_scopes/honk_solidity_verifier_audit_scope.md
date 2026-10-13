# External Audit Scope: Honk Solidity Verifier

Repository: https://github.com/AztecProtocol/aztec-packages-private
Commit hash: set when the audit starts. File list checked against `a18e6e7` (branch `v6`).

## Files to Audit
**Note:** paths in items 1-5 are relative to `aztec-packages/barretenberg/cpp/src/barretenberg`. Items 6-7 are relative to the repository root.

1. `dsl/acir_proofs/honk_contract.hpp`
2. `dsl/acir_proofs/honk_zk_contract.hpp`
3. `dsl/acir_proofs/honk_optimized_contract.hpp`
4. `dsl/acir_proofs/honk_zk_optimized_contract.hpp`
5. `dsl/acir_proofs/honk_optimized_common.hpp`
6. `barretenberg/sol/src/honk/optimised/honk-optimized.sol.template` (primary file for the optimized verifier)
7. `barretenberg/sol/src/honk/optimised/zk-honk-optimized.sol.template`

## Brief Summary of Module

These files generate Solidity verifier contracts for Honk proofs. They output Solidity code that can verify Honk proofs on-chain.

## Optimized Verifier

The optimized verifier is a gas-optimized Solidity assembly verifier for Honk proofs. It is circuit-agnostic. The Blake circuit is used only as the test circuit for Solidity test coverage. There are two variants: non-ZK (`honk-optimized.sol.template`, `honk_optimized_contract.hpp`) and ZK (`zk-honk-optimized.sol.template`, `honk_zk_optimized_contract.hpp`).

### Generation pipeline

1. `honk-optimized.sol.template` holds the generic verifier logic (sumcheck, Shplemini, KZG). It contains Blake VK values for testing. Its contract name is `BlakeOptHonkVerifier`.
2. `sol/scripts/init_honk.sh` generates the VKs, including `src/honk/keys/BlakeHonkVerificationKey.sol`, and then runs `sync_blake_opt_vk.sh`.
3. `sol/scripts/sync_blake_opt_vk.sh` copies the template and injects the VK from `BlakeHonkVerificationKey.sol`. Output: `sol/src/honk/instance/BlakeHonkOpt.sol` (ZK: `BlakeOptZK.sol`). Both files are generated, not tracked. The Solidity tests use them.
4. `sol/scripts/copy_optimized_to_cpp.sh` replaces the hardcoded VK values with `{{ TEMPLATE }}` placeholders and renames the contract to `HonkVerifier`. Output: `HONK_CONTRACT_OPT_SOURCE` in `honk_optimized_contract.hpp` (ZK: `HONK_ZK_CONTRACT_OPT_SOURCE` in `honk_zk_optimized_contract.hpp`, with `--zk`).
5. `get_optimized_honk_solidity_verifier(vk)` (ZK: `get_optimized_honk_zk_solidity_verifier(vk)`) injects any circuit's VK. `honk_optimized_common.hpp` holds the shared helpers, including the memory layout (`generate_memory_offsets`) and loop unrolling.
6. `bb write_solidity_verifier --optimized` writes the circuit-specific `HonkVerifier` contract for on-chain deployment.

The regeneration commands and their prerequisites are in [`barretenberg/sol/CLAUDE.md`](../../../../sol/CLAUDE.md).

### EVM precompiles

`ecAdd` (0x06), `ecMul` (0x07), `ecPairing` (0x08) and `modexp` (0x05).

### C++ reference

Must match `UltraVerifier_<UltraKeccakFlavor, DefaultIO>` in `ultra_honk/ultra_verifier.*` (ZK: `UltraVerifier_<UltraKeccakZKFlavor, DefaultIO>`).

### Verification steps (Solidity ↔ C++)

The template has two functions, `verify` and `loadVk`. The other steps are inline sections of `verify`, delimited by comment markers.

| Step | Solidity (template section marker) | C++ |
|------|----------|-----|
| VK loading | `function loadVk()` | `OinkVerifier::verify()` |
| Public inputs | `PUBLIC INPUT DELTA` | `OinkVerifier::verify()` |
| Sumcheck | `SUMCHECK` | `SumcheckVerifier::verify()` |
| Shplemini | `SHPLEMINI` | `ShpleminiVerifier::compute_batch_opening_claim()` |
| KZG | `PAIRING CHECK` | `KZG::reduce_verify_batch_opening_claim()` |

## Test Files
Paths relative to `barretenberg/sol`.

1. `test/honk/blakeOpt.t.sol`: primary test for the optimized verifier
2. `test/honk/blakeOptZK.t.sol`: ZK optimized verifier
3. `test/honk/negative/NegativeTestHonkOpt.t.sol`, `test/honk/negative/NegativeTestZKHonkOpt.t.sol`: negative tests for the optimized verifiers
4. `test/honk/{Add2,Blake,ECDSA,Recursive}.t.sol` and their `*ZK.t.sol` variants: standard verifier tests
5. `test/honk/negative/NegativeTestHonk.t.sol`, `test/honk/negative/NegativeTestZKHonk.t.sol`: negative tests for the standard verifiers

To run the primary test, build bb and run `./scripts/init_honk.sh` first. Then run `forge test --match-path test/honk/blakeOpt.t.sol` from `barretenberg/sol`.

## Security Mechanisms

1. `barretenberg/sol/scripts/check_generated_contracts_synced.sh`, run by `barretenberg/sol/bootstrap.sh`: fails if the four generated contract headers (items 1-4) differ from their Solidity sources.
