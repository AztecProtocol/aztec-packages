#include "barretenberg/vm2/simulation/gadgets/calldata_hashing.hpp"

#include <vector>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/common/assert.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Assert that the given calldata hashes to the expected hash, and emit a calldata event.
 *
 * Prepends the public calldata domain separator, hashes via Poseidon2, and asserts the result
 * matches the provided hash. Emits a CalldataEvent for trace generation.
 *
 * @param cd_hash The expected calldata hash.
 * @param calldata The calldata fields to hash.
 * @note Asserts that the computed Poseidon2 hash of the calldata (with domain separator) equals cd_hash.
 */
void CalldataHasher::assert_calldata_hash(const FF& cd_hash, std::span<const FF> calldata)
{
    std::vector<FF> calldata_with_sep = { DOM_SEP__PUBLIC_CALLDATA };
    calldata_with_sep.reserve(calldata.size() + 1);

    for (const auto& value : calldata) {
        // Note: Using `insert` breaks GCC.
        calldata_with_sep.push_back(value);
    }

    // Right-hand term is required to emit poseidon2 hash/permutation events.
    FF computed_hash = hasher.hash(calldata_with_sep);
    BB_ASSERT_EQ(computed_hash, cd_hash);

    events.emit({
        .context_id = context_id,
        .calldata = { calldata.begin(), calldata.end() },
        .calldata_hash = cd_hash,
    });
}

} // namespace bb::avm2::simulation
