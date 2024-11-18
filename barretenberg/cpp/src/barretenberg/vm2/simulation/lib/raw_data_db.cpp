#include "barretenberg/vm2/simulation/lib/raw_data_db.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

#include <cassert>

namespace bb::avm2::simulation {

HintedRawDataDB::HintedRawDataDB(const ExecutionHints& hints)
    : contract_instances(hints.contractInstances)
    , contract_classes(hints.contractClasses)
{}

ContractInstance HintedRawDataDB::get_contract_instance(const AztecAddress& address) const
{
    assert(contract_instances_idx < contract_instances.size());
    auto contract_instance_hint = contract_instances[contract_instances_idx];
    assert(contract_instance_hint.address == address);
    return {
        .address = contract_instance_hint.address,
        .salt = contract_instance_hint.salt,
        .deployer_addr = contract_instance_hint.deployer,
        .contract_class_id = contract_instance_hint.contractClassId,
        .initialisation_hash = contract_instance_hint.initializationHash,
        .public_keys =
            [](const auto& pk) {
                return PublicKeys{
                    .nullifier_key = pk.masterNullifierPublicKey,
                    .incoming_viewing_key = pk.masterIncomingViewingPublicKey,
                    .outgoing_viewing_key = pk.masterOutgoingViewingPublicKey,
                    .tagging_key = pk.masterTaggingPublicKey,
                };
            }(contract_instance_hint.publicKeys),
    };
}

ContractClass HintedRawDataDB::get_contract_class(const ContractClassId& class_id) const
{
    assert(contract_classes_idx < contract_classes.size());
    auto contract_class_hint = contract_classes[contract_classes_idx++];
    assert(class_id == compute_contract_class_id(contract_class_hint.artifactHash,
                                                 contract_class_hint.privateFunctionsRoot,
                                                 contract_class_hint.publicBytecodeCommitment));
    return {
        .artifact_hash = contract_class_hint.artifactHash,
        .private_function_root = contract_class_hint.privateFunctionsRoot,
        .public_bytecode_commitment = contract_class_hint.publicBytecodeCommitment,
        .packed_bytecode = contract_class_hint.packedBytecode,
    };
}

} // namespace bb::avm2::simulation