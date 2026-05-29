#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_context.hpp"

#include "barretenberg/avm_fuzzer/common/interfaces/dbs.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::fuzzer {

namespace {

// Helper function to create a default contract class from bytecode
ContractClassWithCommitment create_default_class(const std::vector<uint8_t>& bytecode)
{
    // This isn't strictly needed for pure simulation, but if we want to re-use inputs in proving we need valid
    // commitment
    auto bytecode_commitment = simulation::compute_public_bytecode_commitment(bytecode);
    auto class_id =
        simulation::compute_contract_class_id(/*artifact_hash=*/0, /*private_fn_root=*/0, bytecode_commitment);
    return ContractClassWithCommitment{
        .id = class_id,
        .artifact_hash = 0,
        .private_functions_root = 0,
        .packed_bytecode = bytecode,
        .public_bytecode_commitment = bytecode_commitment,
    };
}

// Helper function to create a default contract instance from a class ID
ContractInstance create_default_instance(const ContractClassId& class_id)
{
    // To avoid  Assertion failed: (contract_instance.public_keys.incoming_viewing_key.on_curve())
    auto affine_one = grumpkin::g1::affine_one;
    return ContractInstance{
        .salt = 0,
        .deployer = MSG_SENDER,
        .current_contract_class_id = class_id,
        .original_contract_class_id = class_id,
        .initialization_hash = 0,
        .public_keys =
            PublicKeys{
                .nullifier_key_hash = 0,
                .incoming_viewing_key = affine_one,
                .outgoing_viewing_key_hash = 0,
                .tagging_key_hash = 0,
            },
    };
}

} // anonymous namespace

FF FuzzerContext::register_contract_from_bytecode(const std::vector<uint8_t>& bytecode)
{
    auto default_class = create_default_class(bytecode);
    auto default_instance = create_default_instance(default_class.id);
    auto contract_address = simulation::compute_contract_address(default_instance);

    contract_db_->add_contract_class(default_class.id, default_class);
    contract_db_->add_contract_instance(contract_address, default_instance);
    contract_addresses_.push_back(contract_address);

    try {
        FuzzerWorldStateManager::getInstance()->register_contract_address(contract_address);
    } catch (const std::exception& e) {
        std::string msg = e.what();
        // Ignore duplicates, the contract is already registered
        if (msg.find("is already present") == std::string::npos) {
            // Re-throw other errors
            throw e;
        }
    }
    return contract_address;
}

std::optional<std::pair<FF, uint64_t>> FuzzerContext::get_existing_note_hash(size_t index) const
{
    if (existing_note_hashes_.size() == 0) {
        return std::nullopt;
    }
    return existing_note_hashes_[index % existing_note_hashes_.size()];
}

void FuzzerContext::set_existing_note_hashes(std::span<const std::pair<FF, uint64_t>> note_hashes)
{
    existing_note_hashes_.assign(note_hashes.begin(), note_hashes.end());
}

void FuzzerContext::set_existing_contract_addresses(std::span<const AztecAddress> contract_addresses)
{
    contract_addresses_.assign(contract_addresses.begin(), contract_addresses.end());
}

void FuzzerContext::reset()
{
    contract_addresses_.clear();
    contract_db_ = std::make_unique<FuzzerContractDB>();
    existing_note_hashes_.clear();
}

} // namespace bb::avm2::fuzzer
