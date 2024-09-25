#include "barretenberg/vm/avm/trace/helper.hpp"

#include <algorithm>
#include <cassert>

#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/vm/avm/trace/mem_trace.hpp"

namespace bb::avm_trace {

template <typename FF> std::string field_to_string(const FF& ff)
{
    std::ostringstream os;
    os << ff;
    std::string raw = os.str();
    auto first_not_zero = raw.find_first_not_of('0', 2);
    std::string result = "0x" + (first_not_zero != std::string::npos ? raw.substr(first_not_zero) : "0");
    return result;
}

void dump_trace_as_csv(std::vector<Row> const& trace, std::filesystem::path const& filename)
{
    std::ofstream file;
    file.open(filename);

    // Filter zero columns indices (ugly and slow).
    std::set<size_t> non_zero_columns;
    const size_t num_columns = Row::names().size();
    for (const Row& row : trace) {
        const auto row_vec = row.as_vector();
        for (size_t i = 0; i < num_columns; ++i) {
            if (row_vec[i] != 0) {
                non_zero_columns.insert(i);
            }
        }
    }
    std::vector<size_t> sorted_non_zero_columns(non_zero_columns.begin(), non_zero_columns.end());
    std::sort(sorted_non_zero_columns.begin(), sorted_non_zero_columns.end());

    const auto& names = Row::names();
    file << "ROW_NUMBER,";
    for (const auto& column_idx : sorted_non_zero_columns) {
        file << names[column_idx] << ",";
    }
    file << std::endl;

    for (size_t r = 0; r < trace.size(); ++r) {
        // Filter zero rows.
        const auto& row_vec = trace[r].as_vector();
        bool all_zero = true;
        for (const auto& column_idx : sorted_non_zero_columns) {
            if (row_vec[column_idx] != 0) {
                all_zero = false;
                break;
            }
        }
        if (!all_zero) {
            file << r << ",";
            for (const auto& column_idx : sorted_non_zero_columns) {
                file << field_to_string(row_vec[column_idx]) << ",";
            }
            file << std::endl;
        }
    }
}

bool is_operand_indirect(uint8_t ind_value, uint8_t operand_idx)
{
    if (operand_idx > 7) {
        return false;
    }

    return (ind_value & (1 << operand_idx)) != 0;
}

/**
 * @brief Convert Public Inputs
 *
 * **Transitional**
 * Converts public inputs from the public inputs vec (PublicCircuitPublicInputs) into it's respective public input
 * columns Which are represented by the `VmPublicInputs` object.
 *
 * @param public_inputs_vec
 * @return VmPublicInputs
 */
template <typename FF_> VmPublicInputs<FF_> convert_public_inputs(std::vector<FF_> const& public_inputs_vec)
{
    VmPublicInputs<FF_> public_inputs;

    // Case where we pass in empty public inputs - this will be used in tests where they are not required
    if (public_inputs_vec.empty()) {
        return public_inputs;
    }

    // Convert the public inputs into the VmPublicInputs object, the public inputs vec must be the correct length - else
    // we throw an exception
    if (public_inputs_vec.size() != PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH) {
        throw_or_abort("Public inputs vector is not of PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH");
    }

    std::array<FF_, KERNEL_INPUTS_LENGTH>& kernel_inputs = std::get<KERNEL_INPUTS>(public_inputs);

    // Copy items from PublicCircuitPublicInputs vector to public input columns
    // PublicCircuitPublicInputs - CallContext
    kernel_inputs[SENDER_SELECTOR] = public_inputs_vec[SENDER_SELECTOR]; // Sender
    // NOTE: address has same position as storage address (they are the same for now...)
    // kernel_inputs[ADDRESS_SELECTOR] = public_inputs_vec[ADDRESS_SELECTOR];                 // Address
    kernel_inputs[STORAGE_ADDRESS_SELECTOR] = public_inputs_vec[STORAGE_ADDRESS_SELECTOR]; // Storage Address
    kernel_inputs[FUNCTION_SELECTOR_SELECTOR] = public_inputs_vec[FUNCTION_SELECTOR_SELECTOR];
    kernel_inputs[IS_STATIC_CALL_SELECTOR] = public_inputs_vec[IS_STATIC_CALL_SELECTOR];

    // PublicCircuitPublicInputs - GlobalVariables
    kernel_inputs[CHAIN_ID_SELECTOR] = public_inputs_vec[CHAIN_ID_OFFSET];         // Chain ID
    kernel_inputs[VERSION_SELECTOR] = public_inputs_vec[VERSION_OFFSET];           // Version
    kernel_inputs[BLOCK_NUMBER_SELECTOR] = public_inputs_vec[BLOCK_NUMBER_OFFSET]; // Block Number
    kernel_inputs[TIMESTAMP_SELECTOR] = public_inputs_vec[TIMESTAMP_OFFSET];       // Timestamp
    // PublicCircuitPublicInputs - GlobalVariables - GasFees
    kernel_inputs[FEE_PER_DA_GAS_SELECTOR] = public_inputs_vec[FEE_PER_DA_GAS_OFFSET];
    kernel_inputs[FEE_PER_L2_GAS_SELECTOR] = public_inputs_vec[FEE_PER_L2_GAS_OFFSET];

    // Transaction fee
    kernel_inputs[TRANSACTION_FEE_SELECTOR] = public_inputs_vec[TRANSACTION_FEE_OFFSET];

    kernel_inputs[DA_GAS_LEFT_CONTEXT_INPUTS_OFFSET] = public_inputs_vec[DA_START_GAS_LEFT_PCPI_OFFSET];
    kernel_inputs[L2_GAS_LEFT_CONTEXT_INPUTS_OFFSET] = public_inputs_vec[L2_START_GAS_LEFT_PCPI_OFFSET];

    // Copy the output columns
    std::array<FF_, KERNEL_OUTPUTS_LENGTH>& ko_values = std::get<KERNEL_OUTPUTS_VALUE>(public_inputs);
    std::array<FF_, KERNEL_OUTPUTS_LENGTH>& ko_side_effect =
        std::get<KERNEL_OUTPUTS_SIDE_EFFECT_COUNTER>(public_inputs);
    std::array<FF_, KERNEL_OUTPUTS_LENGTH>& ko_metadata = std::get<KERNEL_OUTPUTS_METADATA>(public_inputs);

    // We copy each type of the kernel outputs into their respective columns, each has differeing lengths / data
    // For NOTEHASHEXISTS
    for (size_t i = 0; i < MAX_NOTE_HASH_READ_REQUESTS_PER_CALL; i++) {
        size_t dest_offset = START_NOTE_HASH_EXISTS_WRITE_OFFSET + i;
        size_t pcpi_offset = PCPI_NOTE_HASH_EXISTS_OFFSET + (i * READ_REQUEST_LENGTH);

        ko_values[dest_offset] = public_inputs_vec[pcpi_offset];
        ko_side_effect[dest_offset] = public_inputs_vec[pcpi_offset + 1];
    }
    // For NULLIFIEREXISTS
    for (size_t i = 0; i < MAX_NULLIFIER_READ_REQUESTS_PER_CALL; i++) {
        size_t dest_offset = START_NULLIFIER_EXISTS_OFFSET + i;
        size_t pcpi_offset = PCPI_NULLIFIER_EXISTS_OFFSET + (i * READ_REQUEST_LENGTH);

        ko_values[dest_offset] = public_inputs_vec[pcpi_offset];
        ko_side_effect[dest_offset] = public_inputs_vec[pcpi_offset + 1];
        ko_metadata[dest_offset] = FF(1);
    }
    // For NULLIFIEREXISTS - non existent
    for (size_t i = 0; i < MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL; i++) {
        size_t dest_offset = START_NULLIFIER_NON_EXISTS_OFFSET + i;
        size_t pcpi_offset = PCPI_NULLIFIER_NON_EXISTS_OFFSET + (i * READ_REQUEST_LENGTH);

        ko_values[dest_offset] = public_inputs_vec[pcpi_offset];
        ko_side_effect[dest_offset] = public_inputs_vec[pcpi_offset + 1];
        ko_metadata[dest_offset] = FF(0);
    }
    // For L1TOL2MSGEXISTS
    for (size_t i = 0; i < MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_CALL; i++) {
        size_t dest_offset = START_L1_TO_L2_MSG_EXISTS_WRITE_OFFSET + i;
        size_t pcpi_offset = PCPI_L1_TO_L2_MSG_READ_REQUESTS_OFFSET + (i * READ_REQUEST_LENGTH);

        ko_values[dest_offset] = public_inputs_vec[pcpi_offset];
        ko_side_effect[dest_offset] = public_inputs_vec[pcpi_offset + 1];
    }
    // For SSTORE
    for (size_t i = 0; i < MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL; i++) {
        size_t dest_offset = START_SSTORE_WRITE_OFFSET + i;
        size_t pcpi_offset = PCPI_PUBLIC_DATA_UPDATE_OFFSET + (i * CONTRACT_STORAGE_UPDATE_REQUEST_LENGTH);

        // slot, value, side effect
        ko_metadata[dest_offset] = public_inputs_vec[pcpi_offset];
        ko_values[dest_offset] = public_inputs_vec[pcpi_offset + 1];
        ko_side_effect[dest_offset] = public_inputs_vec[pcpi_offset + 2];
    }
    // For SLOAD
    for (size_t i = 0; i < MAX_PUBLIC_DATA_READS_PER_CALL; i++) {
        size_t dest_offset = START_SLOAD_WRITE_OFFSET + i;
        size_t pcpi_offset = PCPI_PUBLIC_DATA_READ_OFFSET + (i * CONTRACT_STORAGE_READ_LENGTH);

        // slot, value, side effect
        ko_metadata[dest_offset] = public_inputs_vec[pcpi_offset];
        ko_values[dest_offset] = public_inputs_vec[pcpi_offset + 1];
        ko_side_effect[dest_offset] = public_inputs_vec[pcpi_offset + 2];
    }
    // For EMITNOTEHASH
    for (size_t i = 0; i < MAX_NOTE_HASHES_PER_CALL; i++) {
        size_t dest_offset = START_EMIT_NOTE_HASH_WRITE_OFFSET + i;
        size_t pcpi_offset = PCPI_NEW_NOTE_HASHES_OFFSET + (i * NOTE_HASH_LENGTH);

        ko_values[dest_offset] = public_inputs_vec[pcpi_offset];
        ko_side_effect[dest_offset] = public_inputs_vec[pcpi_offset + 1];
    }
    // For EMITNULLIFIER
    for (size_t i = 0; i < MAX_NULLIFIERS_PER_CALL; i++) {
        size_t dest_offset = START_EMIT_NULLIFIER_WRITE_OFFSET + i;
        size_t pcpi_offset = PCPI_NEW_NULLIFIERS_OFFSET + (i * NULLIFIER_LENGTH);

        ko_values[dest_offset] = public_inputs_vec[pcpi_offset];
        ko_side_effect[dest_offset] = public_inputs_vec[pcpi_offset + 1];
    }
    // For EMITL2TOL1MSG
    for (size_t i = 0; i < MAX_L2_TO_L1_MSGS_PER_CALL; i++) {
        size_t dest_offset = START_EMIT_L2_TO_L1_MSG_WRITE_OFFSET + i;
        size_t pcpi_offset = PCPI_NEW_L2_TO_L1_MSGS_OFFSET + (i * L2_TO_L1_MESSAGE_LENGTH);

        // Note: unorthadox order
        ko_metadata[dest_offset] = public_inputs_vec[pcpi_offset];
        ko_values[dest_offset] = public_inputs_vec[pcpi_offset + 1];
        ko_side_effect[dest_offset] = public_inputs_vec[pcpi_offset + 2];
    }
    // For EMITUNENCRYPTEDLOG
    for (size_t i = 0; i < MAX_UNENCRYPTED_LOGS_PER_CALL; i++) {
        size_t dest_offset = START_EMIT_UNENCRYPTED_LOG_WRITE_OFFSET + i;
        size_t pcpi_offset =
            PCPI_NEW_UNENCRYPTED_LOGS_OFFSET + (i * 3); // 3 because we have metadata, this is the window size

        ko_values[dest_offset] = public_inputs_vec[pcpi_offset];
        ko_side_effect[dest_offset] = public_inputs_vec[pcpi_offset + 1];
        ko_metadata[dest_offset] = public_inputs_vec[pcpi_offset + 2];
    }

    return public_inputs;
}

template <typename FF_>
std::vector<std::vector<FF_>> copy_public_inputs_columns(VmPublicInputs<FF_> const& public_inputs,
                                                         std::vector<FF_> const& calldata,
                                                         std::vector<FF_> const& returndata)
{
    // We convert to a vector as the pil generated verifier is generic and unaware of the KERNEL_INPUTS_LENGTH
    // For each of the public input vectors
    std::vector<FF_> public_inputs_kernel_inputs(std::get<KERNEL_INPUTS>(public_inputs).begin(),
                                                 std::get<KERNEL_INPUTS>(public_inputs).end());
    std::vector<FF_> public_inputs_kernel_value_outputs(std::get<KERNEL_OUTPUTS_VALUE>(public_inputs).begin(),
                                                        std::get<KERNEL_OUTPUTS_VALUE>(public_inputs).end());
    std::vector<FF_> public_inputs_kernel_side_effect_outputs(
        std::get<KERNEL_OUTPUTS_SIDE_EFFECT_COUNTER>(public_inputs).begin(),
        std::get<KERNEL_OUTPUTS_SIDE_EFFECT_COUNTER>(public_inputs).end());
    std::vector<FF_> public_inputs_kernel_metadata_outputs(std::get<KERNEL_OUTPUTS_METADATA>(public_inputs).begin(),
                                                           std::get<KERNEL_OUTPUTS_METADATA>(public_inputs).end());

    assert(public_inputs_kernel_inputs.size() == KERNEL_INPUTS_LENGTH);
    assert(public_inputs_kernel_value_outputs.size() == KERNEL_OUTPUTS_LENGTH);
    assert(public_inputs_kernel_side_effect_outputs.size() == KERNEL_OUTPUTS_LENGTH);
    assert(public_inputs_kernel_metadata_outputs.size() == KERNEL_OUTPUTS_LENGTH);

    return {
        std::move(public_inputs_kernel_inputs),
        std::move(public_inputs_kernel_value_outputs),
        std::move(public_inputs_kernel_side_effect_outputs),
        std::move(public_inputs_kernel_metadata_outputs),
        calldata,
        returndata,
    };
}

std::string to_hex(bb::avm_trace::AvmMemoryTag tag)
{
    return to_hex(static_cast<uint8_t>(tag));
}

using field_ct = stdlib::field_t<UltraCircuitBuilder>;

template VmPublicInputs<FF> convert_public_inputs(std::vector<FF> const& public_inputs_vec);
template VmPublicInputs<field_ct> convert_public_inputs(std::vector<field_ct> const& public_inputs_vec);

template std::vector<std::vector<FF>> copy_public_inputs_columns(VmPublicInputs<FF> const& public_inputs,
                                                                 std::vector<FF> const& calldata,
                                                                 std::vector<FF> const& returndata);
template std::vector<std::vector<field_ct>> copy_public_inputs_columns(VmPublicInputs<field_ct> const& public_inputs,
                                                                       std::vector<field_ct> const& calldata,
                                                                       std::vector<field_ct> const& returndata);

} // namespace bb::avm_trace
