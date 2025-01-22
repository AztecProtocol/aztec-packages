

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/log.hpp"
#include <array>
#include <memory>
namespace bb {

template <typename OuterFlavor>
static void compare_ultra_verification_keys(
    std::array<typename OuterFlavor::CircuitBuilder::ExecutionTrace, 2> blocks,
    std::array<std::shared_ptr<typename OuterFlavor::VerificationKey>, 2> verification_keys)
{

    // Retrieves the trace blocks (each consisting of a specific gate) from the recursive verifier circuit

    bool broke(false);
    auto check_eq = [&broke](auto& p1, auto& p2) {
        ASSERT(p1.size() == p2.size());
        for (size_t idx = 0; idx < p1.size(); idx++) {
            if (p1[idx] != p2[idx]) {
                broke = true;
                break;
            }
        }
    };

    size_t block_idx = 0;
    for (auto [block_0, block_1] : zip_view(blocks[0].get(), blocks[1].get())) {
        info("block index: ", block_idx);
        ASSERT(block_0.selectors.size() == 13);
        ASSERT(block_1.selectors.size() == 13);
        for (auto [p_10, p_11] : zip_view(block_0.selectors, block_1.selectors)) {
            check_eq(p_10, p_11);
        }
        block_idx++;
    }

    typename OuterFlavor::CommitmentLabels labels;
    for (auto [vk_0, vk_1, label] :
         zip_view(verification_keys[0]->get_all(), verification_keys[1]->get_all(), labels.get_precomputed())) {
        if (vk_0 != vk_1) {
            broke = true;
            info("Mismatch verification key label: ", label, " left: ", vk_0, " right: ", vk_1);
        }
    }

    ASSERT(verification_keys[0]->circuit_size == verification_keys[1]->circuit_size);
    ASSERT(verification_keys[0]->num_public_inputs == verification_keys[1]->num_public_inputs);

    ASSERT(broke);
}

} // namespace bb