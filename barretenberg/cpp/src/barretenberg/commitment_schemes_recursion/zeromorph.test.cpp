#include "barretenberg/commitment_schemes/zeromorph/zeromorph.test.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/honk_recursion/transcript/transcript.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;
using Builder = UltraCircuitBuilder;
// using Builder = CircuitSimulatorBN254;
using PCSTypes = ::testing::Types<KZG<stdlib::bn254<Builder>>, IPA<stdlib::grumpkin<Builder>>>;
TYPED_TEST_SUITE(ZeroMorphTest, PCSTypes);
TYPED_TEST_SUITE(ZeroMorphWithConcatenationTest, PCSTypes);

numeric::RNG& engine = numeric::get_debug_randomness();

/**
 * @brief Test method for computing q_k given multilinear f
 * @details Given f = f(X_0, ..., X_{d-1}), and (u,v) such that f(u) = v, compute q_k = q_k(X_0, ..., X_{k-1}) such that
 * the following identity holds:
 *
 *  f(X_0, ..., X_{d-1}) - v = \sum_{k=0}^{d-1} (X_k - u_k)q_k(X_0, ..., X_{k-1})
 *
 */
TYPED_TEST(ZeroMorphTest, QuotientConstruction)
{
    // Define some useful type aliases
    using Curve = typename TypeParam::Curve;
    using NativeCurve = typename Curve::NativeCurve;
    using NativePCS = std::conditional_t<std::same_as<NativeCurve, curve::BN254>, KZG<NativeCurve>, IPA<NativeCurve>>;
    using ZeroMorphProver = ZeroMorphProver_<NativePCS>;
    using Fr = typename Curve::NativeCurve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    // Define size parameters
    size_t N = 16;
    size_t log_N = numeric::get_msb(N);

    // Construct a random multilinear polynomial f, and (u,v) such that f(u) = v.
    Polynomial multilinear_f = this->random_polynomial(N);
    std::vector<Fr> u_challenge = this->random_evaluation_point(log_N);
    Fr v_evaluation = multilinear_f.evaluate_mle(u_challenge);

    // Compute the multilinear quotients q_k = q_k(X_0, ..., X_{k-1})
    std::vector<Polynomial> quotients = ZeroMorphProver::compute_multilinear_quotients(multilinear_f, u_challenge);

    // Show that the q_k were properly constructed by showing that the identity holds at a random multilinear challenge
    // z, i.e. f(z) - v - \sum_{k=0}^{d-1} (z_k - u_k)q_k(z) = 0
    std::vector<Fr> z_challenge = this->random_evaluation_point(log_N);

    Fr result = multilinear_f.evaluate_mle(z_challenge);
    result -= v_evaluation;
    for (size_t k = 0; k < log_N; ++k) {
        auto q_k_eval = Fr(0);
        if (k == 0) {
            // q_0 = a_0 is a constant polynomial so it's evaluation is simply its constant coefficient
            q_k_eval = quotients[k][0];
        } else {
            // Construct (u_0, ..., u_{k-1})
            auto subrange_size = static_cast<std::ptrdiff_t>(k);
            std::vector<Fr> z_partial(z_challenge.begin(), z_challenge.begin() + subrange_size);
            q_k_eval = quotients[k].evaluate_mle(z_partial);
        }
        // result = result - (z_k - u_k) * q_k(u_0, ..., u_{k-1})
        result -= (z_challenge[k] - u_challenge[k]) * q_k_eval;
    }

    EXPECT_EQ(result, 0);
}

/**
 * @brief Test function for constructing batched lifted degree quotient \hat{q}
 *
 */
TYPED_TEST(ZeroMorphTest, BatchedLiftedDegreeQuotient)
{
    using Curve = typename TypeParam::Curve;
    using NativeCurve = typename Curve::NativeCurve;
    using NativePCS = std::conditional_t<std::same_as<NativeCurve, curve::BN254>, KZG<NativeCurve>, IPA<NativeCurve>>;
    using ZeroMorphProver = ZeroMorphProver_<NativePCS>;
    using Fr = typename Curve::NativeCurve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    constexpr size_t N = 8;

    // Define some mock q_k with deg(q_k) = 2^k - 1
    std::vector<Fr> data_0 = { 1 };
    std::vector<Fr> data_1 = { 2, 3 };
    std::vector<Fr> data_2 = { 4, 5, 6, 7 };
    Polynomial q_0(data_0);
    Polynomial q_1(data_1);
    Polynomial q_2(data_2);
    std::vector<Polynomial> quotients = { q_0, q_1, q_2 };

    auto y_challenge = Fr::random_element();

    // Compute batched quotient \hat{q} using the prover method
    auto batched_quotient = ZeroMorphProver::compute_batched_lifted_degree_quotient(quotients, y_challenge, N);

    // Now explicitly define q_k_lifted = X^{N-2^k} * q_k and compute the expected batched result
    std::array<Fr, N> data_0_lifted = { 0, 0, 0, 0, 0, 0, 0, 1 };
    std::array<Fr, N> data_1_lifted = { 0, 0, 0, 0, 0, 0, 2, 3 };
    std::array<Fr, N> data_2_lifted = { 0, 0, 0, 0, 4, 5, 6, 7 };
    Polynomial q_0_lifted(data_0_lifted);
    Polynomial q_1_lifted(data_1_lifted);
    Polynomial q_2_lifted(data_2_lifted);

    // Explicitly compute \hat{q}
    auto batched_quotient_expected = Polynomial(N);
    batched_quotient_expected += q_0_lifted;
    batched_quotient_expected.add_scaled(q_1_lifted, y_challenge);
    batched_quotient_expected.add_scaled(q_2_lifted, y_challenge * y_challenge);

    EXPECT_EQ(batched_quotient, batched_quotient_expected);
}

/**
 * @brief Test function for constructing partially evaluated quotient \zeta_x
 *
 */
TYPED_TEST(ZeroMorphTest, PartiallyEvaluatedQuotientZeta)
{
    // Define some useful type aliases
    using Curve = typename TypeParam::Curve;
    using NativeCurve = typename Curve::NativeCurve;
    using NativePCS = std::conditional_t<std::same_as<NativeCurve, curve::BN254>, KZG<NativeCurve>, IPA<NativeCurve>>;
    using ZeroMorphProver = ZeroMorphProver_<NativePCS>;
    using Fr = typename Curve::NativeCurve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

    constexpr size_t N = 8;

    // Define some mock q_k with deg(q_k) = 2^k - 1
    std::vector<Fr> data_0 = { 1 };
    std::vector<Fr> data_1 = { 2, 3 };
    std::vector<Fr> data_2 = { 4, 5, 6, 7 };
    Polynomial q_0(data_0);
    Polynomial q_1(data_1);
    Polynomial q_2(data_2);
    std::vector<Polynomial> quotients = { q_0, q_1, q_2 };

    auto y_challenge = Fr::random_element();

    auto batched_quotient = ZeroMorphProver::compute_batched_lifted_degree_quotient(quotients, y_challenge, N);

    auto x_challenge = Fr::random_element();

    // Contruct zeta_x using the prover method
    auto zeta_x = ZeroMorphProver::compute_partially_evaluated_degree_check_polynomial(
        batched_quotient, quotients, y_challenge, x_challenge);

    // Now construct zeta_x explicitly
    auto zeta_x_expected = Polynomial(N);
    zeta_x_expected += batched_quotient;
    // q_batched - \sum_k q_k * y^k * x^{N - deg(q_k) - 1}
    zeta_x_expected.add_scaled(q_0, -x_challenge.pow(N - 0 - 1));
    zeta_x_expected.add_scaled(q_1, -y_challenge * x_challenge.pow(N - 1 - 1));
    zeta_x_expected.add_scaled(q_2, -y_challenge * y_challenge * x_challenge.pow(N - 3 - 1));

    EXPECT_EQ(zeta_x, zeta_x_expected);
}

/**
 * @brief Demonstrate formulas for efficiently computing \Phi_k(x) = \sum_{i=0}^{k-1}x^i
 * @details \Phi_k(x) = \sum_{i=0}^{k-1}x^i = (x^{2^k} - 1) / (x - 1)
 *
 */
TYPED_TEST(ZeroMorphTest, PhiEvaluation)
{
    using Curve = typename TypeParam::Curve;
    using Builder = typename Curve::Builder;
    using Fr = typename Curve::ScalarField;
    using NativeFr = typename Curve::NativeCurve::ScalarField;

    constexpr size_t N = 8;
    constexpr size_t n = numeric::get_msb(N);

    // \Phi_n(x)
    {
        Builder builder;
        Fr x_challenge(&builder, NativeFr::random_element());
        auto efficient = (x_challenge.pow(1 << n) - 1) / (x_challenge - 1);
        auto expected = this->Phi(x_challenge, n);
        EXPECT_TRUE((efficient == expected).get_value());
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    // \Phi_{n-k-1}(x^{2^{k + 1}}) = (x^{2^n} - 1) / (x^{2^{k + 1}} - 1)
    {
        Builder builder;
        Fr x_challenge(&builder, NativeFr::random_element());
        constexpr size_t k = 2;

        // x^{2^{k+1}}
        auto x_pow = x_challenge.pow(1 << (k + 1));
        auto efficient = x_challenge.pow(1 << n) - 1; // x^N - 1
        efficient = efficient / (x_pow - 1);          // (x^N - 1) / (x^{2^{k + 1}} - 1)
        auto expected = this->Phi(x_pow, n - k - 1);
        EXPECT_TRUE((efficient == expected).get_value());
        EXPECT_TRUE(CircuitChecker::check(builder));
    }
}

// /**
//  * @brief Test function for constructing partially evaluated quotient Z_x
//  *
//  */
// TYPED_TEST(ZeroMorphTest, PartiallyEvaluatedQuotientZ)
// {
//     using Curve = typename TypeParam::Curve;
//     using Builder = typename Curve::Builder;
//     using Fr = typename Curve::ScalarField;
//     using NativeFr = typename Curve::NativeCurve::ScalarField;

//     constexpr size_t N = 8;
//     constexpr size_t log_N = numeric::get_msb(N);

//     // Construct a random multilinear polynomial f, and (u,v) such that f(u) = v.
//     Polynomial multilinear_f = this->random_polynomial(N);
//     Polynomial multilinear_g = this->random_polynomial(N);
//     multilinear_g[0] = 0;
//     std::vector<Fr> u_challenge = this->random_evaluation_point(log_N);
//     Fr v_evaluation = multilinear_f.evaluate_mle(u_challenge);
//     Fr w_evaluation = multilinear_g.evaluate_mle(u_challenge, /* shift = */ true);

//     auto rho = Fr::random_element();

//     // compute batched polynomial and evaluation
//     auto f_batched = multilinear_f;
//     auto g_batched = multilinear_g;
//     g_batched *= rho;
//     auto v_batched = v_evaluation + rho * w_evaluation;

//     // Define some mock q_k with deg(q_k) = 2^k - 1
//     auto q_0 = this->random_polynomial(1 << 0);
//     auto q_1 = this->random_polynomial(1 << 1);
//     auto q_2 = this->random_polynomial(1 << 2);
//     std::vector<Polynomial> quotients = { q_0, q_1, q_2 };

//     auto x_challenge = Fr::random_element();

//     // Construct Z_x using the prover method
//     auto Z_x = ZeroMorphProver::compute_partially_evaluated_zeromorph_identity_polynomial(
//         f_batched, g_batched, quotients, v_batched, u_challenge, x_challenge);

//     // Compute Z_x directly
//     auto Z_x_expected = g_batched;
//     Z_x_expected.add_scaled(f_batched, x_challenge);
//     Z_x_expected[0] -= v_batched * x_challenge * this->Phi(x_challenge, log_N);
//     for (size_t k = 0; k < log_N; ++k) {
//         auto x_pow_2k = x_challenge.pow(1 << k);         // x^{2^k}
//         auto x_pow_2kp1 = x_challenge.pow(1 << (k + 1)); // x^{2^{k+1}}
//         // x^{2^k} * \Phi_{n-k-1}(x^{2^{k+1}}) - u_k *  \Phi_{n-k}(x^{2^k})
//         auto scalar = x_pow_2k * this->Phi(x_pow_2kp1, log_N - k - 1) - u_challenge[k] * this->Phi(x_pow_2k, log_N -
//         k); scalar *= x_challenge; scalar *= Fr(-1); Z_x_expected.add_scaled(quotients[k], scalar);
//     }

//     EXPECT_EQ(Z_x, Z_x_expected);
// }

/**
 * @brief Test full Prover/Verifier protocol for proving single multilinear evaluation
 *
 */
TEST(ZeroMorphRecursionTest, ProveAndVerifySingle)
{
    // Define some useful type aliases
    using Builder = UltraCircuitBuilder;
    using Curve = typename stdlib::bn254<Builder>;
    using Commitment = typename Curve::AffineElement;
    using NativeCommitment = typename Curve::AffineElementNative;
    using PCS = KZG<Curve>;
    using NativeCurve = typename Curve::NativeCurve;
    using NativePCS = std::conditional_t<std::same_as<NativeCurve, curve::BN254>, KZG<NativeCurve>, IPA<NativeCurve>>;
    using CommitmentKey = typename NativePCS::CK;
    using ZeroMorphProver = ZeroMorphProver_<NativePCS>;
    using Fr = typename Curve::ScalarField;
    using NativeFr = typename Curve::NativeCurve::ScalarField;
    using Polynomial = bb::Polynomial<NativeFr>;
    using ZeroMorphVerifier = ZeroMorphVerifier_<PCS>;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    using VerifierCommitmentKey = VerifierCommitmentKey<NativeCurve>;

    constexpr size_t N = 2;
    constexpr size_t NUM_UNSHIFTED = 1;
    constexpr size_t NUM_SHIFTED = 0;

    srs::init_crs_factory("../srs_db/ignition");

    std::vector<NativeFr> u_challenge = { NativeFr::random_element(&engine) };

    // Construct some random multilinear polynomials f_i and their evaluations v_i = f_i(u)
    std::vector<Polynomial> f_polynomials; // unshifted polynomials
    std::vector<NativeFr> v_evaluations;
    for (size_t i = 0; i < NUM_UNSHIFTED; ++i) {
        f_polynomials.emplace_back(Polynomial::random(N));
        f_polynomials[i][0] = NativeFr(0); // ensure f is "shiftable"
        v_evaluations.emplace_back(f_polynomials[i].evaluate_mle(u_challenge));
    }

    // Construct some "shifted" multilinear polynomials h_i as the left-shift-by-1 of f_i
    std::vector<Polynomial> g_polynomials; // to-be-shifted polynomials
    std::vector<Polynomial> h_polynomials; // shifts of the to-be-shifted polynomials
    std::vector<NativeFr> w_evaluations;
    for (size_t i = 0; i < NUM_SHIFTED; ++i) {
        g_polynomials.emplace_back(f_polynomials[i]);
        h_polynomials.emplace_back(g_polynomials[i].shifted());
        w_evaluations.emplace_back(h_polynomials[i].evaluate_mle(u_challenge));
        // ASSERT_EQ(w_evaluations[i], g_polynomials[i].evaluate_mle(u_challenge, /* shift = */ true));
    }

    // Compute commitments [f_i]
    std::vector<NativeCommitment> f_commitments;
    auto commitment_key = std::make_shared<CommitmentKey>(1024);
    for (size_t i = 0; i < NUM_UNSHIFTED; ++i) {
        f_commitments.emplace_back(commitment_key->commit(f_polynomials[i]));
    }

    // Construct container of commitments of the "to-be-shifted" polynomials [g_i] (= [f_i])
    std::vector<NativeCommitment> g_commitments;
    for (size_t i = 0; i < NUM_SHIFTED; ++i) {
        g_commitments.emplace_back(f_commitments[i]);
    }

    // Initialize an empty NativeTranscript
    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Execute Prover protocol
    // LONDONTODO: these tests need to be updated
    ZeroMorphProver::prove(N,
                           RefVector(f_polynomials),
                           RefVector(g_polynomials),
                           RefVector(v_evaluations),
                           RefVector(w_evaluations),
                           u_challenge,
                           commitment_key,
                           prover_transcript);

    Builder builder;
    StdlibProof<Builder> stdlib_proof = bb::convert_proof_to_witness(&builder, prover_transcript->proof_data);
    auto stdlib_verifier_transcript = std::make_shared<Transcript>(stdlib_proof);
    [[maybe_unused]] auto _ = stdlib_verifier_transcript->template receive_from_prover<Fr>("Init");

    // Execute Verifier protocol without the need for vk prior the final check
    const auto commitments_to_witnesses = [&builder](const auto& commitments) {
        std::vector<Commitment> commitments_in_biggroup(commitments.size());
        std::transform(commitments.begin(),
                       commitments.end(),
                       commitments_in_biggroup.begin(),
                       [&builder](const auto& native_commitment) {
                           return Commitment::from_witness(&builder, native_commitment);
                       });
        return commitments_in_biggroup;
    };
    const auto elements_to_witness_ref_vector = [&](const auto& elements) {
        std::vector<Fr> elements_in_circuit(elements.size());
        std::transform(elements.begin(),
                       elements.end(),
                       elements_in_circuit.begin(),
                       [&builder](const auto& native_element) { return Fr::from_witness(&builder, native_element); });
        return elements_in_circuit;
    };
    auto stdlib_f_commitments = commitments_to_witnesses(f_commitments);
    auto stdlib_g_commitments = commitments_to_witnesses(g_commitments);
    auto stdlib_v_evaluations = elements_to_witness_ref_vector(v_evaluations);
    auto stdlib_w_evaluations = elements_to_witness_ref_vector(w_evaluations);

    const size_t MAX_LOG_CIRCUIT_SIZE = 28;
    std::vector<Fr> u_challenge_in_circuit(MAX_LOG_CIRCUIT_SIZE);
    std::fill_n(u_challenge_in_circuit.begin(), MAX_LOG_CIRCUIT_SIZE, Fr::from_witness(&builder, 0));
    u_challenge_in_circuit[MAX_LOG_CIRCUIT_SIZE - 1] = Fr(&builder, u_challenge[0]);

    [[maybe_unused]] auto result = ZeroMorphVerifier::verify(Fr::from_witness(&builder, N),
                                                             RefVector(stdlib_f_commitments), // unshifted
                                                             RefVector(stdlib_g_commitments), // to-be-shifted
                                                             RefVector(stdlib_v_evaluations), // unshifted
                                                             RefVector(stdlib_w_evaluations), // shifted
                                                             u_challenge_in_circuit,
                                                             stdlib_verifier_transcript,
                                                             {},
                                                             {});
    EXPECT_TRUE(CircuitChecker::check(builder));

    auto verifier_commitment_key = std::make_shared<VerifierCommitmentKey>();
    bool verified = verifier_commitment_key->pairing_check(result[0].get_value(), result[1].get_value());
    EXPECT_TRUE(verified);
}

// /**
//  * @brief Test full Prover/Verifier protocol for proving single multilinear evaluation
//  *
//  */
// TEST(ZeroMorphTest, ProveAndVerifySingle)
// {
//     constexpr size_t num_unshifted = 1;
//     constexpr size_t num_shifted = 0;
//     auto verified = this->execute_zeromorph_protocol(num_unshifted, num_shifted);
//     EXPECT_TRUE(verified);
// }

// /**
//  * @brief Test full Prover/Verifier protocol for proving batched multilinear evaluation with shifts
//  *
//  */
// TYPED_TEST(ZeroMorphTest, ProveAndVerifyBatchedWithShifts)
// {
//     size_t num_unshifted = 3;
//     size_t num_shifted = 2;
//     auto verified = this->execute_zeromorph_protocol(num_unshifted, num_shifted);
//     EXPECT_TRUE(verified);
// }

// /**
//  * @brief Test full Prover/Verifier protocol for proving single multilinear evaluation
//  *
//  */
// TYPED_TEST(ZeroMorphWithConcatenationTest, ProveAndVerify)
// {
//     size_t num_unshifted = 1;
//     size_t num_shifted = 0;
//     size_t num_concatenated = 3;
//     auto verified = this->execute_zeromorph_protocol(num_unshifted, num_shifted, num_concatenated);
//     EXPECT_TRUE(verified);
// }