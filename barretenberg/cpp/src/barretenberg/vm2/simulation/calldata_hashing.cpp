#include "barretenberg/vm2/simulation/calldata_hashing.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/events/calldata_event.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::simulation {

FF CalldataHasher::compute_calldata_hash(const EnqueuedCallId enqueued_call_id, const std::vector<FF>& calldata)
{
    // todo(ilyas): this probably simulates faster at the cost of re-work in tracegen
    FF output_hash = hasher.hash(calldata);

    events.emit({
        .enqueued_call_id = enqueued_call_id,
        .calldata_length = static_cast<uint32_t>(calldata.size()),
        .calldata = calldata,
        .output_hash = output_hash,
    });
    return output_hash;
}

} // namespace bb::avm2::simulation
