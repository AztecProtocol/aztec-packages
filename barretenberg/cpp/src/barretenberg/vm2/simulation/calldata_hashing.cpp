#include "barretenberg/vm2/simulation/calldata_hashing.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/events/calldata_event.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::simulation {

FF CalldataHasher::compute_calldata_hash(std::span<const FF> calldata)
{
    if (calldata.empty()) {
        // Based on the noir short circuit, if the calldata is empty we return 0
        // There is no need to emit an event.
        return 0;
    }
    // todo(ilyas): this probably simulates faster at the cost of re-work in tracegen
    std::vector<FF> calldata_with_sep = { GENERATOR_INDEX__PUBLIC_CALLDATA };
    calldata_with_sep.insert(calldata_with_sep.end(), calldata.begin(), calldata.end());
    FF output_hash = hasher.hash(calldata_with_sep);

    events.emit({
        .context_id = context_id,
        .calldata_length = static_cast<uint32_t>(calldata.size()),
        .calldata = { calldata.begin(), calldata.end() },
        .output_hash = output_hash,
    });
    return output_hash;
}

} // namespace bb::avm2::simulation
