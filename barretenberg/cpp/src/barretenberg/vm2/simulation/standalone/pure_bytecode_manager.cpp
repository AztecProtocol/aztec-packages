#include "barretenberg/vm2/simulation/standalone/pure_bytecode_manager.hpp"

#include <cassert>

#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/simulation/interfaces/bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/interfaces/contract_instance_manager.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/interfaces/memory.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

PureTxBytecodeManager::~PureTxBytecodeManager()
{
    auto cost_in_kb = [&]() {
        size_t total_size = 0;
        for (const auto& instruction : std::ranges::views::values(instruction_cache)) {
            total_size += instruction.operands.size() * sizeof(Operand);
        }
        return total_size / 1024;
    };
    vinfo("PureTxBytecodeManager held ",
          instruction_cache.size(),
          " instructions in cache, totaling ~",
          cost_in_kb(),
          " kB.");
}

BytecodeId PureTxBytecodeManager::get_bytecode(const AztecAddress& address)
{
    BB_BENCH_NAME("PureTxBytecodeManager::get_bytecode");

    // Use shared ContractInstanceManager for contract instance retrieval and validation
    // This handles nullifier checks, address derivation, and update validation
    auto maybe_instance = contract_instance_manager.get_contract_instance(address);

    if (!maybe_instance.has_value()) {
        vinfo("Contract ", field_to_string(address), " is not deployed!");
        throw BytecodeRetrievalError("Contract " + field_to_string(address) + " is not deployed");
    }

    ContractInstance instance = maybe_instance.value();
    ContractClassId current_class_id = instance.current_class_id;

    bool is_new_class = !retrieved_class_ids.contains(current_class_id);
    size_t retrieved_bytecodes_count = retrieved_class_ids.size();

    if (is_new_class && retrieved_bytecodes_count >= MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS) {
        throw BytecodeRetrievalError("Can't retrieve more than " +
                                     std::to_string(MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS) +
                                     " bytecodes per tx");
    }

    retrieved_class_ids.insert(current_class_id);

    // Contract class retrieval and class ID validation
    std::optional<ContractClass> maybe_klass = contract_db.get_contract_class(current_class_id);
    // Note: we don't need to silo and check the class id because the deployer contract guarrantees
    // that if a contract instance exists, the class has been registered.
    assert(maybe_klass.has_value());
    auto& klass = maybe_klass.value();
    debug("Bytecode for ", address, " successfully retrieved!");

    // Bytecode hashing and decomposition, deduplicated by bytecode_id (commitment)
    BytecodeId bytecode_id = klass.public_bytecode_commitment;

    // Check if we've already processed this bytecode.
    if (bytecodes.contains(bytecode_id)) {
        return bytecode_id;
    }

    // We now save the bytecode so that we don't repeat this process.
    bytecodes[bytecode_id] = std::make_shared<std::vector<uint8_t>>(std::move(klass.packed_bytecode));
    return bytecode_id;
}

Instruction PureTxBytecodeManager::read_instruction(const BytecodeId& bytecode_id, uint32_t pc)
{
    // The corresponding bytecode is already stored in the cache if we call this routine. This is safe-guarded by the
    // fact that it is added in the cache when we retrieve the bytecode_id.
    return read_instruction(bytecode_id, get_bytecode_data(bytecode_id), pc);
}

Instruction PureTxBytecodeManager::read_instruction(const BytecodeId&,
                                                    std::shared_ptr<std::vector<uint8_t>> bytecode_ptr,
                                                    uint32_t pc)
{
    BB_BENCH_NAME("TxBytecodeManager::read_instruction");

    // Try to get the instruction from the cache.
    InstructionIdentifier instruction_identifier = { bytecode_ptr.get(), pc };
    auto it = instruction_cache.find(instruction_identifier);
    if (it != instruction_cache.end()) {
        return it->second;
    }

    // If not found, deserialize the instruction, etc.
    const auto& bytecode = *bytecode_ptr;
    Instruction instruction;

    try {
        instruction = deserialize_instruction(bytecode, pc);
    } catch (const InstrDeserializationError& error) {
        throw InstructionFetchingError("Instruction fetching error: " + std::to_string(static_cast<int>(error)));
    }

    // If the following code is executed, no error was thrown in deserialize_instruction().
    if (!check_tag(instruction)) {
        throw InstructionFetchingError("Tag check failed");
    };

    // Save the instruction to the cache.
    instruction_cache.emplace(instruction_identifier, instruction);
    return instruction;
}

std::shared_ptr<std::vector<uint8_t>> PureTxBytecodeManager::get_bytecode_data(const BytecodeId& bytecode_id)
{
    return bytecodes.at(bytecode_id);
}

} // namespace bb::avm2::simulation
