#include "barretenberg/vm2/tracegen/calldata_trace.hpp"

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/generated/relations/lookups_calldata.hpp"
#include "barretenberg/vm2/generated/relations/lookups_calldata_hashing.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

using Poseidon2 = bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>;

namespace bb::avm2::tracegen {

void CalldataTraceBuilder::process_retrieval(
    const simulation::EventEmitterInterface<simulation::CalldataEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;
    // Sort events by context_id:
    auto cmp = [](const simulation::CalldataEvent* a, const simulation::CalldataEvent* b) {
        return a->context_id < b->context_id;
    };
    std::vector<const simulation::CalldataEvent*> sorted_events;
    sorted_events.reserve(events.size());
    for (const auto& event : events) {
        sorted_events.push_back(&event);
    }
    std::ranges::sort(sorted_events.begin(), sorted_events.end(), cmp);

    uint32_t row = 1; // Has skip relations

    for (uint32_t j = 0; j < events.size(); j++) {
        const auto& event = sorted_events[j];
        const auto& calldata = event->calldata;
        const auto context_id = event->context_id;
        bool is_last = j == events.size() - 1;

        for (size_t i = 0; i < calldata.size(); i++) {
            bool is_latch = i == calldata.size() - 1;
            trace.set(row,
                      { {
                          { C::calldata_sel, 1 },
                          { C::calldata_context_id, context_id },
                          { C::calldata_value, calldata[i] },
                          { C::calldata_index, i + 1 },
                          { C::calldata_latch, is_latch ? 1 : 0 },
                          // Note that the diff is shifted by 1 to ensure the context_ids are increasing:
                          { C::calldata_diff_context_id,
                            (is_latch && !is_last) ? sorted_events[j + 1]->context_id - context_id - 1 : 0 },
                      } });
            row++;
        }

        // Handle empty calldata:
        if (calldata.size() == 0) {
            // To ensure that we indicate a certain context_id has been processed, we include a special row
            // in the calldata trace. This is the only case where sel = 1 and index = 0. Lookups into this trace
            // to access values always shift by 1, so should never attempt to access a non-existent value:
            trace.set(
                row,
                { {
                    { C::calldata_sel, 1 },
                    { C::calldata_context_id, context_id },
                    { C::calldata_value, 0 },
                    { C::calldata_index, 0 },
                    { C::calldata_latch, 1 },
                    // Note that the diff is shifted by 1 to ensure the context_ids are increasing:
                    { C::calldata_diff_context_id, !is_last ? sorted_events[j + 1]->context_id - context_id - 1 : 0 },
                } });
            row++;
        }
    }
}

void CalldataTraceBuilder::process_hashing(
    const simulation::EventEmitterInterface<simulation::CalldataEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;
    uint32_t row = 1;

    for (const auto& event : events) {
        std::vector<FF> calldata_with_sep = { GENERATOR_INDEX__PUBLIC_CALLDATA };
        size_t input_size = event.calldata.size() + 1; // +1 for the separator
        calldata_with_sep.reserve(input_size);
        calldata_with_sep.insert(calldata_with_sep.end(), event.calldata.begin(), event.calldata.end());
        auto calldata_field_at = [&calldata_with_sep](size_t i) -> FF {
            return i < calldata_with_sep.size() ? calldata_with_sep[i] : 0;
        };

        FF output_hash = Poseidon2::hash(calldata_with_sep);
        // We must pad up to the next multiple of 3:
        // n % 3 == 0 => padding_amount = 0 = 2n % 3
        // n % 3 == 1 => padding_amount = 2 = 2n % 3
        // n % 3 == 2 => padding_amount = 1 = 2n % 3
        auto padding_amount = (2 * calldata_with_sep.size()) % 3;
        auto num_rounds_rem = (calldata_with_sep.size() + padding_amount) / 3;
        uint32_t index = 0;
        while (num_rounds_rem > 0) {
            trace.set(
                row,
                { {
                    { C::calldata_hashing_sel, 1 },
                    { C::calldata_hashing_start, index == 0 ? 1 : 0 },
                    { C::calldata_hashing_sel_not_start, index == 0 ? 0 : 1 },
                    { C::calldata_hashing_context_id, event.context_id },
                    { C::calldata_hashing_calldata_size, event.calldata.size() },
                    { C::calldata_hashing_input_len, calldata_with_sep.size() },
                    { C::calldata_hashing_rounds_rem, num_rounds_rem },
                    { C::calldata_hashing_index_0_, index },
                    { C::calldata_hashing_index_1_, index + 1 },
                    { C::calldata_hashing_index_2_, index + 2 },
                    { C::calldata_hashing_input_0_, calldata_field_at(index) },
                    { C::calldata_hashing_input_1_, calldata_field_at(index + 1) },
                    { C::calldata_hashing_input_2_, calldata_field_at(index + 2) },
                    { C::calldata_hashing_output_hash, output_hash },
                    { C::calldata_hashing_sel_not_padding_1, (num_rounds_rem == 1) && (padding_amount == 2) ? 0 : 1 },
                    { C::calldata_hashing_sel_not_padding_2, (num_rounds_rem == 1) && (padding_amount > 0) ? 0 : 1 },
                    { C::calldata_hashing_latch, num_rounds_rem == 1 ? 1 : 0 },
                } });
            index += 3;
            row++;
            num_rounds_rem--;
        }
    }
}

const InteractionDefinition CalldataTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_calldata_range_check_context_id_diff_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_calldata_hashing_get_calldata_field_0_settings, InteractionType::LookupSequential>()
        .add<lookup_calldata_hashing_get_calldata_field_1_settings, InteractionType::LookupSequential>()
        .add<lookup_calldata_hashing_get_calldata_field_2_settings, InteractionType::LookupSequential>()
        .add<lookup_calldata_hashing_check_final_size_settings, InteractionType::LookupSequential>()
        .add<lookup_calldata_hashing_poseidon2_hash_settings,
             InteractionType::LookupGeneric>(); // Note: using lookup generic to avoid dedup issues

} // namespace bb::avm2::tracegen
