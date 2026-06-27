#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/testing/public_tx_simulation_tester.hpp"
#include "vm2_contracts/contract_artifact.hpp"

// Registration of the canonical protocol/standard contracts so the AVM simulator can resolve calls
// to them (fee juice, the registries, the standard auth registry), mirroring the TS
// `registerFeeJuiceContract` / `registerAuthContract` / `register*RegistryContract` helpers.
namespace bb::avm2::contracts {

// The protocol-wide default public keys (`PublicKeys.default()`), required to reproduce the canonical
// addresses of standard contracts. Sourced from the DEFAULT_*_HASH / DEFAULT_IVPK_M_X/Y constants in
// yarn-project/constants (originally noir-protocol-circuits/crates/types/src/constants.nr).
PublicKeys default_public_keys();

// Registers a protocol contract at its canonical address (in [1, MAX_PROTOCOL_CONTRACTS]). A
// self-consistent instance is built from the artifact's real bytecode and keyed at the canonical
// address; its derived address is recorded in tester.protocol_contracts so the simulator's
// canonical->derived lookup and address-derivation check both succeed. Protocol contracts are not
// subject to a deployment-nullifier check.
void register_protocol_contract(testing::PublicTxSimulationTester& tester,
                                uint32_t canonical_address,
                                const ContractArtifact& artifact,
                                uint64_t seed = 0);

// Registers the canonical standard AuthRegistry. Unlike protocol contracts, its address is a fixed
// (non-canonical) value hardcoded in calling contracts, so the instance must be built from the
// committed canonical deployment preimage (so address & class-id derivation reproduce that address)
// and a deployment nullifier inserted. Returns the derived (canonical) address it was registered at.
AztecAddress register_standard_auth_registry(testing::PublicTxSimulationTester& tester,
                                             const ContractArtifact& artifact);

} // namespace bb::avm2::contracts
