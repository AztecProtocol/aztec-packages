#include "barretenberg/stdlib/eccvm_verifier/eccvm_recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include <gtest/gtest.h>

namespace {
auto& engine = bb::numeric::get_debug_randomness();
}
namespace bb {
template <typename RecursiveFlavor> class ECCVMRecursiveTests : public ::testing::Test {
  public:
    using InnerFlavor = typename RecursiveFlavor::NativeFlavor;
    using InnerBuilder = typename InnerFlavor::CircuitBuilder;
    using InnerProver = ECCVMProver;
    using InnerVerifier = ECCVMVerifier;
    using InnerG1 = InnerFlavor::Commitment;
    using InnerFF = InnerFlavor::FF;
    using InnerBF = InnerFlavor::BF;

    using Transcript = InnerFlavor::Transcript;

    using RecursiveVerifier = ECCVMRecursiveVerifier_<RecursiveFlavor>;

    using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;
    using OuterFlavor = std::conditional_t<IsMegaBuilder<OuterBuilder>, MegaFlavor, UltraFlavor>;
    using RecursiveTranscript = typename RecursiveVerifier::Transcript;
    using OuterProver = UltraProver_<OuterFlavor>;
    using OuterVerifier = UltraVerifier_<OuterFlavor>;
    using OuterDeciderProvingKey = DeciderProvingKey_<OuterFlavor>;
    static void SetUpTestSuite()
    {
        srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
        bb::srs::init_crs_factory("../srs_db/ignition");
    }

    /**
     * @brief Adds operations in BN254 to the op_queue and then constructs and ECCVM circuit from the op_queue.
     *
     * @param engine
     * @return ECCVMCircuitBuilder
     */
    static InnerBuilder generate_circuit(numeric::RNG* engine = nullptr)
    {
        using Curve = curve::BN254;
        using G1 = Curve::Element;
        using Fr = Curve::ScalarField;

        std::shared_ptr<ECCOpQueue> op_queue = std::make_shared<ECCOpQueue>();
        G1 a = G1::random_element(engine);
        G1 b = G1::random_element(engine);
        G1 c = G1::random_element(engine);
        Fr x = Fr::random_element(engine);
        Fr y = Fr::random_element(engine);

        op_queue->add_accumulate(a);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(b, x);
        op_queue->mul_accumulate(b, y);
        op_queue->add_accumulate(a);
        op_queue->mul_accumulate(b, x);
        op_queue->eq_and_reset();
        op_queue->add_accumulate(c);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(b, x);
        op_queue->eq_and_reset();
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(b, x);
        op_queue->mul_accumulate(c, x);
        InnerBuilder builder{ op_queue };
        return builder;
    }

    static void test_recursive_verification()
    {
        InnerBuilder builder = generate_circuit(&engine);
        InnerProver prover(builder);
        auto proof = prover.construct_proof();
        auto verification_key = std::make_shared<typename InnerFlavor::VerificationKey>(prover.key);

        info("ECCVM Recursive Verifier");
        OuterBuilder outer_circuit;
        RecursiveVerifier verifier{ &outer_circuit, verification_key };
        verifier.verify_proof(proof);
        info("Recursive Verifier: num gates = ", outer_circuit.num_gates);

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(outer_circuit.failed(), false) << outer_circuit.err();

        bool result = CircuitChecker::check(outer_circuit);
        EXPECT_TRUE(result);

        InnerVerifier native_verifier(prover.key);
        bool native_result = native_verifier.verify_proof(proof);
        EXPECT_TRUE(native_result);

        auto recursive_manifest = verifier.transcript->get_manifest();
        auto native_manifest = native_verifier.transcript->get_manifest();
        for (size_t i = 0; i < recursive_manifest.size(); ++i) {
            EXPECT_EQ(recursive_manifest[i], native_manifest[i])
                << "Recursive Verifier/Verifier manifest discrepency in round " << i;
        }

        // Ensure verification key is the same
        EXPECT_EQ(verifier.key->circuit_size, verification_key->circuit_size);
        EXPECT_EQ(verifier.key->log_circuit_size, verification_key->log_circuit_size);
        EXPECT_EQ(verifier.key->num_public_inputs, verification_key->num_public_inputs);
        for (auto [vk_poly, native_vk_poly] : zip_view(verifier.key->get_all(), verification_key->get_all())) {
            EXPECT_EQ(vk_poly.get_value(), native_vk_poly);
        }

        // Construct a full proof from the recursive verifier circuit
        {
            auto proving_key = std::make_shared<OuterDeciderProvingKey>(outer_circuit);
            OuterProver prover(proving_key);
            auto verification_key = std::make_shared<typename OuterFlavor::VerificationKey>(proving_key->proving_key);
            OuterVerifier verifier(verification_key);
            auto proof = prover.construct_proof();
            bool verified = verifier.verify_proof(proof);

            ASSERT(verified);
        }
    }

    static void test_recursive_verification_failure()
    {
        InnerBuilder builder = generate_circuit(&engine);
        builder.op_queue->add_erroneous_equality_op_for_testing();
        InnerProver prover(builder);
        auto proof = prover.construct_proof();
        auto verification_key = std::make_shared<typename InnerFlavor::VerificationKey>(prover.key);

        OuterBuilder outer_circuit;
        RecursiveVerifier verifier{ &outer_circuit, verification_key };
        verifier.verify_proof(proof);
        info("Recursive Verifier: num gates = ", outer_circuit.num_gates);

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(outer_circuit.failed(), true) << outer_circuit.err();
    }
    static void test_full_relation_tags()
    {
        using ff_ct = typename RecursiveFlavor::FF;
        using Fr = typename InnerFlavor::BF;
        using CommitmentLabels = typename RecursiveFlavor::CommitmentLabels;
        HonkProof proof;
        proof.insert(proof.begin(), 300, Fr(0));
        typename RecursiveFlavor::AllValues evaluations;
        RelationParameters<ff_ct> relation_parameters;
        CommitmentLabels commitment_labels;
        OuterBuilder builder;
        StdlibProof<OuterBuilder> stdlib_proof = bb::convert_proof_to_witness(&builder, proof);
        auto transcript = std::make_shared<RecursiveTranscript>(stdlib_proof);
        for (auto [element, label] : zip_view(evaluations.get_wires(), commitment_labels.get_wires())) {
            element = transcript->template receive_from_prover<ff_ct>(label);

            info(label, " tags:", element.get_origin_tag().child_tag);
        }
        // Get challenge for sorted list batching and wire four memory records
        auto [beta, gamma] = transcript->template get_challenges<ff_ct>("beta", "gamma");

        auto beta_sqr = beta * beta;

        relation_parameters.gamma = gamma;
        relation_parameters.beta = beta;
        relation_parameters.beta_sqr = beta * beta;
        relation_parameters.beta_cube = beta_sqr * beta;
        relation_parameters.eccvm_set_permutation_delta =
            gamma * (gamma + beta_sqr) * (gamma + beta_sqr + beta_sqr) * (gamma + beta_sqr + beta_sqr + beta_sqr);
        relation_parameters.eccvm_set_permutation_delta = relation_parameters.eccvm_set_permutation_delta.invert();

        // Get commitment to permutation and lookup grand products
        evaluations.lookup_inverses =
            transcript->template receive_from_prover<ff_ct>(commitment_labels.lookup_inverses);
        info(commitment_labels.lookup_inverses, "tags: ", evaluations.lookup_inverses.get_origin_tag().child_tag);
        evaluations.z_perm = transcript->template receive_from_prover<ff_ct>(commitment_labels.z_perm);
        info(commitment_labels.z_perm, "tags: ", evaluations.z_perm.get_origin_tag().child_tag);

        for (auto [element, shifted_element] : zip_view(evaluations.get_to_be_shifted(), evaluations.get_shifted())) {
            shifted_element = element;
        }
        ff_ct alpha = transcript->template get_challenge<ff_ct>("Sumcheck:alpha");

        ff_ct pow_evaluation = transcript->template get_challenge<ff_ct>("Sumcheck:gate_challenge");
        ff_ct libra_evaluation = transcript->template receive_from_prover<ff_ct>("libra_evaluation");

        // auto sumcheck = SumcheckVerifier<RecursiveFlavor>(log_circuit_size, transcript, ff_ct(0));
        SumcheckVerifierRound<RecursiveFlavor> round;
        std::vector temp = { ff_ct(0) };
        PowPolynomial<ff_ct> pow_polynomial(temp);
        pow_polynomial.partial_evaluation_result = pow_evaluation;
        round.compute_full_honk_relation_purported_value(
            evaluations, relation_parameters, pow_polynomial, alpha, libra_evaluation);
    }
};
using FlavorTypes = testing::Types<ECCVMRecursiveFlavor_<UltraCircuitBuilder>>;

TYPED_TEST_SUITE(ECCVMRecursiveTests, FlavorTypes);

TYPED_TEST(ECCVMRecursiveTests, SingleRecursiveVerification)
{
    TestFixture::test_recursive_verification();
};

TYPED_TEST(ECCVMRecursiveTests, SingleRecursiveVerificationFailure)
{
    TestFixture::test_recursive_verification_failure();
};

TYPED_TEST(ECCVMRecursiveTests, RelationTags)
{
    TestFixture::test_full_relation_tags();
};

} // namespace bb