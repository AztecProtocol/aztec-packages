#include "barretenberg/vm2/simulation/bytecode_manager.hpp"

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/vm/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

BytecodeId TxBytecodeManager::get_bytecode(const AztecAddress& address)
{
    auto it = resolved_addresses.find(address);
    if (it != resolved_addresses.end()) {
        return it->second;
    }

    // TODO: catch errors etc.
    ContractInstance instance = contract_db.get_contract_instance(address);
    auto siloed_address = siloing.silo_nullifier(address, DEPLOYER_CONTRACT_ADDRESS);
    // TODO: check nullifier in the merkle tree.
    ContractClass klass = contract_db.get_contract_class(instance.contract_class_id);
    // Note: we don't need to silo and check the class id because the deployer contract guarrantees
    // that if a contract instance exists, the class has been registered.
    auto bytecode_id = next_bytecode_id++;
    info("Bytecode for ", address, " successfully retrieved!");

    FF bytecode_commitment = bytecode_hasher.compute_public_bytecode_commitment(bytecode_id, klass.packed_bytecode);
    (void)bytecode_commitment; // Avoid GCC unused parameter warning when asserts are disabled.
    assert(bytecode_commitment == klass.public_bytecode_commitment);
    // We convert the bytecode to a shared_ptr because it will be shared by some events.
    auto shared_bytecode = std::make_shared<std::vector<uint8_t>>(std::move(klass.packed_bytecode));
    decomposition_events.emit({ .bytecode_id = bytecode_id, .bytecode = shared_bytecode });

    // We now save the bytecode so that we don't repeat this process.
    resolved_addresses[address] = bytecode_id;
    bytecodes.emplace(bytecode_id, std::move(shared_bytecode));
    retrieval_events.emit({
        .bytecode_id = bytecode_id,
        .address = address,
        .siloed_address = siloed_address,
        .contract_instance = instance,
        .contract_class = klass, // WARNING: this class has the whole bytecode.
        .nullifier_root = merkle_db.get_tree_roots().nullifierTree,
    });

    return bytecode_id;
}

Instruction TxBytecodeManager::read_instruction(BytecodeId bytecode_id, uint32_t pc)
{
    auto it = bytecodes.find(bytecode_id);
    if (it == bytecodes.end()) {
        throw std::runtime_error("Bytecode not found");
    }

    auto bytecode_ptr = it->second;
    const auto& bytecode = *bytecode_ptr;
    // TODO: catch errors etc.
    Instruction instruction = decode_instruction(bytecode, pc);

    // The event will be deduplicated internally.
    fetching_events.emit(
        { .bytecode_id = bytecode_id, .pc = pc, .instruction = instruction, .bytecode = bytecode_ptr });

    return instruction;
}

} // namespace bb::avm2::simulation
