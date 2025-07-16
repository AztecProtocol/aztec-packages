#include "barretenberg/vm2/tracegen/calldata_trace.hpp"

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/generated/relations/lookups_calldata_hashing.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

using bb::crypto::Poseidon2;

namespace bb::avm2::tracegen {

void CalldataTraceBuilder::process_retrieval(
    const simulation::EventEmitterInterface<simulation::CalldataEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;
    uint32_t row = 1; // Has skip relations

    for (const auto& event : events) {
        const auto& calldata = event.calldata;
        const auto context_id = event.context_id;

        for (size_t i = 0; i < calldata.size(); i++) {
            trace.set(row,
                      { {
                          { C::calldata_sel, 1 },
                          { C::calldata_context_id, context_id },
                          { C::calldata_value, calldata[i] },
                          { C::calldata_index, i },
                          { C::calldata_latch, (i == calldata.size() - 1) ? 1 : 0 },

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

        auto calldata_hash = Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(calldata_with_sep);
        size_t round = 0;
        while (input_size > 0) {
            std::array<FF, 4> input = {};
            size_t chunk_size = std::min(input_size, static_cast<size_t>(3));
            // We hash the calldata with the separator
            for (size_t j = 0; j < chunk_size; j++) {
                input[j] = calldata_with_sep[(round * 3) + j];
            }

            input_size -= chunk_size;

            trace.set(row,
                      { {
                          { C::cd_hashing_sel, 1 },
                          { C::cd_hashing_context_id, event.context_id },
                          { C::cd_hashing_length_remaining, input_size },
                          { C::cd_hashing_input_0_, input[0] },
                          { C::cd_hashing_input_1_, input[1] },
                          { C::cd_hashing_input_2_, input[2] },
                          { C::cd_hashing_output_hash, input_size == 0 ? calldata_hash : 0 },
                          { C::cd_hashing_latch, (input_size == 0) ? 1 : 0 },
                      } });
            round++;
            row++;
        }
    }
}

const InteractionDefinition CalldataTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_calldata_hashing_cd_hash_settings, InteractionType::LookupSequential>()
        .add<lookup_calldata_hashing_cd_hash_end_settings, InteractionType::LookupSequential>();

} // namespace bb::avm2::tracegen
