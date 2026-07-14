#include "vm2_contracts/protocol_contracts.hpp"

#include "barretenberg/common/assert.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::contracts {

namespace {

// Self-consistent dummy keys for protocol contracts (whose canonical addresses are fixed, so their
// instance preimage is irrelevant as long as derivation is internally consistent). Mirrors the keys
// used by PublicTxSimulationTester::deploy_contract.
PublicKeys dummy_public_keys()
{
    return PublicKeys{
        .nullifier_key_hash = 0,
        .incoming_viewing_key = AffinePoint::one(),
        .outgoing_viewing_key_hash = 0,
        .tagging_key_hash = 0,
        .message_signing_key_hash = 0,
        .fallback_key_hash = 0,
    };
}

} // namespace

PublicKeys default_public_keys()
{
    return PublicKeys{
        .nullifier_key_hash = FF(uint256_t("0x14fbaeaeddaa69be81d404c684e78e9f1a786d225faf8de2ce97c92f67d89a26")),
        .incoming_viewing_key =
            AffinePoint(FF(uint256_t("0x00c044b05b6ca83b9c2dbae79cc1135155956a64e136819136e9947fe5e5866c")),
                        FF(uint256_t("0x1c1f0ca244c7cd46b682552bff8ae77dea40b966a71de076ec3b7678f2bdb151"))),
        .outgoing_viewing_key_hash =
            FF(uint256_t("0x0e60ed663a4da5636e2e25a1f1f0c5b27c011c8eaed22bbe61e2a0fd875dd24b")),
        .tagging_key_hash = FF(uint256_t("0x082c6d164b0ba073c9dd911100248c8ecd80b03f82f38531856a3c16dadcbef0")),
        .message_signing_key_hash = FF(uint256_t("0x14a5d4bde495b8c3a9ba4aed0d4870526e46fdff22d341a2f689ac5a50d10356")),
        .fallback_key_hash = FF(uint256_t("0x0f124f07811eebfaaa6d31316a2cc5bf255fa118f720e8ff1f2fc0d4aa46d496")),
    };
}

void register_protocol_contract(testing::PublicTxSimulationTester& tester,
                                uint32_t canonical_address,
                                const ContractArtifact& artifact,
                                uint64_t seed)
{
    BB_ASSERT(canonical_address >= 1 && canonical_address <= MAX_PROTOCOL_CONTRACTS,
              "protocol contract canonical address out of range");

    const std::vector<uint8_t> bytecode = artifact.public_dispatch_bytecode();
    const FF commitment = simulation::compute_public_bytecode_commitment(bytecode);
    const FF artifact_hash = FF(seed + 1);
    const FF private_functions_root = FF(seed + 3);
    const FF class_id = simulation::compute_contract_class_id(artifact_hash, private_functions_root, commitment);

    const ContractClassWithCommitment contract_class{
        .id = class_id,
        .artifact_hash = artifact_hash,
        .private_functions_root = private_functions_root,
        .packed_bytecode = bytecode,
        .public_bytecode_commitment = commitment,
    };
    const ContractInstance instance{
        .salt = FF(seed),
        .deployer = 0,
        .current_contract_class_id = class_id,
        .original_contract_class_id = class_id,
        .initialization_hash = 0,
        .immutables_hash = 0,
        .public_keys = dummy_public_keys(),
    };

    const AztecAddress canonical = FF(canonical_address);
    tester.contract_db().add_contract_class(contract_class);
    tester.contract_db().add_contract_instance(canonical, instance);
    tester.protocol_contracts.derived_addresses.at(canonical_address - 1) =
        simulation::compute_contract_address(instance);
}

AztecAddress register_standard_auth_registry(testing::PublicTxSimulationTester& tester,
                                             const ContractArtifact& artifact)
{
    // Canonical AuthRegistry deployment preimage. Committed in
    // yarn-project/standard-contracts/src/standard_contract_data.ts (StandardContract* tables) and
    // standard_addresses.nr (STANDARD_AUTH_REGISTRY_ADDRESS). deployer/initializationHash/
    // immutablesHash are zero and salt is 1; public keys are the protocol defaults.
    const FF artifact_hash = FF(uint256_t("0x294cf57741ec175652921fd6fbd5ac8bcfe592ad761a5711b66a23b60ba8fbc0"));
    const FF private_functions_root =
        FF(uint256_t("0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4"));
    const FF expected_bytecode_commitment =
        FF(uint256_t("0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2"));

    const std::vector<uint8_t> bytecode = artifact.public_dispatch_bytecode();
    const FF commitment = simulation::compute_public_bytecode_commitment(bytecode);
    BB_ASSERT_EQ(commitment,
                 expected_bytecode_commitment,
                 "AuthRegistry bytecode commitment does not match the committed canonical value");
    const FF class_id = simulation::compute_contract_class_id(artifact_hash, private_functions_root, commitment);

    const ContractClassWithCommitment contract_class{
        .id = class_id,
        .artifact_hash = artifact_hash,
        .private_functions_root = private_functions_root,
        .packed_bytecode = bytecode,
        .public_bytecode_commitment = commitment,
    };
    const ContractInstance instance{
        .salt = 1,
        .deployer = 0,
        .current_contract_class_id = class_id,
        .original_contract_class_id = class_id,
        .initialization_hash = 0,
        .immutables_hash = 0,
        .public_keys = default_public_keys(),
    };

    const AztecAddress address = simulation::compute_contract_address(instance);
    tester.contract_db().add_contract_class(contract_class);
    tester.contract_db().add_contract_instance(address, instance);
    tester.insert_contract_deployment_nullifier(address);
    return address;
}

} // namespace bb::avm2::contracts
