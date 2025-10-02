#include "barretenberg/vm2/simulation/gadgets/calldata_hashing.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/events/calldata_event.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::simulation {

FF CalldataHasher::compute_calldata_hash(std::span<const FF> calldata)
{
    // todo(ilyas): this probably simulates faster at the cost of re-work in tracegen
    std::vector<FF> calldata_with_sep = { GENERATOR_INDEX__PUBLIC_CALLDATA };
    for (const auto& value : calldata) {
        // Note: Using `insert` breaks GCC.
        calldata_with_sep.push_back(value);
    }
    FF output_hash = hasher.hash(calldata_with_sep);

    events.emit({
        .context_id = context_id,
        .calldata_size = static_cast<uint32_t>(calldata.size()),
        .calldata = { calldata.begin(), calldata.end() },
    });
    return output_hash;
}

} // namespace bb::avm2::simulation
