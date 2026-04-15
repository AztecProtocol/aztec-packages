#include "barretenberg/vm2/simulation/standalone/pure_bytecode_manager.hpp"

#include <cassert>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/simulation/interfaces/bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/interfaces/contract_instance_manager.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
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

/**
 * @brief Retrieves and validates bytecode from the PureTxBytecodeManager's ContractDBInterface.
 *
 *  If we have not yet processed the gathered bytecode instance, we store the packed bytecode in the
 *  flat map bytecodes against the class id.
 *
 * @throws BytecodeRetrievalError if
 *        - the contract at the given address is not deployed
 *        - we have reached the limit of the number of bytecodes to retrieve for this tx
 * @throws Unexpected exception if
 *        - the contract class for the retrieved instance does not exist
 *          Note: the deployer contract guarantees that if we have a deployed instance, its contract class
 *          must exist. If the contract is not deployed, this is caught by the above BytecodeRetrievalError.
 *
 * @param address The address of the contract instance to retrieve bytecode for.
 * @return The id (=class_id here) of the bytecode.
 */
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
    ContractClassId current_class_id = instance.current_contract_class_id;

    bool is_new_class = !retrieved_class_ids.contains(current_class_id);
    size_t retrieved_bytecodes_count = retrieved_class_ids.size();

    if (is_new_class && retrieved_bytecodes_count >= MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS) {
        throw BytecodeRetrievalError("Can't retrieve more than " +
                                     std::to_string(MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS) +
                                     " bytecodes per tx");
    }

    retrieved_class_ids.insert(current_class_id);

    // For fast simulation, we use the class_id as the bytecode_id instead of computing the
    // expensive bytecode commitment hash. This is safe because class_id uniquely identifies
    // the bytecode. The actual commitment is only needed for trace generation / witgen.
    BytecodeId bytecode_id = current_class_id;

    // Check if we've already processed this class id.
    // NOTE: If two different classes have the same bytecode, we cannot deduplicate them.
    // This is the downside of using the class id as the bytecode id.
    if (bytecodes.contains(bytecode_id)) {
        return bytecode_id;
    }

    // Contract class retrieval and class ID validation

    std::optional<ContractClass> maybe_klass = contract_db.get_contract_class(current_class_id);
    // Note: we don't need to silo and check the class id because the deployer contract guarantees
    // that if a contract instance exists, the class has been registered.
    BB_ASSERT(maybe_klass.has_value(), "Contract class not found");
    auto& klass = maybe_klass.value();
    debug("Bytecode for ", address, " successfully retrieved!");

    // We now save the bytecode against the class id so that we don't repeat this process for the same class.
    bytecodes[bytecode_id] = std::make_shared<std::vector<uint8_t>>(std::move(klass.packed_bytecode));

    return bytecode_id;
}

/**
 * @brief Reads and deserializes the instruction given by the pair [ @p bytecode_id, @p pc ]. Corresponds to
 *  instr_fetching.pil.
 *
 *  Overloaded helper fn which looks up the bytecode data by bytecode_id and delegates to
 *  read_instruction(bytecode_id, bytecode_ptr, pc) below.
 *
 * @throws InstructionFetchingError if any parse error is detected (see below).
 * @param bytecode_id The bytecode identifier (public bytecode commitment).
 * @param pc The program counter.
 * @return The deserialized instruction.
 */
Instruction PureTxBytecodeManager::read_instruction(const BytecodeId& bytecode_id, PC pc)
{
    // The corresponding bytecode is already stored in the cache if we call this routine. This is safe-guarded by the
    // fact that it is added in the cache when we retrieve the bytecode_id.
    return read_instruction(bytecode_id, get_bytecode_data(bytecode_id), pc);
}

/**
 * @brief Reads and deserializes the instruction given by the pair [ @p bytecode_id, @p pc ].
 *
 * Attempts to read the instruction at @p pc in the provided bytecode @p bytecode_ptr and check its tag
 * operand (if any). If the instruction exists in the cache, we return it directly. Otherwise, we perform
 * deserialisation and tag checks (if a tag operand exists) before storing in the cache.
 *
 * If any parsing error occurs (see below), we throw and do not record the instruction in the cache.
 *
 * @throws InstructionFetchingError if any parse error is detected:
 *          - PC_OUT_OF_RANGE: thrown by deserialize_instruction() if pc >= bytecode.size().
 *          - OPCODE_OUT_OF_RANGE: thrown by deserialize_instruction() if the opcode byte does not correspond to a valid
 *            wire opcode.
 *          - INSTRUCTION_OUT_OF_RANGE: thrown by deserialize_instruction() if instruction_size > bytes_to_read from the
 *            bytecode.
 *          - TAG_OUT_OF_RANGE: if the instruction has a tag operand which does not correspond to a valid memory tag
 *            i.e. when the operand value > MemoryTag::MAX, as determined by check_tag().
 * @param bytecode_ptr Shared pointer to the raw bytecode bytes.
 * @param pc The program counter.
 * @return The deserialized instruction.
 */
Instruction PureTxBytecodeManager::read_instruction(const BytecodeId&,
                                                    std::shared_ptr<std::vector<uint8_t>> bytecode_ptr,
                                                    PC pc)
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
        std::string error_msg = format("Instruction fetching error at pc ", pc);
        if (error.message.has_value()) {
            error_msg = format(error_msg, ": ", error.message.value());
        }
        throw InstructionFetchingError(error_msg);
    }

    // If the following code is executed, no error was thrown in deserialize_instruction().
    if (!check_tag(instruction)) {
        std::string error_msg = format("Instruction fetching error at pc ", pc, ": Tag check failed");
        throw InstructionFetchingError(error_msg);
    };

    // Save the instruction to the cache.
    instruction_cache.emplace(instruction_identifier, instruction);
    return instruction;
}

std::shared_ptr<std::vector<uint8_t>> PureTxBytecodeManager::get_bytecode_data(const BytecodeId& bytecode_id)
{
    auto it = bytecodes.find(bytecode_id);
    BB_ASSERT_DEBUG(it != bytecodes.end(), "Bytecode not found for the given bytecode_id");
    return it->second;
}

} // namespace bb::avm2::simulation
