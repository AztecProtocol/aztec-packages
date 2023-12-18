#include "barretenberg/protogalaxy/protogalaxy_prover.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"
#include <gtest/gtest.h>

using namespace barretenberg;
using namespace proof_system::honk;

using Flavor = flavor::Ultra;
using VerificationKey = Flavor::VerificationKey;
using Instance = ProverInstance_<Flavor>;
using Instances = ProverInstances_<Flavor, 2>;
using ProtoGalaxyProver = ProtoGalaxyProver_<Instances>;
using FF = Flavor::FF;
using Affine = Flavor::Commitment;
using Projective = Flavor::GroupElement;
using Builder = Flavor::CircuitBuilder;
using Polynomial = typename Flavor::Polynomial;
using ProverPolynomials = Flavor::ProverPolynomials;
using RelationParameters = proof_system::RelationParameters<FF>;
using WitnessCommitments = typename Flavor::WitnessCommitments;
const size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;

namespace protogalaxy_tests {
namespace {
auto& engine = numeric::random::get_debug_engine();
}
// TODO(https://github.com/AztecProtocol/barretenberg/issues/744): make testing utility with functionality shared
// amongst test files in the proof system
barretenberg::Polynomial<FF> get_random_polynomial(size_t size)
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
    for (auto [prover_poly, input_poly] : zip_view(full_polynomials.get_all(), input_polynomials)) {
        prover_poly = input_poly.share();
    }
    return full_polynomials;
}

std::shared_ptr<VerificationKey> construct_ultra_verification_key(size_t instance_size, size_t num_public_inputs)
{
    auto verification_key = std::make_shared<typename Flavor::VerificationKey>(instance_size, num_public_inputs);
    auto vk_view = verification_key->get_all();
    for (auto& view : vk_view) {
        view = Affine(Projective::random_element());
    }
    return verification_key;
}

WitnessCommitments construct_witness_commitments()
{
    WitnessCommitments wc;
    auto w_view = wc.get_all();
    for (auto& view : w_view) {
        view = Affine(Projective::random_element());
    }
    return wc;
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
    instance->initialize_prover_polynomials();

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
    auto perturbator = ProtoGalaxyProver::construct_perturbator_coefficients(betas, deltas, full_honk_evaluations);
    std::vector<FF> expected_values = { FF(648), FF(936), FF(432), FF(64) };
    EXPECT_EQ(perturbator.size(), 4); // log(instance_size) + 1
    for (size_t i = 0; i < perturbator.size(); i++) {
        EXPECT_EQ(perturbator[i], expected_values[i]);
    }
}

TEST_F(ProtoGalaxyTests, PerturbatorPolynomial)
{
    const size_t log_instance_size(3);
    const size_t instance_size(1 << log_instance_size);

    std::array<barretenberg::Polynomial<FF>, NUM_POLYNOMIALS> random_polynomials;
    for (auto& poly : random_polynomials) {
        poly = get_random_polynomial(instance_size);
    }
    auto full_polynomials = construct_ultra_full_polynomials(random_polynomials);
    auto relation_parameters = proof_system::RelationParameters<FF>::get_random();
    auto alpha = FF::random_element();

    auto full_honk_evals =
        ProtoGalaxyProver::compute_full_honk_evaluations(full_polynomials, alpha, relation_parameters);
    std::vector<FF> betas(log_instance_size);
    for (size_t idx = 0; idx < log_instance_size; idx++) {
        betas[idx] = FF::random_element();
    }

    // Construct pow(\vec{betas}) as in the paper
    auto pow_beta = ProtoGalaxyProver::compute_pow_polynomial_at_values(betas, instance_size);

    // Compute the corresponding target sum and create a dummy accumulator
    auto target_sum = FF(0);
    for (size_t i = 0; i < instance_size; i++) {
        target_sum += full_honk_evals[i] * pow_beta[i];
    }

    auto accumulator = std::make_shared<Instance>();
    accumulator->prover_polynomials = std::move(full_polynomials);
    accumulator->gate_challenges = betas;
    accumulator->target_sum = target_sum;
    accumulator->relation_parameters = relation_parameters;
    accumulator->alpha = alpha;

    auto deltas = ProtoGalaxyProver::compute_round_challenge_pows(log_instance_size, FF::random_element());
    auto perturbator = ProtoGalaxyProver::compute_perturbator(accumulator, deltas);

    // Ensure the constant coefficient of the perturbator is equal to the target sum as indicated by the paper
    EXPECT_EQ(perturbator[0], target_sum);
}

TEST_F(ProtoGalaxyTests, PowPolynomialsOnPowers)
{
    auto betas = std::vector<FF>{ 2, 4, 16 };
    auto pow_betas = ProtoGalaxyProver::compute_pow_polynomial_at_values(betas, 8);
    auto expected_values = std::vector<FF>{ 1, 2, 4, 8, 16, 32, 64, 128 };
    EXPECT_EQ(expected_values, pow_betas);
}

TEST_F(ProtoGalaxyTests, CombinerQuotient)
{
    auto compressed_perturbator = FF(2); // F(\alpha) in the paper
    auto combiner =
        barretenberg::Univariate<FF, 13>(std::array<FF, 13>{ 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32 });
    auto combiner_quotient = ProtoGalaxyProver::compute_combiner_quotient(compressed_perturbator, combiner);

    // K(i) = (G(i) - ( L_0(i) * F(\alpha)) / Z(i), i = {2,.., 13} for ProverInstances::NUM = 2
    // K(i) = (G(i) - (1 - i) * F(\alpha)) / i * (i - 1)
    auto expected_evals = barretenberg::Univariate<FF, 13, 2>(std::array<FF, 11>{
        (FF(22) - (FF(1) - FF(2)) * compressed_perturbator) / (FF(2) * FF(2 - 1)),
        (FF(23) - (FF(1) - FF(3)) * compressed_perturbator) / (FF(3) * FF(3 - 1)),
        (FF(24) - (FF(1) - FF(4)) * compressed_perturbator) / (FF(4) * FF(4 - 1)),
        (FF(25) - (FF(1) - FF(5)) * compressed_perturbator) / (FF(5) * FF(5 - 1)),
        (FF(26) - (FF(1) - FF(6)) * compressed_perturbator) / (FF(6) * FF(6 - 1)),
        (FF(27) - (FF(1) - FF(7)) * compressed_perturbator) / (FF(7) * FF(7 - 1)),
        (FF(28) - (FF(1) - FF(8)) * compressed_perturbator) / (FF(8) * FF(8 - 1)),
        (FF(29) - (FF(1) - FF(9)) * compressed_perturbator) / (FF(9) * FF(9 - 1)),
        (FF(30) - (FF(1) - FF(10)) * compressed_perturbator) / (FF(10) * FF(10 - 1)),
        (FF(31) - (FF(1) - FF(11)) * compressed_perturbator) / (FF(11) * FF(11 - 1)),
        (FF(32) - (FF(1) - FF(12)) * compressed_perturbator) / (FF(12) * FF(12 - 1)),
    });

    for (size_t idx = 2; idx < 7; idx++) {
        EXPECT_EQ(combiner_quotient.value_at(idx), expected_evals.value_at(idx));
    }
}

TEST_F(ProtoGalaxyTests, FoldChallenges)
{
    using Instances = ProverInstances_<Flavor, 2>;
    using Instance = typename Instances::Instance;

    Builder builder1;
    auto instance1 = std::make_shared<Instance>(builder1);
    instance1->relation_parameters.eta = 1;

    Builder builder2;
    builder2.add_variable(3);
    auto instance2 = std::make_shared<Instance>(builder2);
    instance2->relation_parameters.eta = 3;

    Instances instances{ { instance1, instance2 } };
    ProtoGalaxyProver::combine_relation_parameters(instances);

    Univariate<FF, 12> expected_eta{ { 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23 } };
    EXPECT_EQ(instances.relation_parameters.eta, expected_eta);
}

TEST_F(ProtoGalaxyTests, FoldAlpha)
{
    using Instances = ProverInstances_<Flavor, 2>;
    using Instance = typename Instances::Instance;

    Builder builder1;
    auto instance1 = std::make_shared<Instance>(builder1);
    instance1->alpha = 2;

    Builder builder2;
    builder2.add_variable(3);
    auto instance2 = std::make_shared<Instance>(builder2);
    instance2->alpha = 4;

    Instances instances{ { instance1, instance2 } };
    ProtoGalaxyProver::combine_alpha(instances);

    Univariate<FF, 13> expected_alpha{ { 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26 } };
    EXPECT_EQ(instances.alpha, expected_alpha);
}

TEST_F(ProtoGalaxyTests, FoldAlphaShouldBeZero)
{
    using Instances = ProverInstances_<Flavor, 2>;
    using Instance = typename Instances::Instance;

    Builder builder1;
    auto instance1 = std::make_shared<Instance>(builder1);
    instance1->alpha = FF(0);

    Builder builder2;
    builder2.add_variable(3);
    auto instance2 = std::make_shared<Instance>(builder2);
    instance2->alpha = FF(0);

    Instances instances{ { instance1, instance2 } };
    ProtoGalaxyProver::combine_alpha(instances);

    Univariate<FF, 13> expected_alpha{ { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 } };
    auto challenge = FF::random_element();
    EXPECT_EQ(instances.alpha, expected_alpha);
    EXPECT_EQ(instances.alpha.evaluate(challenge), FF(0));
}

TEST_F(ProtoGalaxyTests, FirstIteration)
{
    const size_t log_instance_size(4);
    const size_t instance_size(1 << log_instance_size);

    auto composer = UltraComposer();

    auto builder_1 = typename Flavor::CircuitBuilder();
    builder_1.add_public_variable(FF(1));

    auto instance_1 = composer.create_instance(builder_1);

    auto builder_2 = typename Flavor::CircuitBuilder();
    builder_2.add_public_variable(FF(1));

    auto instance_2 = composer.create_instance(builder_2);

    auto commitment_key = composer.commitment_key;

    auto instances = std::vector<std::shared_ptr<Instance>>{ instance_1, instance_2 };
    auto folding_prover = composer.create_folding_prover(instances, composer.commitment_key);
    auto folding_verifier = composer.create_folding_verifier();

    auto proof = folding_prover.fold_instances();
    auto next_accumulator = proof.accumulator;
    next_accumulator->is_accumulator = true;
    auto res = folding_verifier.verify_folding_proof(proof.folding_data);
    EXPECT_EQ(res, true);
    auto next_honk_evals = ProtoGalaxyProver::compute_full_honk_evaluations(
        next_accumulator->prover_polynomials, next_accumulator->alpha, next_accumulator->relation_parameters);
    // Construct pow(\vec{betas*}) as in the paper
    auto next_pow_beta =
        ProtoGalaxyProver::compute_pow_polynomial_at_values(next_accumulator->gate_challenges, instance_size);

    // Compute the corresponding target sum and create a dummy accumulator
    auto next_target_sum = FF(0);
    for (size_t i = 0; i < instance_size; i++) {
        next_target_sum += next_honk_evals[i] * next_pow_beta[i];
    }
    info("e* ", next_target_sum);

    EXPECT_EQ(next_accumulator->target_sum, next_target_sum);

    auto builder_3 = typename Flavor::CircuitBuilder();
    builder_3.add_public_variable(FF(1));
    auto instance_3 = composer.create_instance(builder_3);
    instances = std::vector<std::shared_ptr<Instance>>{ next_accumulator, instance_3 };

    folding_prover = composer.create_folding_prover(instances, composer.commitment_key);
    folding_verifier = composer.create_folding_verifier();

    proof = folding_prover.fold_instances();
    auto acc = proof.accumulator;
    acc->is_accumulator = true;

    res = folding_verifier.verify_folding_proof(proof.folding_data);
    EXPECT_EQ(res, true);

    next_honk_evals =
        ProtoGalaxyProver::compute_full_honk_evaluations(acc->prover_polynomials, acc->alpha, acc->relation_parameters);
    // Construct pow(\vec{betas*}) as in the paper
    next_pow_beta = ProtoGalaxyProver::compute_pow_polynomial_at_values(acc->gate_challenges, instance_size);

    // Compute the corresponding target sum and create a dummy accumulator
    next_target_sum = FF(0);
    for (size_t i = 0; i < instance_size; i++) {
        next_target_sum += next_honk_evals[i] * next_pow_beta[i];
    }
    info("e* ", next_target_sum);

    EXPECT_EQ(acc->target_sum, next_target_sum);
    auto decider_prover = composer.create_decider_prover(acc, commitment_key);
    auto decider_verifier = composer.create_decider_verifier(acc);
    auto decision = decider_prover.construct_proof();
    auto verified = decider_verifier.verify_proof(decision);
    EXPECT_EQ(verified, true);
}

// TODO(https://github.com/AztecProtocol/barretenberg/issues/807): Have proper full folding testing (both failing and
// passing) and move creating a test accumulator in a separate function.
TEST_F(ProtoGalaxyTests, ComputeNewAccumulator)
{
    const size_t log_instance_size(4);
    const size_t instance_size(1 << log_instance_size);

    auto builder = typename Flavor::CircuitBuilder();
    auto composer = UltraComposer();
    builder.add_public_variable(FF(1));

    auto instance = composer.create_instance(builder);
    auto commitment_key = composer.commitment_key;

    std::array<barretenberg::Polynomial<FF>, NUM_POLYNOMIALS> random_polynomials;
    for (auto& poly : random_polynomials) {
        poly = get_random_polynomial(instance_size);
    }
    for (auto& poly : random_polynomials) {
        poly[0] = FF::zero();
    }
    ProverPolynomials polynomials;
    auto poly_views = polynomials.get_all();
    for (size_t idx = 0; idx < poly_views.size(); idx++) {
        poly_views[idx] = random_polynomials[idx];
    }
    auto relation_parameters = proof_system::RelationParameters<FF>::get_random();

    auto alpha = FF::random_element();

    auto full_honk_evals = ProtoGalaxyProver::compute_full_honk_evaluations(polynomials, alpha, relation_parameters);
    std::vector<FF> betas(log_instance_size);
    for (size_t idx = 0; idx < log_instance_size; idx++) {
        betas[idx] = FF::random_element();
    }

    // Construct pow(\vec{betas}) as in the paper
    auto pow_beta = ProtoGalaxyProver::compute_pow_polynomial_at_values(betas, instance_size);
    // Compute the corresponding target sum and create a dummy accumulator
    auto target_sum = FF(0);
    for (size_t i = 0; i < instance_size; i++) {
        target_sum += full_honk_evals[i] * pow_beta[i];
    }

    auto accumulator = std::make_shared<Instance>();
    accumulator->prover_polynomials = std::move(polynomials);
    auto witness_poly = polynomials.get_witness();
    size_t idx = 0;
    for (auto& comm : accumulator->witness_commitments.get_all()) {
        comm = commitment_key->commit(witness_poly[idx]);
        idx++;
    }

    idx = 0;
    auto selector_poly = polynomials.get_precomputed();
    accumulator->verification_key = std::make_shared<typename Flavor::VerificationKey>(instance_size, 1);
    for (auto& vk : accumulator->verification_key->get_all()) {
        vk = commitment_key->commit(selector_poly[idx]);
        idx++;
    }
    accumulator->instance_size = instance_size;
    accumulator->log_instance_size = log_instance_size;
    accumulator->gate_challenges = betas;
    accumulator->target_sum = target_sum;
    accumulator->relation_parameters = relation_parameters;
    accumulator->alpha = alpha;
    accumulator->is_accumulator = true;
    accumulator->public_inputs = std::vector<FF>{ FF::random_element() };

    auto instances = std::vector<std::shared_ptr<Instance>>{ accumulator, instance };
    auto folding_prover = composer.create_folding_prover(instances, composer.commitment_key);
    auto folding_verifier = composer.create_folding_verifier();

    auto proof = folding_prover.fold_instances();
    auto next_accumulator = proof.accumulator;
    // auto res = folding_verifier.verify_folding_proof(proof.folding_data);
    // EXPECT_EQ(res, true);
    // i got omega* \vec{\beta*} e*
    // i want to check that \sum_i ∈ {0, n} pow_i(\vec{\beta*}) * f_i(\omega*) = e*
    auto next_honk_evals = ProtoGalaxyProver::compute_full_honk_evaluations(
        next_accumulator->prover_polynomials, next_accumulator->alpha, next_accumulator->relation_parameters);
    // Construct pow(\vec{betas*}) as in the paper
    auto next_pow_beta =
        ProtoGalaxyProver::compute_pow_polynomial_at_values(next_accumulator->gate_challenges, instance_size);

    // Compute the corresponding target sum and create a dummy accumulator
    auto next_target_sum = FF(0);
    for (size_t i = 0; i < instance_size; i++) {
        next_target_sum += next_honk_evals[i] * next_pow_beta[i];
    }
    info("e* ", next_target_sum);

    // for (size_t i = 0; i < log_instance_size; i++) {
    //     EXPECT_EQ(accumulator->gate_challenges[i], next_accumulator->gate_challenges[i]);
    // }
    // EXPECT_EQ(next_pow_beta, pow_beta);

    EXPECT_EQ(next_accumulator->target_sum, next_target_sum);
    // auto decider_prover = composer.create_decider_prover(next_accumulator);
    // auto decider_verifier = composer.create_decider_verifier(next_accumulator);
    // auto decision = decider_prover.construct_proof();
    // auto verified = decider_verifier.verify_proof(decision);
    // EXPECT_EQ(verified, true);
}

TEST_F(ProtoGalaxyTests, DecideDummyAccumulator)
{
    const size_t log_instance_size(4);
    const size_t instance_size(1 << log_instance_size);
    auto composer = UltraComposer();
    auto commitment_key = composer.compute_commitment_key(instance_size);

    std::array<barretenberg::Polynomial<FF>, NUM_POLYNOMIALS> random_polynomials;
    for (auto& poly : random_polynomials) {
        poly = get_random_polynomial(instance_size);
    }

    for (auto& poly : random_polynomials) {
        poly[0] = FF::zero();
    }
    ProverPolynomials polynomials;
    auto poly_views = polynomials.get_all();
    for (size_t idx = 0; idx < poly_views.size(); idx++) {
        poly_views[idx] = random_polynomials[idx];
    }
    auto relation_parameters = proof_system::RelationParameters<FF>::get_random();
    auto alpha = FF::zero();

    auto full_honk_evals = ProtoGalaxyProver::compute_full_honk_evaluations(polynomials, alpha, relation_parameters);
    std::vector<FF> betas(log_instance_size);
    for (size_t idx = 0; idx < log_instance_size; idx++) {
        betas[idx] = FF::random_element();
    }

    // Construct pow(\vec{betas}) as in the paper
    auto pow_beta = ProtoGalaxyProver::compute_pow_polynomial_at_values(betas, instance_size);

    // Compute the corresponding target sum and create a dummy accumulator
    auto target_sum = FF(0);
    for (size_t i = 0; i < instance_size; i++) {
        target_sum += full_honk_evals[i] * pow_beta[i];
    }
    auto accumulator = std::make_shared<Instance>();
    accumulator->prover_polynomials = std::move(polynomials);
    auto witness_poly = polynomials.get_witness();
    size_t idx = 0;
    for (auto& comm : accumulator->witness_commitments.get_all()) {
        comm = commitment_key->commit(witness_poly[idx]);
        idx++;
    }

    idx = 0;
    auto selector_poly = polynomials.get_precomputed();
    accumulator->verification_key = std::make_shared<typename Flavor::VerificationKey>(instance_size, 1);
    for (auto& vk : accumulator->verification_key->get_all()) {
        vk = commitment_key->commit(selector_poly[idx]);
        idx++;
    }

    accumulator->instance_size = instance_size;
    accumulator->log_instance_size = log_instance_size;
    accumulator->gate_challenges = betas;
    accumulator->target_sum = target_sum;
    accumulator->relation_parameters = relation_parameters;
    accumulator->alpha = alpha;
    accumulator->is_accumulator = true;
    accumulator->public_inputs = std::vector<FF>{ FF::random_element() };

    auto decider_prover = composer.create_decider_prover(accumulator, commitment_key);
    auto decider_verifier = composer.create_decider_verifier(accumulator);
    auto decision = decider_prover.construct_proof();
    auto verified = decider_verifier.verify_proof(decision);
    EXPECT_EQ(verified, true);
}

} // namespace protogalaxy_tests