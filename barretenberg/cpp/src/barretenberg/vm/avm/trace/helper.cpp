#include "barretenberg/vm/avm/trace/helper.hpp"

#include <cassert>

#include "barretenberg/vm/avm/trace/mem_trace.hpp"

namespace bb::avm_trace {

void dump_trace_as_csv(std::vector<Row> const& trace, std::filesystem::path const& filename)
{
    std::ofstream file;
    file.open(filename);

    for (const auto& row_name : Row::names()) {
        file << row_name << ",";
    }
    file << std::endl;

    for (const auto& row : trace) {
        file << row << std::endl;
    }
}

bool is_operand_indirect(uint8_t ind_value, uint8_t operand_idx)
{
    if (operand_idx > 7) {
        return false;
    }

    return static_cast<bool>((ind_value & (1 << operand_idx)) >> operand_idx);
}

std::vector<std::vector<FF>> copy_public_inputs_columns(VmPublicInputs const& public_inputs,
                                                        std::vector<FF> const& calldata,
                                                        std::vector<FF> const& returndata)
{
    // We convert to a vector as the pil generated verifier is generic and unaware of the KERNEL_INPUTS_LENGTH
    // For each of the public input vectors
    std::vector<FF> public_inputs_kernel_inputs(std::get<KERNEL_INPUTS>(public_inputs).begin(),
                                                std::get<KERNEL_INPUTS>(public_inputs).end());
    std::vector<FF> public_inputs_kernel_value_outputs(std::get<KERNEL_OUTPUTS_VALUE>(public_inputs).begin(),
                                                       std::get<KERNEL_OUTPUTS_VALUE>(public_inputs).end());
    std::vector<FF> public_inputs_kernel_side_effect_outputs(
        std::get<KERNEL_OUTPUTS_SIDE_EFFECT_COUNTER>(public_inputs).begin(),
        std::get<KERNEL_OUTPUTS_SIDE_EFFECT_COUNTER>(public_inputs).end());
    std::vector<FF> public_inputs_kernel_metadata_outputs(std::get<KERNEL_OUTPUTS_METADATA>(public_inputs).begin(),
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

} // namespace bb::avm_trace
