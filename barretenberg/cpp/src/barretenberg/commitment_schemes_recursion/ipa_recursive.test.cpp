
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/commitment_key.test.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/stdlib/eccvm_verifier/verifier_commitment_key.hpp"
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"

using namespace bb;

namespace {
using NativeCurve = curve::Grumpkin;
using Builder = UltraCircuitBuilder;
using Curve = stdlib::grumpkin<Builder>;

class IPARecursiveTests : public CommitmentTest<NativeCurve> {
  public:
    using Fr = typename NativeCurve::ScalarField;
    using GroupElement = typename NativeCurve::Element;
    using CK = CommitmentKey<NativeCurve>;
    using VK = VerifierCommitmentKey<NativeCurve>;
    using Polynomial = bb::Polynomial<Fr>;
    using Commitment = typename NativeCurve::AffineElement;

    using StdlibTranscript = bb::stdlib::recursion::honk::UltraStdlibTranscript;
    template <size_t log_poly_length>
    std::pair<std::shared_ptr<StdlibTranscript>, OpeningClaim<Curve>> create_ipa_claim(Builder& builder)
    {
        using NativeIPA = IPA<NativeCurve, log_poly_length>;
        static constexpr size_t poly_length = 1UL << log_poly_length;

        // First generate an ipa proof
        auto poly = Polynomial::random(poly_length);
        // Commit to a zero polynomial
        Commitment commitment = this->commit(poly);

        auto [x, eval] = this->random_eval(poly);
        const OpeningPair<NativeCurve> opening_pair = { x, eval };
        const OpeningClaim<NativeCurve> opening_claim{ opening_pair, commitment };

        // initialize empty prover transcript
        auto prover_transcript = std::make_shared<NativeTranscript>();
        NativeIPA::compute_opening_proof(this->ck(), { poly, opening_pair }, prover_transcript);

        // Export proof
        auto proof = prover_transcript->export_proof();

        // initialize verifier transcript from proof data
        auto verifier_transcript = std::make_shared<NativeTranscript>();
        verifier_transcript->load_proof(proof);

        auto result = NativeIPA::reduce_verify(this->vk(), opening_claim, verifier_transcript);
        EXPECT_TRUE(result);

        // Recursively verify the proof
        auto stdlib_comm = Curve::Group::from_witness(&builder, commitment);
        auto stdlib_x = Curve::ScalarField::from_witness(&builder, x);
        auto stdlib_eval = Curve::ScalarField::from_witness(&builder, eval);
        OpeningClaim<Curve> stdlib_opening_claim{ { stdlib_x, stdlib_eval }, stdlib_comm };

        // Construct stdlib verifier transcript
        auto recursive_verifier_transcript = std::make_shared<StdlibTranscript>();
        recursive_verifier_transcript->load_proof(bb::convert_native_proof_to_stdlib(&builder, proof));
        return { recursive_verifier_transcript, stdlib_opening_claim };
    }
    template <size_t log_poly_length> Builder build_ipa_recursive_verifier_circuit()
    {
        using RecursiveIPA = IPA<Curve, log_poly_length>;

        Builder builder;
        auto [stdlib_transcript, stdlib_claim] = create_ipa_claim<log_poly_length>(builder);

        RecursiveIPA::reduce_verify(stdlib_claim, stdlib_transcript);
        stdlib::recursion::PairingPoints<Builder>::add_default_to_public_inputs(builder);
        builder.finalize_circuit(/*ensure_nonzero=*/true);
        return builder;
    }

    /**
     * @brief Tests IPA recursion
     * @details Creates an IPA claim and then runs the recursive IPA verification and checks that the circuit is valid.
     * @param POLY_LENGTH
     */
    template <size_t poly_length> void test_recursive_ipa()
    {
        Builder builder(build_ipa_recursive_verifier_circuit<poly_length>());
        info("IPA Recursive Verifier num finalized gates = ", builder.get_num_finalized_gates());
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    /**
     * @brief Tests IPA accumulation by accumulating two IPA claims and proving the accumulated claim
     * @details Creates two IPA claims, and then two IPA accumulators through recursive verification. Proves the
     * accumulated claim and checks that it verifies.
     * @param POLY_LENGTH
     */
    template <size_t poly_length> void test_accumulation()
    {
        using NativeIPA = IPA<NativeCurve, poly_length>;
        using RecursiveIPA = IPA<Curve, poly_length>;

        // We create a circuit that does two IPA verifications. However, we don't do the full verifications and instead
        // accumulate the claims into one claim. This accumulation is done in circuit. Create two accumulators, which
        // contain the commitment and an opening claim.
        Builder builder;

        auto [transcript_1, claim_1] = create_ipa_claim<poly_length>(builder);
        auto [transcript_2, claim_2] = create_ipa_claim<poly_length>(builder);

        // Creates two IPA accumulators and accumulators from the two claims. Also constructs the accumulated h
        // polynomial.
        auto [output_claim, ipa_proof] =
            RecursiveIPA::accumulate(this->ck(), transcript_1, claim_1, transcript_2, claim_2);
        output_claim.set_public();
        builder.ipa_proof = ipa_proof;
        builder.finalize_circuit(/*ensure_nonzero=*/false);
        info("Circuit with 2 IPA Recursive Verifiers and IPA Accumulation num finalized gates = ",
             builder.get_num_finalized_gates());

        EXPECT_TRUE(CircuitChecker::check(builder));

        const OpeningPair<NativeCurve> opening_pair{ bb::fq(output_claim.opening_pair.challenge.get_value()),
                                                     bb::fq(output_claim.opening_pair.evaluation.get_value()) };
        Commitment native_comm = output_claim.commitment.get_value();
        const OpeningClaim<NativeCurve> opening_claim{ opening_pair, native_comm };

        // Natively verify this proof to check it.
        auto verifier_transcript = std::make_shared<NativeTranscript>();
        verifier_transcript->load_proof(ipa_proof);

        auto result = NativeIPA::reduce_verify(this->vk(), opening_claim, verifier_transcript);
        EXPECT_TRUE(result);
    }
};
} // namespace

#define IPA_TEST

/**
 * @brief Tests IPA recursion with polynomial of length 4
 * @details More details in test_recursive_ipa
 */
TEST_F(IPARecursiveTests, RecursiveSmall)
{
    static constexpr size_t log_poly_length = 2;
    test_recursive_ipa<log_poly_length>();
}

/**
 * @brief Tests IPA recursion with polynomial of length 1024
 * @details More details in test_recursive_ipa
 */
TEST_F(IPARecursiveTests, RecursiveMedium)
{
    static constexpr size_t log_poly_length = 10;
    test_recursive_ipa<log_poly_length>();
}

/**
 * @brief Tests IPA recursion with polynomial of length 1<<CONST_ECCVM_LOG_N
 * @details More details in test_recursive_ipa
 */
TEST_F(IPARecursiveTests, RecursiveLarge)
{
    static constexpr size_t log_poly_length = CONST_ECCVM_LOG_N;
    test_recursive_ipa<log_poly_length>();
}

/**
 * @brief Test accumulation with polynomials of length 4
 * @details More details in test_accumulation
 */
TEST_F(IPARecursiveTests, AccumulateSmall)
{
    static constexpr size_t log_poly_length = 2;
    test_accumulation<log_poly_length>();
}

/**
 * @brief Test accumulation with polynomials of length 1024
 * @details More details in test_accumulation
 */
TEST_F(IPARecursiveTests, AccumulateMedium)
{
    static constexpr size_t log_poly_length = 10;
    test_accumulation<log_poly_length>();
}

TEST_F(IPARecursiveTests, FullRecursiveVerifier)
{

    static constexpr size_t log_poly_length = 10;
    using RecursiveIPA = IPA<Curve, log_poly_length>;
    //
    Builder builder;
    auto [stdlib_transcript, stdlib_claim] = create_ipa_claim<log_poly_length>(builder);

    VerifierCommitmentKey<Curve> stdlib_pcs_vkey(&builder, POLY_LENGTH, this->vk());
    auto result = RecursiveIPA::full_verify_recursive(stdlib_pcs_vkey, stdlib_claim, stdlib_transcript);
    EXPECT_TRUE(result);
    builder.finalize_circuit(/*ensure_nonzero=*/true);
    info("Full IPA Recursive Verifier num finalized gates for length ",
         1UL << log_poly_length,
         " = ",
         builder.get_num_finalized_gates());
    EXPECT_TRUE(CircuitChecker::check(builder));
}

TEST_F(IPARecursiveTests, AccumulationAndFullRecursiveVerifier)
{
    static constexpr size_t log_poly_length = 10;
    using RecursiveIPA = IPA<Curve, log_poly_length>;

    // We create a circuit that does two IPA verifications. However, we don't do the full verifications and instead
    // accumulate the claims into one claim. This accumulation is done in circuit. Create two accumulators, which
    // contain the commitment and an opening claim.
    Builder builder;

    auto [transcript_1, claim_1] = create_ipa_claim<log_poly_length>(builder);
    auto [transcript_2, claim_2] = create_ipa_claim<log_poly_length>(builder);

    // Creates two IPA accumulators and accumulators from the two claims. Also constructs the accumulated h
    // polynomial.
    auto [output_claim, ipa_proof] =
        RecursiveIPA::template accumulate(this->ck(), transcript_1, claim_1, transcript_2, claim_2);
    output_claim.set_public();
    builder.ipa_proof = ipa_proof;
    builder.finalize_circuit(/*ensure_nonzero=*/false);
    info("Circuit with 2 IPA Recursive Verifiers and IPA Accumulation num finalized gates = ",
         builder.get_num_finalized_gates());

    EXPECT_TRUE(CircuitChecker::check(builder));

    Builder root_rollup;
    // Fully recursively verify this proof to check it.
    VerifierCommitmentKey<Curve> stdlib_pcs_vkey(&root_rollup, 1UL << log_poly_length, this->vk());
    auto stdlib_verifier_transcript = std::make_shared<StdlibTranscript>();
    stdlib_verifier_transcript->load_proof(convert_native_proof_to_stdlib(&root_rollup, ipa_proof));
    OpeningClaim<Curve> ipa_claim;
    ipa_claim.opening_pair.challenge =
        Curve::ScalarField::create_from_u512_as_witness(&root_rollup, output_claim.opening_pair.challenge.get_value());
    ipa_claim.opening_pair.evaluation =
        Curve::ScalarField::create_from_u512_as_witness(&root_rollup, output_claim.opening_pair.evaluation.get_value());
    ipa_claim.commitment = Curve::AffineElement::from_witness(&root_rollup, output_claim.commitment.get_value());
    auto result = RecursiveIPA::full_verify_recursive(stdlib_pcs_vkey, ipa_claim, stdlib_verifier_transcript);
    root_rollup.finalize_circuit(/*ensure_nonzero=*/true);
    EXPECT_TRUE(result);
    info("Full IPA Recursive Verifier num finalized gates for length ",
         1UL << log_poly_length,
         " = ",
         root_rollup.get_num_finalized_gates());
}
