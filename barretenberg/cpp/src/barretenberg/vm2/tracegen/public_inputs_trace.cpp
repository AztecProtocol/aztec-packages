#include "barretenberg/vm2/tracegen/public_inputs_trace.hpp"

#include <array>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"

namespace bb::avm2::tracegen {

/**
 * @brief Populate the public inputs trace columns from the given public inputs.
 *
 * Converts the public inputs into 4 column vectors and writes each element
 * into the corresponding trace columns (public_inputs_cols_0_ through _3_).
 *
 * @param trace The trace container to populate.
 * @param public_inputs The transaction's public inputs to encode into the trace.
 */
void PublicInputsTraceBuilder::process_public_inputs(TraceContainer& trace, const PublicInputs& public_inputs)
{
    using C = Column;

    auto cols = public_inputs.to_columns();

    // Each public input column has its own length (cols is jagged). Write only the used rows of each
    // committed column; the remaining trace rows default to zero, which is what the public input
    // consistency check (hashing + MLE) in the verifier expects.
    constexpr std::array<C, AVM_NUM_PUBLIC_INPUT_COLUMNS> public_input_columns = {
        C::public_inputs_cols_0_,
        C::public_inputs_cols_1_,
        C::public_inputs_cols_2_,
        C::public_inputs_cols_3_,
    };

    for (size_t i = 0; i < AVM_NUM_PUBLIC_INPUT_COLUMNS; i++) {
        trace.reserve_column(public_input_columns[i], AVM_PUBLIC_INPUTS_COLUMN_LENGTHS[i]);
        for (uint32_t row = 0; row < AVM_PUBLIC_INPUTS_COLUMN_LENGTHS[i]; row++) {
            trace.set(public_input_columns[i], row, cols[i][row]);
        }
    }
}

/// @note The precomputed trace size must be >= the public inputs trace size
/// because we use precomputed_idx to lookup into the public inputs trace.
static_assert(PRECOMPUTED_TRACE_SIZE >= AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);

/**
 * @brief Populate the auxiliary precomputed selector for the public inputs subtrace.
 *
 * Sets public_inputs_sel to 1 for rows [0, AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH),
 * marking which rows belong to the public inputs region of the trace.
 *
 * @param trace The trace container to populate.
 */
void PublicInputsTraceBuilder::process_public_inputs_aux_precomputed(TraceContainer& trace)
{
    using C = Column;

    // sel is precomputed to be 1 for rows [0, AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH)
    trace.reserve_column(C::public_inputs_sel, AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);
    for (uint32_t row = 0; row < AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH; row++) {
        trace.set(C::public_inputs_sel, row, 1);
    }
}

} // namespace bb::avm2::tracegen
