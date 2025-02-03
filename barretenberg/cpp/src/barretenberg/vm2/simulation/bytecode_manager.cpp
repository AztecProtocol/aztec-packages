#include "barretenberg/vm2/simulation/bytecode_manager.hpp"

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

BytecodeId TxBytecodeManager::get_bytecode(const AztecAddress& address)
{
    // TODO: in principle we want to do this, but we can't make hints fail. Think about it.
    // auto it = resolved_addresses.find(address);
    // if (it != resolved_addresses.end()) {
    //     return it->second;
    // }

    // TODO: catch errors etc.
    // TODO: we should trigger the proper merkle checks etc. The raw DB doesn't.
    ContractInstance instance = db.get_contract_instance(address);
    ContractClass klass = db.get_contract_class(instance.contract_class_id);
    FF hash = compute_public_bytecode_commitment(klass.packed_bytecode);
    info("Bytecode for ", address, " successfully retrieved!");

    // We convert the bytecode to a shared_ptr because it will be shared by some events.
    auto shared_bytecode = std::make_shared<std::vector<uint8_t>>(std::move(klass.packed_bytecode));
    hash_events.emit({ .class_id = instance.contract_class_id, .bytecode = shared_bytecode, .hash = hash });

    // We now save the bytecode so that we don't repeat this process.
    auto bytecode_id = next_bytecode_id++;
    resolved_addresses[address] = bytecode_id;
    bytecodes.emplace(bytecode_id, BytecodeInfo{ .bytecode = shared_bytecode, .class_id = instance.contract_class_id });

    return bytecode_id;
}

Instruction TxBytecodeManager::read_instruction(BytecodeId bytecode_id, uint32_t pc)
{
    auto it = bytecodes.find(bytecode_id);
    if (it == bytecodes.end()) {
        throw std::runtime_error("Bytecode not found");
    }

    const auto& bytecode = *it->second.bytecode;
    // TODO: catch errors etc.
    Instruction instruction = decode_instruction(bytecode, pc);

    decomposition_events.emit({ .class_id = it->second.class_id, .pc = pc, .instruction = instruction });

    return instruction;
}

ContractClassId TxBytecodeManager::get_class_id(BytecodeId bytecode_id) const
{
    auto it = bytecodes.find(bytecode_id);
    if (it == bytecodes.end()) {
        throw std::runtime_error("Bytecode not found");
    }

    return it->second.class_id;
}

} // namespace bb::avm2::simulation