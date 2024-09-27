#pragma once

#include <filesystem>

#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/trace.hpp"

namespace bb::avm_trace {

void log_avm_trace(std::vector<Row> const& trace, size_t beg, size_t end, bool enable_selectors = false);
void dump_trace_as_csv(const std::vector<Row>& trace, const std::filesystem::path& filename);

bool is_operand_indirect(uint8_t ind_value, uint8_t operand_idx);

// Copy Public Input Columns
// There are 5 public input columns, one for inputs, one for returndata and 3 for the kernel outputs
// {value, side effect counter, metadata}. The verifier is generic, and so accepts vectors of these values
// rather than the fixed length arrays that are used during circuit building. This method copies each array
// into a vector to be used by the verifier.
std::vector<std::vector<FF>> copy_public_inputs_columns(VmPublicInputs const& public_inputs,
                                                        std::vector<FF> const& calldata,
                                                        std::vector<FF> const& returndata);

template <typename T>
    requires(std::unsigned_integral<T>)
std::string to_hex(T value)
{
    std::ostringstream stream;
    auto num_bytes = static_cast<uint64_t>(sizeof(T));
    auto mask = static_cast<uint64_t>((static_cast<uint128_t>(1) << (num_bytes * 8)) - 1);
    auto padding = static_cast<int>(num_bytes * 2);
    stream << std::setfill('0') << std::setw(padding) << std::hex << (value & mask);
    return stream.str();
}

std::string to_hex(bb::avm_trace::AvmMemoryTag tag);

} // namespace bb::avm_trace
