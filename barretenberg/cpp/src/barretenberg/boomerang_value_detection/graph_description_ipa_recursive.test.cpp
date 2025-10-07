#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/commitment_key.test.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/stdlib/eccvm_verifier/verifier_commitment_key.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

using namespace bb;
using namespace cdg;
using NativeCurve = curve::Grumpkin;
using Builder = UltraCircuitBuilder;
using Curve = stdlib::grumpkin<Builder>;

class BoomerangIPARecursiveTests : public CommitmentTest<NativeCurve> {
  public:
    using Fr = typename NativeCurve::ScalarField;
    using GroupElement = typename NativeCurve::Element;
    using CK = CommitmentKey<NativeCurve>;
    using VK = VerifierCommitmentKey<NativeCurve>;
    using Polynomial = bb::Polynomial<Fr>;
    using Commitment = typename NativeCurve::AffineElement;
    using StdlibProof = bb::stdlib::Proof<Builder>;

    using StdlibTranscript = UltraStdlibTranscript;
    // `FailureMode::None` corresponds to a normal, completeness test. The other cases are legitimate failure modes,
    // where the test should fail. As neither `a_0` nor `G_0` are hashed, the corresponding variants will not fail for
    // Fiat-Shamir reasons. The last failure mode is: we send an OpeningClaim to the hash buffer, then
    // we have the prover run the IPA process with a _different polynomial_.
    enum class FailureMode : std::uint8_t { None, A_Zero, G_Zero, ChangePoly };

    /**
     * @brief  Given a builder, polynomial, and challenge point, return the transcript and opening claim _in circuit_.
     *
     * @details Given a `poly` and `x`, first generates a native proof (and verifiers), then loads the proof into a
     * StdLib transcript.
     *
     * @tparam log_poly_length
     * @param builder
     * @param poly
     * @param x
     * @param failure_mode
     * @return std::pair<std::shared_ptr<StdlibTranscript>, OpeningClaim<Curve>>
     *
     * @note assumes that the size of `poly` is exactly `1 << log_poly_length`.
     */
    template <size_t log_poly_length>
    std::pair<std::shared_ptr<StdlibTranscript>, OpeningClaim<Curve>> create_ipa_claim(Builder& builder,
                                                                                       Polynomial& poly,
                                                                                       Fr x)
    {
        using NativeIPA = IPA<NativeCurve, log_poly_length>;
        EXPECT_EQ(1UL << log_poly_length, poly.size());
        Commitment commitment = this->commit(poly);
        auto eval = poly.evaluate(x);

        const OpeningPair<NativeCurve> opening_pair = { x, eval };
        const ProverOpeningClaim<NativeCurve> prover_claim{ poly, opening_pair };
        // initialize empty prover transcript
        auto prover_transcript = std::make_shared<NativeTranscript>();
        using DataType = NativeTranscript::DataType;
        std::vector<DataType> proof;
        // Normal operation
        NativeIPA::compute_opening_proof(this->ck(), prover_claim, prover_transcript);
        proof = prover_transcript->export_proof();

        // initialize verifier transcript from proof data
        auto verifier_transcript = std::make_shared<NativeTranscript>();
        verifier_transcript->load_proof(proof);

        // Recursively verify the proof
        auto stdlib_comm = Curve::Group::from_witness(&builder, commitment);
        auto stdlib_x = Curve::ScalarField::from_witness(&builder, x);
        auto stdlib_eval = Curve::ScalarField::from_witness(&builder, eval);
        OpeningClaim<Curve> stdlib_opening_claim{ { stdlib_x, stdlib_eval }, stdlib_comm };

        // Construct stdlib verifier transcript
        auto recursive_verifier_transcript = std::make_shared<StdlibTranscript>();
        recursive_verifier_transcript->load_proof(StdlibProof(builder, proof));
        return { recursive_verifier_transcript, stdlib_opening_claim };
    }

    /**
     * @brief Given a `poly` and a challenge `x`, return the recursive verifier circuit.
     *
     * @tparam log_poly_length
     * @param poly
     * @param x
     * @return Builder
     */
    template <size_t log_poly_length> Builder build_ipa_recursive_verifier_circuit(Polynomial& poly, Fr x)
    {
        using RecursiveIPA = IPA<Curve, log_poly_length>;

        Builder builder;
        auto [stdlib_transcript, stdlib_claim] = create_ipa_claim<log_poly_length>(builder, poly, x);

        RecursiveIPA::reduce_verify(stdlib_claim, stdlib_transcript);
        stdlib::recursion::PairingPoints<Builder>::add_default_to_public_inputs(builder);
        builder.finalize_circuit(/*ensure_nonzero=*/true);
        return builder;
    }
    // flag to determine what type of polynomial to generate
    enum class PolyType : std::uint8_t { Random, ManyZeros, Sparse, Zero };

    template <size_t log_poly_length>
    std::tuple<Polynomial, Fr> generate_poly_and_challenge(PolyType poly_type = PolyType::Random)
    {

        static constexpr size_t poly_length = 1UL << log_poly_length;
        Polynomial poly(poly_length);
        switch (poly_type) {
        case PolyType::Random:
            poly = Polynomial::random(poly_length);
            break;
        case PolyType::ManyZeros:
            poly = Polynomial::random(poly_length);
            for (size_t i = 0; i < poly_length / 2; ++i) {
                poly.at(i) = Fr::zero();
            }
            break;
        case PolyType::Sparse:
            // set a few coefficients to be non-zero
            for (size_t i = 0; i < std::min<size_t>(100, poly_length / 2); ++i) {
                size_t idx = static_cast<size_t>(this->engine->get_random_uint64() % poly_length);
                poly.at(idx) = this->random_element();
            }
            break;
        case PolyType::Zero:
            break;
        }
        auto x = this->random_element();
        return { poly, x };
    }

    /**
     * @brief Tests IPA recursion
     * @details Creates an IPA claim and then runs the recursive IPA verification and checks that the circuit is valid.
     */
    template <size_t log_poly_length> void test_recursive_ipa(Polynomial& poly, Fr x)
    {
        BB_DISABLE_ASSERTS();
        Builder builder(build_ipa_recursive_verifier_circuit<log_poly_length>(poly, x));
        info("IPA Recursive Verifier num finalized gates = ", builder.get_num_finalized_gates());
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    /**
     * @brief Tests IPA accumulation by accumulating two IPA claims and proving the accumulated claim
     * @details Creates two IPA claims, and then two IPA accumulators through recursive verification. Proves the
     * accumulated claim and checks that it verifies.
     * @param log_poly_length
     */
    template <size_t log_poly_length> void test_accumulation(Polynomial& poly1, Polynomial& poly2, Fr x1, Fr x2)
    {
        using NativeIPA = IPA<NativeCurve, log_poly_length>;
        using RecursiveIPA = IPA<Curve, log_poly_length>;

        // We create a circuit that does two IPA verifications. However, we don't do the full verifications and instead
        // accumulate the claims into one claim. This accumulation is done in circuit. Create two accumulators, which
        // contain the commitment and an opening claim.
        Builder builder;
        auto [transcript_1, claim_1] = create_ipa_claim<log_poly_length>(builder, poly1, x1);
        auto [transcript_2, claim_2] = create_ipa_claim<log_poly_length>(builder, poly2, x2);

        // Creates two IPA accumulators and accumulators from the two claims. Also constructs the accumulated h
        // polynomial.
        auto [output_claim, ipa_proof] =
            RecursiveIPA::accumulate(this->ck(), transcript_1, claim_1, transcript_2, claim_2);
        output_claim.set_public();
        output_claim.commitment.fix_witness();
        builder.ipa_proof = ipa_proof;
        builder.finalize_circuit(/*ensure_nonzero=*/false);
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

        auto tool = StaticAnalyzer(builder);
        auto tool_results = tool.analyze_circuit();
        EXPECT_EQ(tool_results.first.size(), 1);
        EXPECT_EQ(tool_results.second.size(), 0);
    }
};

TEST_F(BoomerangIPARecursiveTests, FullRecursiveVerifierMediumRandom)
{
    static constexpr size_t log_poly_length = 10;
    static constexpr size_t poly_length = 1UL << log_poly_length;
    using RecursiveIPA = IPA<Curve, log_poly_length>;

    Builder builder;
    auto [poly, x] = generate_poly_and_challenge<log_poly_length>();
    auto [stdlib_transcript, stdlib_claim] = create_ipa_claim<log_poly_length>(builder, poly, x);

    VerifierCommitmentKey<Curve> stdlib_pcs_vkey(&builder, poly_length, this->vk());
    auto result = RecursiveIPA::full_verify_recursive(stdlib_pcs_vkey, stdlib_claim, stdlib_transcript);
    EXPECT_TRUE(result);
    builder.finalize_circuit(/*ensure_nonzero=*/true);

    auto tool = StaticAnalyzer(builder);
    auto tool_results = tool.analyze_circuit();
    EXPECT_EQ(tool_results.first.size(), 1);
    EXPECT_EQ(tool_results.second.size(), 0);
}

TEST_F(BoomerangIPARecursiveTests, AccumulateSmallRandom)
{
    static constexpr size_t log_poly_length = 2;
    auto [poly1, x1] = generate_poly_and_challenge<log_poly_length>(PolyType::Random);
    auto [poly2, x2] = generate_poly_and_challenge<log_poly_length>(PolyType::Random);
    test_accumulation<log_poly_length>(poly1, poly2, x1, x2);
}

TEST_F(BoomerangIPARecursiveTests, AccumulateMediumRandom)
{
    static constexpr size_t log_poly_length = 10;
    auto [poly1, x1] = generate_poly_and_challenge<log_poly_length>();
    auto [poly2, x2] = generate_poly_and_challenge<log_poly_length>();
    test_accumulation<log_poly_length>(poly1, poly2, x1, x2);
}

TEST_F(BoomerangIPARecursiveTests, AccumulateMediumFirstZeroPoly)
{
    static constexpr size_t log_poly_length = 10;
    static constexpr size_t poly_length = 1UL << log_poly_length;
    Polynomial poly1(poly_length);
    auto x1 = this->random_element();
    auto [poly2, x2] = generate_poly_and_challenge<log_poly_length>();
    test_accumulation<log_poly_length>(poly1, poly2, x1, x2);
}

TEST_F(BoomerangIPARecursiveTests, AccumulationAndFullRecursiveVerifierMediumRandom)
{
    static constexpr size_t log_poly_length = 10;
    using RecursiveIPA = IPA<Curve, log_poly_length>;

    // We create a circuit that does two IPA verifications. However, we don't do the full verifications and instead
    // accumulate the claims into one claim. This accumulation is done in circuit. Create two accumulators, which
    // contain the commitment and an opening claim.
    Builder builder;

    auto [poly1, x1] = generate_poly_and_challenge<log_poly_length>();
    auto [poly2, x2] = generate_poly_and_challenge<log_poly_length>();

    auto [transcript_1, claim_1] = create_ipa_claim<log_poly_length>(builder, poly1, x1);
    auto [transcript_2, claim_2] = create_ipa_claim<log_poly_length>(builder, poly2, x2);

    // Creates two IPA accumulators and accumulators from the two claims. Also constructs the accumulated h
    // polynomial.
    auto [output_claim, ipa_proof] = RecursiveIPA::accumulate(this->ck(), transcript_1, claim_1, transcript_2, claim_2);
    output_claim.set_public();
    builder.ipa_proof = ipa_proof;
    builder.finalize_circuit(/*ensure_nonzero=*/false);

    Builder root_rollup;
    // Fully recursively verify this proof to check it.
    VerifierCommitmentKey<Curve> stdlib_pcs_vkey(&root_rollup, 1UL << log_poly_length, this->vk());
    auto stdlib_verifier_transcript = std::make_shared<StdlibTranscript>();
    stdlib_verifier_transcript->load_proof(StdlibProof(root_rollup, ipa_proof));
    OpeningClaim<Curve> ipa_claim;
    ipa_claim.opening_pair.challenge =
        Curve::ScalarField::create_from_u512_as_witness(&root_rollup, output_claim.opening_pair.challenge.get_value());
    ipa_claim.opening_pair.evaluation =
        Curve::ScalarField::create_from_u512_as_witness(&root_rollup, output_claim.opening_pair.evaluation.get_value());
    ipa_claim.commitment = Curve::AffineElement::from_witness(&root_rollup, output_claim.commitment.get_value());
    auto result = RecursiveIPA::full_verify_recursive(stdlib_pcs_vkey, ipa_claim, stdlib_verifier_transcript);
    root_rollup.finalize_circuit(/*ensure_nonzero=*/true);
    EXPECT_TRUE(result);

    auto tool = StaticAnalyzer(root_rollup);
    auto tool_results = tool.analyze_circuit();
    EXPECT_EQ(tool_results.first.size(), 1);
    EXPECT_EQ(tool_results.second.size(), 0);
}
