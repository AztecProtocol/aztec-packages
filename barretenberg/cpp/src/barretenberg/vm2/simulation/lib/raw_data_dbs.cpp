#include "barretenberg/vm2/simulation/lib/raw_data_dbs.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

#include <cassert>

namespace bb::avm2::simulation {

// HintedRawContractDB starts.
HintedRawContractDB::HintedRawContractDB(const ExecutionHints& hints)
{
    for (const auto& contract_instance_hint : hints.contractInstances) {
        // TODO(fcarreiro): We are currently generating duplicates in TS.
        // assert(!contract_instances.contains(contract_instance_hint.address));
        contract_instances[contract_instance_hint.address] = contract_instance_hint;
    }

    for (const auto& contract_class_hint : hints.contractClasses) {
        assert(!contract_classes.contains(contract_class_hint.classId));
        contract_classes[contract_class_hint.classId] = contract_class_hint;
    }
}

ContractInstance HintedRawContractDB::get_contract_instance(const AztecAddress& address) const
{
    assert(contract_instances.contains(address));
    auto contract_instance_hint = contract_instances.at(address);

    return {
        .address = contract_instance_hint.address,
        .salt = contract_instance_hint.salt,
        .deployer_addr = contract_instance_hint.deployer,
        .contract_class_id = contract_instance_hint.originalContractClassId,
        .initialisation_hash = contract_instance_hint.initializationHash,
        .public_keys =
            PublicKeys{
                .nullifier_key = contract_instance_hint.publicKeys.masterNullifierPublicKey,
                .incoming_viewing_key = contract_instance_hint.publicKeys.masterIncomingViewingPublicKey,
                .outgoing_viewing_key = contract_instance_hint.publicKeys.masterOutgoingViewingPublicKey,
                .tagging_key = contract_instance_hint.publicKeys.masterTaggingPublicKey,
            },
    };
}

ContractClass HintedRawContractDB::get_contract_class(const ContractClassId& class_id) const
{
    assert(contract_classes.contains(class_id));
    auto contract_class_hint = contract_classes.at(class_id);

    return {
        .artifact_hash = contract_class_hint.artifactHash,
        .private_function_root = contract_class_hint.privateFunctionsRoot,
        .public_bytecode_commitment = contract_class_hint.publicBytecodeCommitment,
        .packed_bytecode = contract_class_hint.packedBytecode,
    };
}

// Hinted MerkleDB starts.
HintedRawMerkleDB::HintedRawMerkleDB(const ExecutionHints&, const TreeSnapshots& tree_roots)
    : tree_roots(tree_roots)
{}

} // namespace bb::avm2::simulation
