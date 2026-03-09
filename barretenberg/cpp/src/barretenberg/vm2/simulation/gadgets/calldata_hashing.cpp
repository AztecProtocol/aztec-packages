#include "barretenberg/vm2/simulation/gadgets/calldata_hashing.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/events/calldata_event.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Assert that the given calldata hashes to the expected hash, and emit a calldata event.
 *
 * Prepends the public calldata domain separator, hashes via Poseidon2, and asserts the result
 * matches the provided hash. Emits a CalldataEvent for trace generation.
 *
 * @param cd_hash The expected calldata hash.
 * @param calldata The calldata fields to hash.
 */
void CalldataHasher::assert_calldata_hash(const FF& cd_hash, std::span<const FF> calldata)
{
    // todo(ilyas): this probably simulates faster at the cost of re-work in tracegen
    std::vector<FF> calldata_with_sep = { DOM_SEP__PUBLIC_CALLDATA };
    for (const auto& value : calldata) {
        // Note: Using `insert` breaks GCC.
        calldata_with_sep.push_back(value);
    }
    FF computed_hash = hasher.hash(calldata_with_sep);
    BB_ASSERT_EQ(computed_hash, cd_hash);

    events.emit({
        .context_id = context_id,
        .calldata = { calldata.begin(), calldata.end() },
    });
}

} // namespace bb::avm2::simulation
