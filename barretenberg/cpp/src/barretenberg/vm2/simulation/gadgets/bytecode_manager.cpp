#include "barretenberg/vm2/simulation/gadgets/bytecode_manager.hpp"

#include <cassert>
#include <optional>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Retrieves and validates bytecode from the TxBytecodeManager's ContractDBInterface and emits a
 * BytecodeRetrievalEvent. Corresponds to traces:
 *  bc_retrieval.pil
 *  bc_hashing.pil
 *  bc_decomposition.pil
 *
 *  If we have not yet processed the gathered bytecode instance, we emit a BytecodeHashingEvent and
 *  BytecodeDecompositionEvent. The decomposition trace stores the bytecode from the BytecodeDecompositionEvent as
 *  individual bytes to be referred to by instruction fetching. It enforces the bytecode size and representation as
 *  packed fields, which are used by the hashing trace to enforce the correctness of the bytecode id (=commitment).
 *
 * @throws BytecodeRetrievalError if
 *        - the contract at the given address is not deployed
 *        - we have reached the limit of the number of bytecodes to retrieve for this tx
 * @throws Unexpected exception if
 *        - the contract class for the retrieved instance does not exist
 *        - the bytecode commitment for the retrieved instance does not exist
 *        - the bytecode commitment does not match the calculated hash (inside assert_public_bytecode_commitment())
 *          Note: the deployer contract guarantees that if we have a deployed instance, its contract class and hence its
 *          bytecode commitment must exist. If the contract is not deployed, this is caught by the above
 *          BytecodeRetrievalError.
 *
 * @param address The address of the contract instance to retrieve bytecode for.
 * @return The id (=commitment) of the bytecode.
 */
BytecodeId TxBytecodeManager::get_bytecode(const AztecAddress& address)
{
    BB_BENCH_NAME("TxBytecodeManager::get_bytecode");
    // Use shared ContractInstanceManager for contract instance retrieval and validation
    // This handles nullifier checks, address derivation, and update validation
    auto tree_states = merkle_db.get_tree_state();
    AppendOnlyTreeSnapshot before_snapshot = retrieved_bytecodes_tree_check.get_snapshot();
    // Emits ContractInstanceRetrievalEvent, see #[CONTRACT_INSTANCE_RETRIEVAL] in bc_retrieval.pil.
    auto maybe_instance = contract_instance_manager.get_contract_instance(address);

    if (!maybe_instance.has_value()) {
        // Emits BytecodeRetrievalEvent with contract instance not found error
        retrieval_events.emit({
            .bytecode_id = FF(0), // Use default ID for error cases
            .address = address,
            .current_class_id = FF(0), // Use default ID for error cases
            .nullifier_tree_root = tree_states.nullifier_tree.tree.root,
            .public_data_tree_root = tree_states.public_data_tree.tree.root,
            .retrieved_bytecodes_snapshot_before = before_snapshot,
            .retrieved_bytecodes_snapshot_after = before_snapshot,
            .error = BytecodeRetrievalEventError::INSTANCE_NOT_FOUND,
        });
        vinfo("Contract ", field_to_string(address), " is not deployed!");
        throw BytecodeRetrievalError("Contract " + field_to_string(address) + " is not deployed");
    }

    ContractInstance instance = maybe_instance.value();
    ContractClassId current_class_id = instance.current_contract_class_id;

    // Emits RetrievedBytecodesTreeCheckEvent with write == false, see #[IS_NEW_CLASS_CHECK] in bc_retrieval.pil.
    bool is_new_class = !retrieved_bytecodes_tree_check.contains(current_class_id);

    uint32_t retrieved_bytecodes_count = retrieved_bytecodes_tree_check.size();

    if (is_new_class && retrieved_bytecodes_count >= MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS) {
        // Emits BytecodeRetrievalEvent with too many bytecodes error
        retrieval_events.emit({
            .bytecode_id = FF(0), // Use default ID for error cases
            .address = address,
            .current_class_id = current_class_id,
            .nullifier_tree_root = tree_states.nullifier_tree.tree.root,
            .public_data_tree_root = tree_states.public_data_tree.tree.root,
            .retrieved_bytecodes_snapshot_before = before_snapshot,
            .retrieved_bytecodes_snapshot_after = before_snapshot,
            .is_new_class = is_new_class,
            .error = BytecodeRetrievalEventError::TOO_MANY_BYTECODES,
        });
        throw BytecodeRetrievalError("Can't retrieve more than " +
                                     std::to_string(MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS) +
                                     " bytecodes per tx");
    }

    // Emits RetrievedBytecodesTreeCheckEvent with write == true, see #[RETRIEVED_BYTECODES_INSERTION] in
    // bc_retrieval.pil.
    retrieved_bytecodes_tree_check.insert(current_class_id);
    AppendOnlyTreeSnapshot snapshot_after = retrieved_bytecodes_tree_check.get_snapshot();

    // Contract class retrieval and class ID validation

    // Emits ClassIdDerivationEvent if the class exists, see #[CLASS_ID_DERIVATION] in bc_retrieval.pil. Note
    // that this conditional emission works because if the class does not exist, we throw and do not process retrieval.
    std::optional<ContractClass> maybe_klass = contract_db.get_contract_class(current_class_id);
    // Note: we don't need to silo and check the class id because the deployer contract guarantees
    // that if a contract instance exists, the class has been registered.
    BB_ASSERT(maybe_klass.has_value(), "Contract class not found");
    auto& klass = maybe_klass.value(); // WARNING: this class has the whole bytecode.

    // Bytecode hashing (bc_hashing.pil) and decomposition (bc_decomposition.pil)

    std::optional<FF> maybe_bytecode_commitment = contract_db.get_bytecode_commitment(current_class_id);
    // If we reach this point, class ID and instance both exist which means bytecode commitment must exist.
    BB_ASSERT(maybe_bytecode_commitment.has_value(), "Bytecode commitment not found");
    BytecodeId bytecode_id = maybe_bytecode_commitment.value();
    debug("Bytecode for ", address, " successfully retrieved!");

    retrieval_events.emit({
        .bytecode_id = bytecode_id,
        .address = address,
        .current_class_id = current_class_id,
        .contract_class = klass,
        .nullifier_tree_root = tree_states.nullifier_tree.tree.root,
        .public_data_tree_root = tree_states.public_data_tree.tree.root,
        .retrieved_bytecodes_snapshot_before = before_snapshot,
        .retrieved_bytecodes_snapshot_after = snapshot_after,
        .is_new_class = is_new_class,
    });

    // Check if we've already processed this bytecode by deduplicating by bytecode_id (=commitment). If so, don't do
    // hashing and decomposition again!
    if (bytecodes.contains(bytecode_id)) {
        // Already processed this bytecode - just return
        return bytecode_id;
    }

    // First time seeing this bytecode - perform hashing and decomposition.
    // Emits BytecodeHashingEvent and corresponding Poseidon2HashEvent and Poseidon2PermutationEvent(s).
    bytecode_hasher.assert_public_bytecode_commitment(bytecode_id, klass.packed_bytecode);

    // We convert the bytecode to a shared_ptr because it will be shared by some events.
    auto shared_bytecode = std::make_shared<std::vector<uint8_t>>(std::move(klass.packed_bytecode));
    // Emits BytecodeDecompositionEvent.
    decomposition_events.emit({ .bytecode_id = bytecode_id, .bytecode = shared_bytecode });

    // We now save the bytecode against its id so that we don't repeat this process.
    bytecodes.emplace(bytecode_id, std::move(shared_bytecode));

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
Instruction TxBytecodeManager::read_instruction(const BytecodeId& bytecode_id, PC pc)
{
    return read_instruction(bytecode_id, get_bytecode_data(bytecode_id), pc);
}

/**
 * @brief Reads and deserializes the instruction given by the pair [ @p bytecode_id, @p pc ] and emits an
 * InstructionFetchingEvent. Corresponds to the subtrace instr_fetching.pil.
 *
 * Attempts to deserialize the instruction at @p pc in the provided bytecode @p bytecode_ptr and check its tag
 * operand (if any). If any parsing error occurs (see below), the event is still emitted with the error.
 *
 * @throws InstructionFetchingError if any parse error is detected:
 *          - PC_OUT_OF_RANGE: thrown by deserialize_instruction() if pc >= bytecode.size().
 *          - OPCODE_OUT_OF_RANGE: thrown by deserialize_instruction() if the opcode byte does not correspond to
 *            a valid wire opcode.
 *          - INSTRUCTION_OUT_OF_RANGE: thrown by deserialize_instruction() if instruction_size > bytes_to_read
 *            from the bytecode.
 *          - TAG_OUT_OF_RANGE: if the instruction has a tag operand which does not correspond to a valid memory
 *            tag i.e. when the operand value > MemoryTag::MAX, as determined by check_tag().
 *
 * Note that only one parsing error can occur for each event with hierarchy in the order above. This disjointedness is
 * enforced in the circuit. See deserialize_instruction() and instr_fetching.pil for more detailed error information.
 *
 * @param bytecode_id The bytecode identifier (public bytecode commitment).
 * @param bytecode_ptr Shared pointer to the raw bytecode bytes.
 * @param pc The program counter.
 * @return The deserialized instruction.
 */
Instruction TxBytecodeManager::read_instruction(const BytecodeId& bytecode_id,
                                                std::shared_ptr<std::vector<uint8_t>> bytecode_ptr,
                                                PC pc)
{
    BB_BENCH_NAME("TxBytecodeManager::read_instruction");

    const auto& bytecode = *bytecode_ptr;

    // Keep full error for exception message, but only store enum in event.
    std::optional<InstrDeserializationError> deserialization_error = std::nullopt;
    // Initialise instruction.
    Instruction instruction;

    try {
        instruction = deserialize_instruction(bytecode, pc);

        // If the following code is executed, no error was thrown in deserialize_instruction().
        if (!check_tag(instruction)) {
            deserialization_error = InstrDeserializationEventError::TAG_OUT_OF_RANGE;
        };
    } catch (const InstrDeserializationError& error) {
        // Assign the error. Note that we do not assign any part of the instruction on failure (which may exist for some
        // errors). This matches circuit behaviour (see #[OP1..7_BYTES_DECOMPOSITION] relations).
        deserialization_error = error;
    }

    // We are showing whether bytecode_size > pc or not. If there is no fetching error,
    // we always have bytecode_size > pc.
    const auto bytecode_size = bytecode.size();
    const uint128_t pc_diff = bytecode_size > pc ? bytecode_size - pc - 1 : pc - bytecode_size;
    // Emits RangeCheckEvent, see #[INSTR_ABS_DIFF_POSITIVE] in instr_fetching.pil.
    range_check.assert_range(pc_diff, AVM_PC_SIZE_IN_BITS);

    // Emits InstructionFetchingEvent, which will be deduplicated internally (see DeduplicatingEventEmitter used in
    // simulate_for_witgen).
    fetching_events.emit({ .bytecode_id = bytecode_id,
                           .pc = pc,
                           .instruction = instruction,
                           .bytecode = std::move(bytecode_ptr),
                           .error = deserialization_error.has_value() ? std::make_optional(deserialization_error->type)
                                                                      : std::nullopt });

    // Communicate error to the caller.
    if (deserialization_error.has_value()) {
        std::string error_msg = format("Instruction fetching error");
        if (deserialization_error.value().message.has_value()) {
            error_msg = format(error_msg, ": ", deserialization_error.value().message.value());
        }
        throw InstructionFetchingError(error_msg);
    }

    return instruction;
}

std::shared_ptr<std::vector<uint8_t>> TxBytecodeManager::get_bytecode_data(const BytecodeId& bytecode_id)
{
    auto it = bytecodes.find(bytecode_id);
    BB_ASSERT(it != bytecodes.end(), "Bytecode not found for the given bytecode_id");
    return it->second;
}

} // namespace bb::avm2::simulation
