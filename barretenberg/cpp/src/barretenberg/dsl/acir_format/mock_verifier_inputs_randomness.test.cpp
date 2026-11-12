#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"

#include <array>
#include <gtest/gtest.h>

using namespace acir_format;
using namespace bb;

namespace {

/**
 * @brief Reset the debug engine to a fixed state and return it
 * @details The default engine (numeric::get_randomness) reads the OS CSPRNG and cannot be reset, so the functions under
 * test are given this engine explicitly.
 */
numeric::RNG& reset_debug_engine()
{
    return numeric::get_debug_randomness(/*reset=*/true, /*seed=*/4321U);
}

fr next_debug_draw()
{
    return fr::random_element(&numeric::get_debug_randomness());
}

} // namespace

template <typename IO> class MockVerifierInputsRandomnessTest : public ::testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using IOTypes =
    ::testing::Types<stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>, stdlib::recursion::honk::RollupIO>;
TYPED_TEST_SUITE(MockVerifierInputsRandomnessTest, IOTypes);

/**
 * @brief Discarding the randomness of an arbitrary valid proof leaves the engine where constructing the proof does
 * @details Construction is also checked to depend on no randomness beyond the given engine: two constructions from
 * the same engine state produce the same proof and VK, which they would not if the prover drew masking values from
 * the default engine.
 */
TYPED_TEST(MockVerifierInputsRandomnessTest, DiscardDrawsAsConstructionDoes)
{
    using IO = TypeParam;

    for (const size_t num_public_inputs : std::array<size_t, 2>{ 0, 5 }) {
        const auto [proof, vk] =
            construct_arbitrary_valid_honk_proof_and_vk<UltraFlavor, IO>(num_public_inputs, &reset_debug_engine());
        const fr draw_after_construction = next_debug_draw();

        const auto [proof_again, vk_again] =
            construct_arbitrary_valid_honk_proof_and_vk<UltraFlavor, IO>(num_public_inputs, &reset_debug_engine());
        EXPECT_EQ(proof, proof_again);
        EXPECT_EQ(*vk, *vk_again);

        discard_arbitrary_valid_honk_proof_randomness<UltraFlavor, IO>(num_public_inputs, &reset_debug_engine());
        const fr draw_after_discard = next_debug_draw();

        EXPECT_EQ(draw_after_discard, draw_after_construction) << "num_public_inputs = " << num_public_inputs;
        // Both paths draw from the given engine, so the next draw is not its first one.
        EXPECT_NE(draw_after_discard, fr::random_element(&reset_debug_engine()));
    }
}
