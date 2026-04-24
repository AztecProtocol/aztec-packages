#include "barretenberg/vm2/tracegen/calldata_trace.hpp"

#include <cstddef>
#include <cstdint>
#include <vector>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_calldata_hashing.hpp"
#include "barretenberg/vm2/generated/relations/perms_calldata_hashing.hpp"

namespace bb::avm2::tracegen {

/**
 * @brief Populate the calldata retrieval trace (calldata.pil) from calldata events.
 *
 * Fills one row per calldata field per context, with index, value, context_id, and end columns.
 * Empty calldata produces no rows (see calldata.pil EMPTY CALLDATA).
 *
 * @param events The calldata events.
 * @param trace The trace container to populate.
 */
void CalldataTraceBuilder::process_retrieval(
    const simulation::EventEmitterInterface<simulation::CalldataEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 1; // Has shifted columns

    for (const auto& event : events) {
        const auto& calldata = event.calldata;
        const auto context_id = event.context_id;

        for (size_t i = 0; i < calldata.size(); i++) {
            bool is_end = i == calldata.size() - 1;
            trace.set(row,
                      { {
                          { C::calldata_sel, 1 },
                          { C::calldata_context_id, context_id },
                          { C::calldata_value, calldata[i] },
                          { C::calldata_index, i + 1 },
                          { C::calldata_end, is_end ? 1 : 0 },
                      } });
            row++;
        }
    }
}

/**
 * @brief Populate the calldata hashing trace (calldata_hashing.pil) from calldata events.
 *
 * Processes each event's calldata through Poseidon2 in chunks of 3 fields, filling rows with
 * input fields, indices, padding flags, round counters, and the output hash. Handles padding
 * when the input length is not a multiple of 3.
 *
 * @param events The calldata events to hash.
 * @param trace The trace container to populate.
 */
void CalldataTraceBuilder::process_hashing(
    const simulation::EventEmitterInterface<simulation::CalldataEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;
    uint32_t row = 1;

    for (const auto& event : events) {
        std::vector<FF> calldata_with_sep = { DOM_SEP__PUBLIC_CALLDATA };
        const size_t input_len = event.calldata.size() + 1; // +1 for the separator

        // We must pad up to the next multiple of 3:
        // n % 3 == 0 => padding_amount = 0 = 2n % 3
        // n % 3 == 1 => padding_amount = 2 = 2n % 3
        // n % 3 == 2 => padding_amount = 1 = 2n % 3
        const auto padding_amount = (2 * input_len) % 3;
        const auto padded_len = input_len + padding_amount;

        calldata_with_sep.reserve(padded_len);
        calldata_with_sep.insert(calldata_with_sep.end(), event.calldata.begin(), event.calldata.end());
        // We add padding values (FF(0)) to ensure each array access in loop below is within bounds.
        calldata_with_sep.insert(calldata_with_sep.end(), padding_amount, FF(0));

        auto num_rounds_rem = padded_len / 3;
        uint32_t index = 0;
        while (num_rounds_rem > 0) {
            bool start = index == 0;
            bool end = num_rounds_rem == 1;
            trace.set(row,
                      { {
                          { C::calldata_hashing_sel, 1 },
                          { C::calldata_hashing_start, start ? 1 : 0 },
                          { C::calldata_hashing_sel_not_start, !start ? 1 : 0 },
                          { C::calldata_hashing_context_id, event.context_id },
                          { C::calldata_hashing_calldata_size, event.calldata.size() },
                          { C::calldata_hashing_input_len, input_len },
                          { C::calldata_hashing_rounds_rem, num_rounds_rem },
                          { C::calldata_hashing_index_0_, index },
                          { C::calldata_hashing_index_1_, index + 1 },
                          { C::calldata_hashing_index_2_, index + 2 },
                          { C::calldata_hashing_input_0_, calldata_with_sep[index] },
                          { C::calldata_hashing_input_1_, calldata_with_sep[index + 1] },
                          { C::calldata_hashing_input_2_, calldata_with_sep[index + 2] },
                          { C::calldata_hashing_output_hash, event.calldata_hash },
                          { C::calldata_hashing_sel_not_padding_1, end && (padding_amount == 2) ? 0 : 1 },
                          { C::calldata_hashing_sel_not_padding_2, end && (padding_amount > 0) ? 0 : 1 },
                          { C::calldata_hashing_end, end ? 1 : 0 },
                          { C::calldata_hashing_sel_end_not_empty, end && !event.calldata.empty() ? 1 : 0 },
                      } });
            index += 3;
            row++;
            num_rounds_rem--;
        }
    }
}

const InteractionDefinition CalldataTraceBuilder::interactions =
    InteractionDefinition()
        .add<InteractionType::LookupSequential, lookup_calldata_hashing_get_calldata_field_0_settings>()
        .add<InteractionType::LookupSequential, lookup_calldata_hashing_get_calldata_field_1_settings>()
        .add<InteractionType::LookupSequential, lookup_calldata_hashing_get_calldata_field_2_settings>()
        .add<InteractionType::Permutation, perm_calldata_hashing_check_final_size_settings>()
        .add<InteractionType::LookupSequential, lookup_calldata_hashing_poseidon2_hash_settings>();

} // namespace bb::avm2::tracegen
