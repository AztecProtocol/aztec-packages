#include "barretenberg/vm2/tracegen/public_inputs_trace.hpp"

namespace bb::avm2::tracegen {

void PublicInputsTraceBuilder::process_public_inputs(TraceContainer& trace, const PublicInputs& public_inputs)
{
    using C = Column;

    auto cols = public_inputs.to_columns();

    trace.reserve_column(C::public_inputs_cols_0_, AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);
    trace.reserve_column(C::public_inputs_cols_1_, AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);
    trace.reserve_column(C::public_inputs_cols_2_, AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);
    trace.reserve_column(C::public_inputs_cols_3_, AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);

    for (uint32_t row = 0; row < AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH; row++) {
        trace.set(C::public_inputs_cols_0_, row, cols[0][row]);
        trace.set(C::public_inputs_cols_1_, row, cols[1][row]);
        trace.set(C::public_inputs_cols_2_, row, cols[2][row]);
        trace.set(C::public_inputs_cols_3_, row, cols[3][row]);
    }
}

void PublicInputsTraceBuilder::process_public_inputs_aux_precomputed(TraceContainer& trace)
{
    using C = Column;

    // sel is precomputed to be 1 for all rows up to AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH
    trace.reserve_column(C::public_inputs_sel, AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);
    for (uint32_t row = 0; row < AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH; row++) {
        trace.set(C::public_inputs_sel, row, 1);
    }
}

} // namespace bb::avm2::tracegen
