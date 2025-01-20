#include "barretenberg/vm2/simulation/bytecode_manager.hpp"

#include "barretenberg/common/serialize.hpp"
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
    // TODO: we should trigger the proper merkle checks etc. The raw DB doesn't.
    ContractInstance instance = db.get_contract_instance(address);
    address_derivation.assert_derivation(address, instance);
    ContractClass klass = db.get_contract_class(instance.contract_class_id);
    class_id_derivation.assert_derivation(instance.contract_class_id, klass);
    auto bytecode_id = next_bytecode_id++;
    info("Bytecode for ", address, " successfully retrieved!");

    // We convert the bytecode to a shared_ptr because it will be shared by some events.
    auto shared_bytecode = std::make_shared<std::vector<uint8_t>>(std::move(klass.packed_bytecode));
    hash_events.emit({ .bytecode_id = bytecode_id, .bytecode = shared_bytecode });

    // We now save the bytecode so that we don't repeat this process.
    resolved_addresses[address] = bytecode_id;
    bytecodes.emplace(bytecode_id, std::move(shared_bytecode));
    retrieval_events.emit({
        .bytecode_id = bytecode_id,
        .address = address,
        .siloed_address = address, // FIXME: compute, check.
        .contract_instance = instance,
        .contract_class = klass // WARNING: this class has the whole bytecode.
    });

    return bytecode_id;
}

Instruction TxBytecodeManager::read_instruction(BytecodeId bytecode_id, uint32_t pc)
{
    auto it = bytecodes.find(bytecode_id);
    if (it == bytecodes.end()) {
        throw std::runtime_error("Bytecode not found");
    }

    const auto& bytecode = *it->second;
    // TODO: catch errors etc.
    Instruction instruction = decode_instruction(bytecode, pc);

    decomposition_events.emit({ .bytecode_id = bytecode_id, .pc = pc, .instruction = instruction });

    return instruction;
}

} // namespace bb::avm2::simulation