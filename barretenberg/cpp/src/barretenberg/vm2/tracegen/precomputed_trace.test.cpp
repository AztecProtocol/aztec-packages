#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/public_inputs_trace.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

#include <cstddef>
#include <gtest/gtest.h>

#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2::tracegen {
namespace {

TEST(PrecomputedTraceTest, AllColumnSizesWithinLimit)
{
    TraceContainer trace;
    PrecomputedTraceBuilder precomputed_builder;
    PublicInputsTraceBuilder public_inputs_builder;

    precomputed_builder.process_misc(trace);
    precomputed_builder.process_bitwise(trace);
    precomputed_builder.process_sel_range_8(trace);
    precomputed_builder.process_sel_range_16(trace);
    precomputed_builder.process_power_of_2(trace);
    precomputed_builder.process_sha256_round_constants(trace);
    precomputed_builder.process_keccak_round_constants(trace);
    precomputed_builder.process_tag_parameters(trace);
    precomputed_builder.process_wire_instruction_spec(trace);
    precomputed_builder.process_exec_instruction_spec(trace);
    precomputed_builder.process_memory_tag_range(trace);
    precomputed_builder.process_addressing_gas(trace);
    precomputed_builder.process_phase_table(trace);
    precomputed_builder.process_get_env_var_table(trace);
    precomputed_builder.process_get_contract_instance_table(trace);
    precomputed_builder.process_to_radix_safe_limbs(trace);
    precomputed_builder.process_to_radix_p_decompositions(trace);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);

    size_t max_rows = 0;
    for (size_t i = 0; i < TraceContainer::num_columns(); i++) {
        const auto col = static_cast<Column>(i);
        const uint32_t rows = trace.get_column_rows(col);
        if (rows > 0) {
            EXPECT_LE(rows, PRECOMPUTED_TRACE_SIZE)
                << "precomputed column " << i << " has " << rows << " rows, exceeds " << PRECOMPUTED_TRACE_SIZE;
            max_rows = std::max(max_rows, static_cast<size_t>(rows));
        }
    }
    EXPECT_EQ(max_rows, PRECOMPUTED_TRACE_SIZE)
        << "max rows is " << max_rows << ", expected " << PRECOMPUTED_TRACE_SIZE;
}

} // namespace
} // namespace bb::avm2::tracegen
