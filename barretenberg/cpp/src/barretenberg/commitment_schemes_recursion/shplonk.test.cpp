#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/commitment_key.test.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include <gtest/gtest.h>

using namespace bb;

const size_t LOG_DEGREE = 4;
const size_t MAX_POLY_DEGREE = 1UL << LOG_DEGREE;
template <class Builder> class ShplonkRecursionTest : public CommitmentTest<typename curve::BN254> {
  public:
    using Curve = stdlib::bn254<Builder>;
    using NativeCurve = Curve::NativeCurve;
    using Fr = Curve::ScalarField;
    using Commitment = Curve::AffineElement;

    std::vector<OpeningClaim<Curve>> native_to_stdlib_opening_claims(
        Builder* builder, std::vector<OpeningClaim<NativeCurve>>& opening_claims, const size_t num_claims)
    {
        std::vector<OpeningClaim<stdlib::bn254<Builder>>> stdlib_opening_claims;
        for (size_t idx = 0; idx < num_claims; idx++) {
            auto r = Fr::from_witness(builder, opening_claims[idx].opening_pair.challenge);
            auto eval = Fr::from_witness(builder, opening_claims[idx].opening_pair.evaluation);
            auto commit = Commitment::from_witness(builder, opening_claims[idx].commitment);
            stdlib_opening_claims.emplace_back(OpeningClaim<Curve>({ r, eval }, commit));
        }

        return stdlib_opening_claims;
    }

    std::pair<std::vector<Commitment>, std::vector<OpeningPair<Curve>>> native_to_stdlib_pairs_and_commitments(
        Builder* builder, std::vector<OpeningClaim<NativeCurve>>& opening_claims, const size_t num_claims)
    {
        std::vector<OpeningPair<Curve>> stdlib_opening_pairs;
        std::vector<Commitment> stdlib_commitments;
        for (size_t idx = 0; idx < num_claims; idx++) {
            auto opening_claim = opening_claims[idx];
            auto r = Fr::from_witness(builder, opening_claim.opening_pair.challenge);
            auto eval = Fr::from_witness(builder, opening_claim.opening_pair.evaluation);
            auto commit = Commitment::from_witness(builder, opening_claim.commitment);
            stdlib_opening_pairs.emplace_back(OpeningPair<Curve>(r, eval));
            stdlib_commitments.emplace_back(commit);
        }

        return std::make_pair(stdlib_commitments, stdlib_opening_pairs);
    }
};

using BuilderTypes = ::testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;
TYPED_TEST_SUITE(ShplonkRecursionTest, BuilderTypes);

TYPED_TEST(ShplonkRecursionTest, Simple)
{
    using Builder = TypeParam;
    using Curve = stdlib::bn254<TypeParam>;
    using ClaimData = UnivariateClaimData<typename Curve::NativeCurve>;
    using ShplonkProver = ShplonkProver_<typename Curve::NativeCurve>;
    using ShplonkVerifier = ShplonkVerifier_<Curve>;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using Transcript = bb::BaseTranscript<stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    using StdlibProof = stdlib::Proof<Builder>;

    // Prover transcript
    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Test data
    auto setup = this->generate_claim_data({ MAX_POLY_DEGREE, MAX_POLY_DEGREE / 2 });

    // Shplonk prover functionality
    auto prover_opening_claims = ClaimData::prover_opening_claims(setup);
    auto batched_prover_claim = ShplonkProver::prove(this->ck(), prover_opening_claims, prover_transcript);
    this->verify_opening_pair(batched_prover_claim.opening_pair, batched_prover_claim.polynomial);

    // Convert proof to stdlib
    Builder builder;
    StdlibProof stdlib_proof(builder, prover_transcript->export_proof());

    // Convert opening claims to witnesses
    auto native_verifier_claims = ClaimData::verifier_opening_claims(setup);
    auto stdlib_opening_claims =
        this->native_to_stdlib_opening_claims(&builder, native_verifier_claims, native_verifier_claims.size());

    // Shplonk verifier functionality
    auto verifier_transcript = std::make_shared<Transcript>();
    verifier_transcript->load_proof(stdlib_proof);
    [[maybe_unused]] auto _ = verifier_transcript->template receive_from_prover<Fr>("Init");
    [[maybe_unused]] auto batched_verifier_claim =
        ShplonkVerifier::reduce_verification(Commitment::one(&builder), stdlib_opening_claims, verifier_transcript);

    EXPECT_TRUE(CircuitChecker::check(builder));
}

TYPED_TEST(ShplonkRecursionTest, LineralyDependent)
{
    using Builder = TypeParam;
    using Curve = stdlib::bn254<TypeParam>;
    using ClaimData = UnivariateClaimData<typename Curve::NativeCurve>;
    using ShplonkProver = ShplonkProver_<typename Curve::NativeCurve>;
    using ShplonkVerifier = ShplonkVerifier_<Curve>;
    using Fr = typename Curve::ScalarField;
    using GroupElement = Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using OpeningClaim = OpeningClaim<Curve>;
    using OpeningVector = OpeningVector<Curve>;
    using Transcript = bb::BaseTranscript<stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    using StdlibProof = stdlib::Proof<Builder>;

    // Prover transcript
    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Generate two random (unrelated) polynomials of two different sizes and a random linear combinations
    auto setup = this->generate_claim_data({ MAX_POLY_DEGREE, MAX_POLY_DEGREE / 2 });

    // Extract the commitments to be used in the Shplonk verifier
    auto commitments = ClaimData::polynomial_commitments(setup);

    // Linearly combine the polynomials and evalu
    auto [coefficients, evals] = this->combine_claims(setup);

    // Shplonk prover functionality
    auto prover_opening_claims = ClaimData::prover_opening_claims(setup);
    auto batched_prover_claim = ShplonkProver::prove(this->ck(), prover_opening_claims, prover_transcript);
    this->verify_opening_pair(batched_prover_claim.opening_pair, batched_prover_claim.polynomial);
    auto proof = prover_transcript->export_proof();

    auto native_opening_claims = ClaimData::verifier_opening_claims(setup);
    {
        // Shplonk verifier functionality - expensive way
        // Convert proof to stdlib
        Builder builder;
        StdlibProof stdlib_proof(builder, proof);

        auto coeff1 = Fr::from_witness(&builder, coefficients[0]);
        auto coeff2 = Fr::from_witness(&builder, coefficients[1]);

        // Convert opening claims to witnesses
        auto stdlib_opening_claims =
            this->native_to_stdlib_opening_claims(&builder, native_opening_claims, native_opening_claims.size() - 1);

        // Compute last commitment as it would happen in a circuit
        Commitment commit = GroupElement::batch_mul(
            { stdlib_opening_claims[0].commitment, stdlib_opening_claims[1].commitment }, { coeff1, coeff2 });
        Fr r = Fr::from_witness(&builder, native_opening_claims[2].opening_pair.challenge);
        Fr eval = Fr::from_witness(&builder, native_opening_claims[2].opening_pair.evaluation);
        stdlib_opening_claims.emplace_back(OpeningClaim({ r, eval }, commit));

        auto verifier_transcript = std::make_shared<Transcript>();
        verifier_transcript->load_proof(stdlib_proof);
        [[maybe_unused]] auto _ = verifier_transcript->template receive_from_prover<Fr>("Init");
        [[maybe_unused]] auto batched_verifier_claim =
            ShplonkVerifier::reduce_verification(Commitment::one(&builder), stdlib_opening_claims, verifier_transcript);

        EXPECT_TRUE(CircuitChecker::check(builder));

        if constexpr (std::is_same_v<Builder, UltraCircuitBuilder>) {
            info("Num gates UltraCircuitBuilder (non-efficient way: size-5 MSM + size-2 MSM): ", builder.num_gates);
        } else if constexpr (std::is_same_v<Builder, MegaCircuitBuilder>) {
            info("Num MSM rows MegaCircuitBuilder (non-efficient way: size-5 MSM + size-2 MSM): ",
                 builder.op_queue->get_num_rows());
        }
    }

    {
        // Shplonk verifier functionality - efficient way
        // Convert proof to stdlib
        Builder builder;
        StdlibProof stdlib_proof(builder, proof);

        auto coeff1 = Fr::from_witness(&builder, coefficients[0]);
        auto coeff2 = Fr::from_witness(&builder, coefficients[1]);

        // Convert opening claims to witnesses
        auto [stdlib_commitments, stdlib_opening_pairs] = this->native_to_stdlib_pairs_and_commitments(
            &builder, native_opening_claims, native_opening_claims.size() - 1);

        // Shplonk verifier functionality - cheap way
        std::vector<OpeningVector> opening_vectors = {
            { stdlib_opening_pairs[0].challenge, { Fr(1) }, { stdlib_opening_pairs[0].evaluation } },
            { stdlib_opening_pairs[1].challenge, { Fr(1) }, { stdlib_opening_pairs[1].evaluation } },
            { Fr::from_witness(&builder, native_opening_claims[2].opening_pair.challenge),
              { coeff1, coeff2 },
              { Fr::from_witness(&builder, evals[0]), Fr::from_witness(&builder, evals[1]) } }
        };
        std::vector<std::vector<size_t>> indices = { { 0 }, { 1 }, { 0, 1 } };

        auto verifier_transcript = std::make_shared<Transcript>();
        verifier_transcript->load_proof(stdlib_proof);
        [[maybe_unused]] auto _ = verifier_transcript->template receive_from_prover<Fr>("Init");

        ShplonkVerifier verifier(stdlib_commitments, verifier_transcript, native_opening_claims.size());

        // Execute the shplonk verifier functionality
        [[maybe_unused]] auto batched_verifier_claim =
            verifier.reduce_vector_claims_verification(this->vk().get_g1_identity(), indices, opening_vectors);

        EXPECT_TRUE(CircuitChecker::check(builder));

        if constexpr (std::is_same_v<Builder, UltraCircuitBuilder>) {
            info("Num gates UltraCircuitBuilder (efficient way: size-4 MSM): ", builder.num_gates);
        } else if constexpr (std::is_same_v<Builder, MegaCircuitBuilder>) {
            info("Num MSM rows MegaCircuitBuilder (efficient way: size-4 MSM): ", builder.op_queue->get_num_rows());
        }
    }
}
