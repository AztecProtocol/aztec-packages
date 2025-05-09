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

void PublicInputsTraceBuilder::process_public_inputs_aux(TraceContainer& trace, const PublicInputs& public_inputs)
{
    using C = Column;

    // Iterate over each array in accumulated data, and set the `sel_nonzero_side_effect_out` column to 1 for all
    // non-zero rows. First for note hashes
    for (uint32_t i = 0; i < MAX_NOTE_HASHES_PER_TX; i++) {
        if (public_inputs.accumulatedData.noteHashes[i] == 0) {
            const uint32_t row = static_cast<uint32_t>(AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX) + i;
            trace.set(C::public_inputs_sel_nonzero_side_effect_out, row, 1);
        }
    }
    // Nullifiers
    for (uint32_t i = 0; i < MAX_NULLIFIERS_PER_TX; i++) {
        if (public_inputs.accumulatedData.nullifiers[i] == 0) {
            const uint32_t row = static_cast<uint32_t>(AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX) + i;
            trace.set(C::public_inputs_sel_nonzero_side_effect_out, row, 1);
        }
    }
    // L2 to L1 messages
    for (uint32_t i = 0; i < MAX_L2_TO_L1_MSGS_PER_TX; i++) {
        // NOTE: despite only checking contractAddress here, constraints should enforce that all fields are non-zero.
        if (public_inputs.accumulatedData.l2ToL1Msgs[i].contractAddress == 0) {
            const uint32_t row =
                static_cast<uint32_t>(AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX) + i;
            trace.set(C::public_inputs_sel_nonzero_side_effect_out, row, 1);
        }
    }

    // Public logs
    for (uint32_t i = 0; i < MAX_PUBLIC_LOGS_PER_TX; i++) {
        // log exists iff contract address is nonzero
        if (public_inputs.accumulatedData.publicLogs[i].contractAddress == 0) {
            // a log has one row per data word
            for (uint32_t j = 0; j < PUBLIC_LOG_DATA_SIZE_IN_FIELDS; j++) {
                const uint32_t offset_to_log = i * PUBLIC_LOG_DATA_SIZE_IN_FIELDS;
                const uint32_t row = static_cast<uint32_t>(AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX) +
                                     offset_to_log + j;
                trace.set(C::public_inputs_sel_nonzero_side_effect_out, row, 1);
            }
        }
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
