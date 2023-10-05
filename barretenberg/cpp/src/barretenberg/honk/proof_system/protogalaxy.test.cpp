// Note these tests are a bit hacky
#include "barretenberg/honk/composer/ultra_composer.hpp"
#include "protogalaxy_prover.hpp"
#include <gtest/gtest.h>
using namespace proof_system::honk;

namespace protogalaxy_utils_tests {
namespace {
auto& engine = numeric::random::get_debug_engine();
}
class ProtoGalaxyTests : public ::testing::Test {
  public:
    using Flavor = flavor::Ultra;
    using Instances = ProverInstances_<Flavor, 2>;
    using ProtoGalaxyProver = ProtoGalaxyProver_<Instances>;
    using FF = Flavor::FF;
    using Builder = Flavor::CircuitBuilder;

    static void SetUpTestSuite() { barretenberg::srs::init_crs_factory("../srs_db/ignition"); }
};
TEST_F(ProtoGalaxyTests, PerturbatorCoefficients)
{
    std::vector<FF> betas = { FF(5), FF(8), FF(11) };
    std::vector<FF> deltas = { FF(2), FF(4), FF(8) };
    std::vector<FF> full_honk_evaluations = { FF(1), FF(1), FF(1), FF(1), FF(1), FF(1), FF(1), FF(1) };
    auto perturbator = ProtoGalaxyProver::construct_perturbator_coeffs(betas, deltas, full_honk_evaluations);
    std::vector<FF> expected_values = { FF(648), FF(936), FF(432), FF(64) };
    EXPECT_EQ(perturbator.size(), 4); // log_2(instance_size) + 1
    for (size_t i = 0; i < perturbator.size(); i++) {
        EXPECT_EQ(perturbator[i], expected_values[i]);
    }
}

TEST_F(ProtoGalaxyTests, PowPerturbatorPolynomial)
{

    auto builder = Builder();
    FF a = FF::one();

    // Add some basic add gates, with a public input for good measure
    uint32_t a_idx = builder.add_public_variable(a);
    FF b = FF::one();
    FF c = a + b;
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);
    builder.create_add_gate({ a_idx, b_idx, c_idx, 1, 1, -1, 0 });

    auto composer = UltraComposer();
    auto instance = composer.create_instance(builder);
    instance->folding_params = { { FF(5), FF(8), FF(11), FF(10) }, FF(1) };

    auto delta = FF::random_element();
    auto alpha = FF::random_element();

    std::vector<std::shared_ptr<ProverInstance_<Flavor>>> insts;
    insts.emplace_back(instance);
    insts.emplace_back(instance);
    auto prover = composer.create_folding_prover(insts);
    prover.prepare_for_folding();

    auto log_instance_size = static_cast<size_t>(numeric::get_msb(instance->prover_polynomials[0].size()));
    auto deltas = ProtoGalaxyProver::compute_round_challenge_pows(log_instance_size, delta);

    auto perturbator_coeffs = ProtoGalaxyProver::compute_perturbator(instance, deltas, alpha);
    for (size_t i = 0; i < perturbator_coeffs.size(); i++) {
        info(perturbator_coeffs[i]);
    }
}
} // namespace protogalaxy_utils_tests