
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/commitment_key.test.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/stdlib/eccvm_verifier/verifier_commitment_key.hpp"
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
    using NativeIPA = IPA<NativeCurve>;
    using RecursiveIPA = IPA<Curve>;
    using StdlibTranscript = bb::stdlib::recursion::honk::UltraStdlibTranscript;

    std::pair<std::shared_ptr<StdlibTranscript>, OpeningClaim<Curve>> create_ipa_claim(Builder& builder, const size_t n)
    {
        // First generate an ipa proof
        auto poly = Polynomial::random(n);
        // Commit to a zero polynomial
        Commitment commitment = this->commit(poly);

        auto [x, eval] = this->random_eval(poly);
        const OpeningPair<NativeCurve> opening_pair = { x, eval };
        const OpeningClaim<NativeCurve> opening_claim{ opening_pair, commitment };

        // initialize empty prover transcript
        auto prover_transcript = std::make_shared<NativeTranscript>();
        NativeIPA::compute_opening_proof(this->ck(), { poly, opening_pair }, prover_transcript);

        // initialize verifier transcript from proof data
        auto verifier_transcript = std::make_shared<NativeTranscript>(prover_transcript->proof_data);

        auto result = NativeIPA::reduce_verify(this->vk(), opening_claim, verifier_transcript);
        EXPECT_TRUE(result);

        // Recursively verify the proof
        auto stdlib_comm = Curve::Group::from_witness(&builder, commitment);
        auto stdlib_x = Curve::ScalarField::from_witness(&builder, x);
        auto stdlib_eval = Curve::ScalarField::from_witness(&builder, eval);
        OpeningClaim<Curve> stdlib_opening_claim{ { stdlib_x, stdlib_eval }, stdlib_comm };

        // Construct stdlib verifier transcript
        auto recursive_verifier_transcript = std::make_shared<StdlibTranscript>(
            bb::convert_native_proof_to_stdlib(&builder, prover_transcript->proof_data));
        return { recursive_verifier_transcript, stdlib_opening_claim };
    }

    Builder build_ipa_recursive_verifier_circuit(const size_t POLY_LENGTH)
    {
        Builder builder;
        auto [stdlib_transcript, stdlib_claim] = create_ipa_claim(builder, POLY_LENGTH);

        RecursiveIPA::reduce_verify(stdlib_claim, stdlib_transcript);
        builder.finalize_circuit(/*ensure_nonzero=*/true);
        return builder;
    }

    /**
     * @brief Tests IPA recursion
     * @details Creates an IPA claim and then runs the recursive IPA verification and checks that the circuit is valid.
     * @param POLY_LENGTH
     */
    void test_recursive_ipa(const size_t POLY_LENGTH)
    {
        Builder builder(build_ipa_recursive_verifier_circuit(POLY_LENGTH));
        info("IPA Recursive Verifier num finalized gates = ", builder.get_num_finalized_gates());
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    /**
     * @brief Checks the the IPA Recursive Verifier circuit is fixed no matter the ECCVM trace size.
     * @details Compares the builder blocks and locates which index in which block is different. Also compares the vks
     * to find which commitment is different.
     */
    void test_fixed_ipa_recursive_verifier()
    {

        srs::init_crs_factory(bb::srs::get_ignition_crs_path());

        Builder builder_1(build_ipa_recursive_verifier_circuit(1 << 10));
        Builder builder_2(build_ipa_recursive_verifier_circuit(1 << 11));

        UltraFlavor::ProvingKey pk_1 = (DeciderProvingKey_<UltraFlavor>(builder_1)).proving_key;
        UltraFlavor::ProvingKey pk_2 = (DeciderProvingKey_<UltraFlavor>(builder_2)).proving_key;
        UltraFlavor::VerificationKey verification_key_1(pk_1);
        UltraFlavor::VerificationKey verification_key_2(pk_2);
        bool broke(false);
        auto check_eq = [&broke](auto& p1, auto& p2) {
            EXPECT_TRUE(p1.size() == p2.size());
            for (size_t idx = 0; idx < p1.size(); idx++) {
                if (p1[idx] != p2[idx]) {
                    broke = true;
                    break;
                }
            }
        };

        // Compares block by block to find which gate is different.
        size_t block_idx = 0;
        for (auto [b_10, b_11] : zip_view(builder_1.blocks.get(), builder_2.blocks.get())) {
            info("block index: ", block_idx);
            EXPECT_TRUE(b_10.q_1().size() == b_11.q_1().size());
            EXPECT_TRUE(b_10.selectors.size() == 13);
            EXPECT_TRUE(b_11.selectors.size() == 13);
            for (auto [p_10, p_11] : zip_view(b_10.selectors, b_11.selectors)) {
                check_eq(p_10, p_11);
            }
            block_idx++;
        }

        EXPECT_TRUE(verification_key_1.circuit_size == verification_key_2.circuit_size);
        EXPECT_TRUE(verification_key_1.num_public_inputs == verification_key_2.num_public_inputs);

        // Compares the VKs to find which commitment is different.
        UltraFlavor::CommitmentLabels labels;
        for (auto [vk_10, vk_11, label] :
             zip_view(verification_key_1.get_all(), verification_key_2.get_all(), labels.get_precomputed())) {
            if (vk_10 != vk_11) {
                broke = true;
                info("Mismatch verification key label: ", label, " left: ", vk_10, " right: ", vk_11);
            }
        }

        EXPECT_FALSE(broke);
    }

    /**
     * @brief Tests IPA accumulation by accumulating two IPA claims and proving the accumulated claim
     * @details Creates two IPA claims, and then two IPA accumulators through recursive verification. Proves the
     * accumulated claim and checks that it verifies.
     * @param POLY_LENGTH
     */
    void test_accumulation(const size_t POLY_LENGTH)
    {
        // We create a circuit that does two IPA verifications. However, we don't do the full verifications and instead
        // accumulate the claims into one claim. This accumulation is done in circuit. Create two accumulators, which
        // contain the commitment and an opening claim.
        Builder builder;

        auto [transcript_1, claim_1] = create_ipa_claim(builder, POLY_LENGTH);
        auto [transcript_2, claim_2] = create_ipa_claim(builder, POLY_LENGTH);

        // Creates two IPA accumulators and accumulators from the two claims. Also constructs the accumulated h
        // polynomial.
        auto [output_claim, ipa_proof] =
            RecursiveIPA::accumulate(this->ck(), transcript_1, claim_1, transcript_2, claim_2);
        builder.add_ipa_claim(output_claim.get_witness_indices());
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
        auto verifier_transcript = std::make_shared<NativeTranscript>(ipa_proof);

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
    test_recursive_ipa(/*POLY_LENGTH=*/4);
}

/**
 * @brief Tests IPA recursion with polynomial of length 1024
 * @details More details in test_recursive_ipa
 */
TEST_F(IPARecursiveTests, RecursiveMedium)
{
    test_recursive_ipa(/*POLY_LENGTH=*/1024);
}

/**
 * @brief Tests IPA recursion with polynomial of length 1<<CONST_ECCVM_LOG_N
 * @details More details in test_recursive_ipa
 */
TEST_F(IPARecursiveTests, RecursiveLarge)
{
    test_recursive_ipa(/*POLY_LENGTH=*/1 << CONST_ECCVM_LOG_N);
}

/**
 * @brief Test accumulation with polynomials of length 4
 * @details More details in test_accumulation
 */
TEST_F(IPARecursiveTests, AccumulateSmall)
{
    test_accumulation(/*POLY_LENGTH=*/4);
}

/**
 * @brief Test accumulation with polynomials of length 1024
 * @details More details in test_accumulation
 */
TEST_F(IPARecursiveTests, AccumulateMedium)
{
    test_accumulation(/*POLY_LENGTH=*/1024);
}

TEST_F(IPARecursiveTests, ConstantVerifier)
{
    test_fixed_ipa_recursive_verifier();
}

TEST_F(IPARecursiveTests, FullRecursiveVerifier)
{
    const size_t POLY_LENGTH = 1024;
    Builder builder;
    auto [stdlib_transcript, stdlib_claim] = create_ipa_claim(builder, POLY_LENGTH);

    auto stdlib_pcs_vkey = std::make_shared<VerifierCommitmentKey<Curve>>(&builder, POLY_LENGTH, this->vk());
    auto result = RecursiveIPA::full_verify_recursive(stdlib_pcs_vkey, stdlib_claim, stdlib_transcript);
    EXPECT_TRUE(result);
    builder.finalize_circuit(/*ensure_nonzero=*/true);
    info("Full IPA Recursive Verifier num finalized gates for length ",
         POLY_LENGTH,
         " = ",
         builder.get_num_finalized_gates());
    EXPECT_TRUE(CircuitChecker::check(builder));
}

TEST_F(IPARecursiveTests, AccumulationAndFullRecursiveVerifier)
{
    const size_t POLY_LENGTH = 1024;

    // We create a circuit that does two IPA verifications. However, we don't do the full verifications and instead
    // accumulate the claims into one claim. This accumulation is done in circuit. Create two accumulators, which
    // contain the commitment and an opening claim.
    Builder builder;

    auto [transcript_1, claim_1] = create_ipa_claim(builder, POLY_LENGTH);
    auto [transcript_2, claim_2] = create_ipa_claim(builder, POLY_LENGTH);

    // Creates two IPA accumulators and accumulators from the two claims. Also constructs the accumulated h
    // polynomial.
    auto [output_claim, ipa_proof] = RecursiveIPA::accumulate(this->ck(), transcript_1, claim_1, transcript_2, claim_2);
    builder.add_ipa_claim(output_claim.get_witness_indices());
    builder.ipa_proof = ipa_proof;
    builder.finalize_circuit(/*ensure_nonzero=*/false);
    info("Circuit with 2 IPA Recursive Verifiers and IPA Accumulation num finalized gates = ",
         builder.get_num_finalized_gates());

    EXPECT_TRUE(CircuitChecker::check(builder));

    Builder root_rollup;
    // Fully recursively verify this proof to check it.
    auto stdlib_pcs_vkey =
        std::make_shared<VerifierCommitmentKey<Curve>>(&root_rollup, 1 << CONST_ECCVM_LOG_N, this->vk());
    auto stdlib_verifier_transcript =
        std::make_shared<StdlibTranscript>(convert_native_proof_to_stdlib(&root_rollup, ipa_proof));
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
         1 << CONST_ECCVM_LOG_N,
         " = ",
         root_rollup.get_num_finalized_gates());
}

/**
 * @brief Test accumulation of IPA claims with different polynomial lengths
 *
 */
TEST_F(IPARecursiveTests, AccumulationWithDifferentSizes)
{
    // We create a circuit that does two IPA verifications of different sizes. However, we don't do the full
    // verifications and instead accumulate the claims into one claim. This accumulation is done in circuit. Create two
    // accumulators, which contain the commitment and an opening claim.
    const size_t POLY_LENGTH_1 = 16;
    const size_t POLY_LENGTH_2 = 32;
    Builder builder;

    auto [transcript_1, claim_1] = create_ipa_claim(builder, POLY_LENGTH_1);
    auto [transcript_2, claim_2] = create_ipa_claim(builder, POLY_LENGTH_2);

    // Creates two IPA accumulators and accumulators from the two claims. Also constructs the accumulated h
    // polynomial.
    auto [output_claim, ipa_proof] = RecursiveIPA::accumulate(this->ck(), transcript_1, claim_1, transcript_2, claim_2);
    builder.add_ipa_claim(output_claim.get_witness_indices());
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
    auto verifier_transcript = std::make_shared<NativeTranscript>(ipa_proof);

    auto result = NativeIPA::reduce_verify(this->vk(), opening_claim, verifier_transcript);
    EXPECT_TRUE(result);
}