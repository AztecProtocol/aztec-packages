// Note these tests are a bit hacky
#include "barretenberg/honk/composer/ultra_composer.hpp"
#include "protogalaxy_prover.hpp"
#include <gtest/gtest.h>
using namespace proof_system::honk;

using Flavor = flavor::Ultra;
using Instance = ProverInstance_<Flavor>;
using Instances = ProverInstances_<Flavor, 2>;
using ProtoGalaxyProver = ProtoGalaxyProver_<Instances>;
using FF = Flavor::FF;
using Builder = Flavor::CircuitBuilder;
using ProverPolynomials = Flavor::ProverPolynomials;
const size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;

namespace protogalaxy_utils_tests {
namespace {
auto& engine = numeric::random::get_debug_engine();
}

barretenberg::Polynomial<FF> random_poly(size_t size)
{
    auto poly = barretenberg::Polynomial<FF>(size);
    for (auto& coeff : poly) {
        coeff = FF::random_element();
    }
    return poly;
}

ProverPolynomials construct_ultra_full_polynomials(auto& input_polynomials)
{
    ProverPolynomials full_polynomials;
    full_polynomials.q_c = input_polynomials[0];
    full_polynomials.q_l = input_polynomials[1];
    full_polynomials.q_r = input_polynomials[2];
    full_polynomials.q_o = input_polynomials[3];
    full_polynomials.q_4 = input_polynomials[4];
    full_polynomials.q_m = input_polynomials[5];
    full_polynomials.q_arith = input_polynomials[6];
    full_polynomials.q_sort = input_polynomials[7];
    full_polynomials.q_elliptic = input_polynomials[8];
    full_polynomials.q_aux = input_polynomials[9];
    full_polynomials.q_lookup = input_polynomials[10];
    full_polynomials.sigma_1 = input_polynomials[11];
    full_polynomials.sigma_2 = input_polynomials[12];
    full_polynomials.sigma_3 = input_polynomials[13];
    full_polynomials.sigma_4 = input_polynomials[14];
    full_polynomials.id_1 = input_polynomials[15];
    full_polynomials.id_2 = input_polynomials[16];
    full_polynomials.id_3 = input_polynomials[17];
    full_polynomials.id_4 = input_polynomials[18];
    full_polynomials.table_1 = input_polynomials[19];
    full_polynomials.table_2 = input_polynomials[20];
    full_polynomials.table_3 = input_polynomials[21];
    full_polynomials.table_4 = input_polynomials[22];
    full_polynomials.lagrange_first = input_polynomials[23];
    full_polynomials.lagrange_last = input_polynomials[24];
    full_polynomials.w_l = input_polynomials[25];
    full_polynomials.w_r = input_polynomials[26];
    full_polynomials.w_o = input_polynomials[27];
    full_polynomials.w_4 = input_polynomials[28];
    full_polynomials.sorted_accum = input_polynomials[29];
    full_polynomials.z_perm = input_polynomials[30];
    full_polynomials.z_lookup = input_polynomials[31];
    full_polynomials.table_1_shift = input_polynomials[32];
    full_polynomials.table_2_shift = input_polynomials[33];
    full_polynomials.table_3_shift = input_polynomials[34];
    full_polynomials.table_4_shift = input_polynomials[35];
    full_polynomials.w_l_shift = input_polynomials[36];
    full_polynomials.w_r_shift = input_polynomials[37];
    full_polynomials.w_o_shift = input_polynomials[38];
    full_polynomials.w_4_shift = input_polynomials[39];
    full_polynomials.sorted_accum_shift = input_polynomials[40];
    full_polynomials.z_perm_shift = input_polynomials[41];
    full_polynomials.z_lookup_shift = input_polynomials[42];

    return full_polynomials;
}
class ProtoGalaxyTests : public ::testing::Test {
  public:
    static void SetUpTestSuite() { barretenberg::srs::init_crs_factory("../srs_db/ignition"); }
};

TEST_F(ProtoGalaxyTests, FullHonkEvaluationsValidCircuit)
{
    auto builder = Builder();
    FF a = FF::one();
    uint32_t a_idx = builder.add_public_variable(a);
    FF b = FF::one();
    FF c = a + b;
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);
    builder.create_add_gate({ a_idx, b_idx, c_idx, 1, 1, -1, 0 });
    builder.create_add_gate({ a_idx, b_idx, c_idx, 1, 1, -1, 0 });

    auto composer = UltraComposer();
    auto instance = composer.create_instance(builder);
    instance->initialise_prover_polynomials();

    auto eta = FF::random_element();
    auto beta = FF::random_element();
    auto gamma = FF::random_element();
    instance->compute_sorted_accumulator_polynomials(eta);
    instance->compute_grand_product_polynomials(beta, gamma);

    auto alpha = FF::random_element();
    auto full_honk_evals = ProtoGalaxyProver::compute_full_honk_evaluations(
        instance->prover_polynomials, alpha, instance->relation_parameters);

    // Evaluations should be 0 for valid circuit
    for (const auto& eval : full_honk_evals) {
        EXPECT_EQ(eval, FF(0));
    }
}
TEST_F(ProtoGalaxyTests, PerturbatorCoefficients)
{
    std::vector<FF> betas = { FF(5), FF(8), FF(11) };
    std::vector<FF> deltas = { FF(2), FF(4), FF(8) };
    std::vector<FF> full_honk_evaluations = { FF(1), FF(1), FF(1), FF(1), FF(1), FF(1), FF(1), FF(1) };
    auto perturbator = ProtoGalaxyProver::construct_perturbator_coeffs(betas, deltas, full_honk_evaluations);
    std::vector<FF> expected_values = { FF(648), FF(936), FF(432), FF(64) };
    EXPECT_EQ(perturbator.size(), 4); // log(instance_size) + 1
    for (size_t i = 0; i < perturbator.size(); i++) {
        EXPECT_EQ(perturbator[i], expected_values[i]);
    }
}

TEST_F(ProtoGalaxyTests, PowPerturbatorPolynomial)
{
    const size_t log_instance_size(3);
    const size_t instance_size(1 << log_instance_size);

    // Randomly construct the prover polynomials that are input to Sumcheck.
    // Note: ProverPolynomials are defined as spans so the polynomials they point to need to exist in memory.
    std::array<barretenberg::Polynomial<FF>, NUM_POLYNOMIALS> random_polynomials;
    for (auto& poly : random_polynomials) {
        poly = random_poly(instance_size);
    }
    auto full_polynomials = construct_ultra_full_polynomials(random_polynomials);
    proof_system::RelationParameters<FF> relation_parameters{
        .eta = FF::random_element(),
        .beta = FF::random_element(),
        .gamma = FF::random_element(),
        .public_input_delta = FF::one(),
    };
    auto alpha = FF::random_element();
    auto full_honk_evals =
        ProtoGalaxyProver::compute_full_honk_evaluations(full_polynomials, alpha, relation_parameters);
    info(full_honk_evals);
    std::vector<FF> betas = { FF(2), FF(4), FF(16) };
    std::vector<FF> pow_beta(instance_size);
    for (size_t i = 0; i < instance_size; i++) {
        auto j = i;
        size_t idx = 0;
        auto res = FF(1);
        while (j > 0) {
            if ((j & 1) == 1) {

                res *= betas[idx];
            }
            j >>= 1;
            idx++;
        }
        pow_beta[i] = res;
    }
    info(pow_beta);
    auto expected_target_sum = FF(0);
    for (size_t i = 0; i < instance_size; i++) {
        expected_target_sum += full_honk_evals[i] * pow_beta[i];
    }
    info(expected_target_sum);
    auto folding_result = FoldingResult<Flavor>{ .folded_prover_polynomials = full_polynomials,
                                                 .params = { betas, expected_target_sum } };
    auto accumulator = std::make_shared<Instance>(folding_result);
    std::vector<FF> deltas = { FF(2), FF(4), FF(8) };
    auto perturbator = ProtoGalaxyProver::compute_perturbator(accumulator, deltas, alpha);
    info(perturbator);
}
} // namespace protogalaxy_utils_tests