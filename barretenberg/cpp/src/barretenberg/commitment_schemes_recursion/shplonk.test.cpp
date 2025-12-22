#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/commitment_key.test.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include <gtest/gtest.h>

using namespace bb;

static constexpr size_t LOG_DEGREE = 4;
static constexpr size_t MAX_POLY_DEGREE = 1UL << LOG_DEGREE;
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
            // Removing the free witness tag, since the opening claims in the full scheme are supposed to
            // be fiat-shamirred or derived from the transcript earlier
            r.unset_free_witness_tag();
            eval.unset_free_witness_tag();
            commit.unset_free_witness_tag();
            stdlib_opening_claims.emplace_back(OpeningClaim<Curve>({ r, eval }, commit));
        }

        return stdlib_opening_claims;
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
    using Transcript = StdlibTranscript<Builder>;
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
    auto verifier_transcript = std::make_shared<Transcript>(stdlib_proof);
    [[maybe_unused]] auto _ = verifier_transcript->template receive_from_prover<Fr>("Init");
    [[maybe_unused]] auto batched_verifier_claim =
        ShplonkVerifier::reduce_verification(Commitment::one(&builder), stdlib_opening_claims, verifier_transcript);

    EXPECT_TRUE(CircuitChecker::check(builder));
}
