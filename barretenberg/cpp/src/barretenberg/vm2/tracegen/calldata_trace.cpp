#include "barretenberg/vm2/tracegen/calldata_trace.hpp"

#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/generated/relations/lookups_cd_hashing.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/make_jobs.hpp"

using bb::crypto::Poseidon2Permutation;
namespace bb::avm2::tracegen {

void CalldataTraceBuilder::process_retrieval(
    const simulation::EventEmitterInterface<simulation::CalldataEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;
    uint32_t row = 1; // Has skip relations

    for (const auto& event : events) {
        const auto& calldata = event.calldata;
        const auto enqueued_call_id = event.enqueued_call_id;

        for (size_t i = 0; i < calldata.size(); i++) {
            trace.set(row,
                      { {
                          { C::calldata_sel, 1 },
                          { C::calldata_enqueued_call_id, enqueued_call_id },
                          { C::calldata_value, calldata[i] },
                          { C::calldata_index, i + 1 },
                          { C::calldata_latch, (i == calldata.size() - 1) ? 1 : 0 },
                      } });
            row++;
        }
    }
}
void CalldataTraceBuilder::process_hashing(
    const simulation::EventEmitterInterface<simulation::CalldataHashingEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;
    uint32_t row = 1;

    for (const auto& event : events) {
        // Chunks of 3
        const auto& calldata = event.calldata;
        const auto enqueued_call_id = event.enqueued_call_id;
        const auto calldata_length = event.calldata_length;
        size_t input_size = calldata.size();

        std::array<FF, 4> perm_state = { 0, 0, 0, static_cast<uint256_t>(calldata_length) << 64 };

        size_t round = 0;
        while (input_size > 0) {
            std::array<FF, 4> input = {};
            size_t chunk_size = std::min(input_size, static_cast<size_t>(3));
            for (size_t j = 0; j < chunk_size; j++) {
                input[j] = calldata[(round * 3) + j];
                perm_state[j] += calldata[(round * 3) + j]; // Only used in the permutation computation
            }
            perm_state = Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams>::permutation(perm_state);

            input_size -= chunk_size;

            trace.set(row,
                      { {
                          { C::cd_hashing_sel, 1 },
                          { C::cd_hashing_enqueued_call_id, enqueued_call_id },
                          { C::cd_hashing_length_remaining, input_size },
                          { C::cd_hashing_input_0, input[0] },
                          { C::cd_hashing_input_1, input[1] },
                          { C::cd_hashing_input_2, input[2] },
                          { C::cd_hashing_output_0, perm_state[0] },
                          { C::cd_hashing_output_1, perm_state[1] },
                          { C::cd_hashing_output_2, perm_state[2] },
                          { C::cd_hashing_output_3, perm_state[3] },
                          { C::cd_hashing_latch, (input_size == 0) ? 1 : 0 },
                      } });
            round++;
            row++;
        }
        // Sanity Check
        assert(perm_state[0] == event.output_hash);
    }
}

std::vector<std::unique_ptr<class InteractionBuilderInterface>> CalldataTraceBuilder::lookup_jobs()
{
    return make_jobs<std::unique_ptr<InteractionBuilderInterface>>(
        std::make_unique<LookupIntoDynamicTableSequential<lookup_cd_hashing_cd_hash_settings_>>());
}

} // namespace bb::avm2::tracegen
