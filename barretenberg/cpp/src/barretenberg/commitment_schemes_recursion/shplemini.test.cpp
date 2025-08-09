#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/commitment_key.test.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/commitment_schemes/utils/mock_witness_generator.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/primitives/padding_indicator_array/padding_indicator_array.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>

using namespace bb;

template <class PCS> class ShpleminiRecursionTest : public CommitmentTest<typename PCS::Curve::NativeCurve> {
  public:
    using Builder = typename PCS::Builder;
    using Curve = typename PCS::Curve;
    using NativeCurve = typename Curve::NativeCurve;
    using Commitment = typename Curve::AffineElement;
    using NativePCS = typename PCS::PCSImpl;
    using CommitmentKey = typename NativePCS::CK;
    using ShpleminiProver = ShpleminiProver_<NativeCurve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;
    using Fr = typename Curve::ScalarField;
    using NativeFr = typename NativeCurve::ScalarField;
    using NativeCommitment = typename NativeCurve::AffineElement;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = typename ClaimBatcher::Batch;
    using MockClaimGen = MockClaimGenerator<NativeCurve>;
    using StdlibProof = bb::stdlib::Proof<Builder>;

    static std::vector<Fr> convert_elements_to_witnesses(Builder& builder, const std::vector<NativeFr>& elements)
    {
        std::vector<Fr> out(elements.size());
        std::transform(elements.begin(), elements.end(), out.begin(), [&builder](const NativeFr& e) {
            return Fr::from_witness(&builder, e);
        });
        return out;
    }

    static std::vector<Commitment> convert_commitments_to_witnesses(
        Builder& builder, const std::vector<NativeCommitment>& native_commitments)
    {
        std::vector<Commitment> out(native_commitments.size());
        std::transform(native_commitments.begin(),
                       native_commitments.end(),
                       out.begin(),
                       [&builder](const NativeCommitment& c) { return Commitment::from_witness(&builder, c); });
        return out;
    }

    static std::vector<NativeFr> random_challenge_vector(size_t size)
    {
        std::vector<NativeFr> out;
        out.reserve(size);
        for (size_t i = 0; i < size; ++i) {
            out.emplace_back(NativeFr::random_element());
        }
        return out;
    }

    template <size_t num_polys, size_t num_shifted> void run_shplemini_full_scalars(size_t log_circuit_size)
    {
        run_shplemini_generic<num_polys, num_shifted, false>(log_circuit_size);
    }

    template <size_t num_polys, size_t num_shifted>
    void run_shplemini_short_scalars(size_t log_circuit_size)
        requires std::is_same_v<Builder, MegaCircuitBuilder>
    {
        run_shplemini_generic<num_polys, num_shifted, true>(log_circuit_size);
    }

  private:
    template <size_t num_polys, size_t num_shifted, bool short_scalars>
    size_t run_shplemini_generic(size_t log_circuit_size)
    {
        using diff_t = typename std::vector<NativeFr>::difference_type;

        size_t N = 1 << log_circuit_size;
        const auto padding_indicator_array =
            stdlib::compute_padding_indicator_array<Curve, CONST_PROOF_SIZE_LOG_N>(log_circuit_size);

        CommitmentKey commitment_key(16384);
        std::vector<NativeFr> u_challenge = random_challenge_vector(CONST_PROOF_SIZE_LOG_N);

        std::vector<NativeFr> truncated_u_challenge(u_challenge.begin(),
                                                    u_challenge.begin() + static_cast<diff_t>(log_circuit_size));

        MockClaimGen mock_claims(N, num_polys, num_shifted, 0, truncated_u_challenge, commitment_key);
        auto prover_transcript = NativeTranscript::prover_init_empty();
        // Initialize polys outside of `if` as they are used inside RefVector ClaimBatcher members.
        Polynomial<NativeFr> squashed_unshifted(N);
        Polynomial<NativeFr> squashed_shifted(Polynomial<NativeFr>::shiftable(N));
        // Labels are shared by Prover and Verifier
        std::array<std::string, num_polys - 1> unshifted_batching_challenge_labels;
        std::array<std::string, num_shifted> shifted_batching_challenge_labels;
        size_t idx = 0;
        for (auto& label : unshifted_batching_challenge_labels) {
            label = "rho_" + std::to_string(idx++);
        }
        for (auto& label : shifted_batching_challenge_labels) {
            label = "rho_" + std::to_string(idx++);
        }

        if constexpr (short_scalars) {

            std::array<NativeFr, num_polys - 1> unshifted_challenges =
                prover_transcript->template get_challenges<NativeFr>(unshifted_batching_challenge_labels);
            std::array<NativeFr, num_shifted> shifted_challenges =
                prover_transcript->template get_challenges<NativeFr>(shifted_batching_challenge_labels);

            squashed_unshifted += mock_claims.polynomial_batcher.unshifted[0];
            for (size_t i = 0; i < unshifted_challenges.size(); ++i) {
                squashed_unshifted.add_scaled(mock_claims.polynomial_batcher.unshifted[i + 1], unshifted_challenges[i]);
            }

            for (size_t i = 0; i < shifted_challenges.size(); ++i) {
                squashed_shifted.add_scaled(mock_claims.polynomial_batcher.to_be_shifted_by_one[i],
                                            shifted_challenges[i]);
            }

            mock_claims.polynomial_batcher.unshifted = RefVector{ squashed_unshifted };
            mock_claims.polynomial_batcher.to_be_shifted_by_one = RefVector{ squashed_shifted };
        }

        auto prover_opening_claims =
            ShpleminiProver::prove(N, mock_claims.polynomial_batcher, u_challenge, commitment_key, prover_transcript);

        KZG<NativeCurve>::compute_opening_proof(commitment_key, prover_opening_claims, prover_transcript);

        Builder builder;
        StdlibProof stdlib_proof(builder, prover_transcript->export_proof());
        auto stdlib_verifier_transcript = std::make_shared<Transcript>();
        stdlib_verifier_transcript->load_proof(stdlib_proof);
        [[maybe_unused]] auto _ = stdlib_verifier_transcript->template receive_from_prover<Fr>("Init");

        auto stdlib_unshifted_commitments =
            convert_commitments_to_witnesses(builder, mock_claims.claim_batcher.get_unshifted().commitments);
        auto stdlib_shifted_commitments =
            convert_commitments_to_witnesses(builder, mock_claims.claim_batcher.get_shifted().commitments);

        auto stdlib_unshifted_evaluations =
            convert_elements_to_witnesses(builder, mock_claims.claim_batcher.get_unshifted().evaluations);
        auto stdlib_shifted_evaluations =
            convert_elements_to_witnesses(builder, mock_claims.claim_batcher.get_shifted().evaluations);

        std::vector<Fr> u_challenge_in_circuit = convert_elements_to_witnesses(builder, u_challenge);

        ClaimBatcher claim_batcher{
            .unshifted = ClaimBatch{ RefVector(stdlib_unshifted_commitments), RefVector(stdlib_unshifted_evaluations) },
            .shifted = ClaimBatch{ RefVector(stdlib_shifted_commitments), RefVector(stdlib_shifted_evaluations) }
        };

        ClaimBatcher squashed_claim_batcher;
        Commitment squashed_unshifted_comm;
        Commitment squashed_shifted_comm;
        Fr squashed_unshifted_eval;
        Fr squashed_shifted_eval;
        if constexpr (short_scalars) {

            // Helper that produces the vectors of batching challenges that will be fed to `batch_mul`
            auto get_batching_challenges = [&](const std::array<std::string, num_polys - 1>& unshifted_labels,
                                               const std::array<std::string, num_shifted>& shifted_labels) {
                // `batch_mul` expects a vector of scalars.
                std::vector<Fr> unshifted_challenges(num_polys);
                // Except for the first commitment, each one of them is multiplied by a challenge, which is <= 128
                // bits.
                unshifted_challenges[0] = Fr(1);
                // Get `num_polys - 1` short challenges to batch all unshifted commitments
                auto tail = stdlib_verifier_transcript->template get_challenges<Fr>(unshifted_labels);
                std::copy(tail.begin(), tail.end(), unshifted_challenges.begin() + 1);

                // Get `num_shifted` short challenges to batch all shifted commitments
                auto shifted = stdlib_verifier_transcript->template get_challenges<Fr>(shifted_labels);
                std::vector<Fr> shifted_challenges(shifted.begin(), shifted.end());

                return std::pair{ std::move(unshifted_challenges), std::move(shifted_challenges) };
            };

            auto [unshifted_challenges, shifted_challenges] =
                get_batching_challenges(unshifted_batching_challenge_labels, shifted_batching_challenge_labels);

            // Track the number of ECCVM rows being added by a `batch_mul` call.
            size_t num_rows_before_msm = builder.op_queue->get_num_rows();

            squashed_unshifted_comm =
                Commitment::batch_mul(claim_batcher.get_unshifted().commitments, unshifted_challenges);

            size_t num_rows_after_msm = builder.op_queue->get_num_rows();
            // Since the first coefficient is 1, we subtract 1.
            size_t ceil = (num_polys - 1 + 3) / 4;
            // Check that the number of new rows is as expected.
            EXPECT_EQ(num_rows_after_msm - num_rows_before_msm, 33 * ceil + 31);

            // Track the number of ECCVM rows added by batching all shifted commitments
            num_rows_before_msm = num_rows_after_msm;

            squashed_shifted_comm = Commitment::batch_mul(claim_batcher.get_shifted().commitments, shifted_challenges);
            num_rows_after_msm = builder.op_queue->get_num_rows();
            // Check that the number of new rows is as expected.
            EXPECT_EQ(num_rows_after_msm - num_rows_before_msm, 33 * ((num_shifted + 3) / 4) + 31);

            // Compute claimed evaluations
            squashed_unshifted_eval = std::inner_product(unshifted_challenges.begin(),
                                                         unshifted_challenges.end(),
                                                         claim_batcher.get_unshifted().evaluations.begin(),
                                                         Fr(0));
            squashed_shifted_eval = std::inner_product(shifted_challenges.begin(),
                                                       shifted_challenges.end(),
                                                       claim_batcher.get_shifted().evaluations.begin(),
                                                       Fr(0));

            squashed_claim_batcher = ClaimBatcher{
                .unshifted = ClaimBatch{ RefVector(squashed_unshifted_comm), RefVector(squashed_unshifted_eval) },
                .shifted = ClaimBatch{ RefVector(squashed_shifted_comm), RefVector(squashed_shifted_eval) }
            };
        } else {
            squashed_claim_batcher = claim_batcher;
        }

        const auto opening_claim = ShpleminiVerifier::compute_batch_opening_claim(padding_indicator_array,
                                                                                  squashed_claim_batcher,
                                                                                  u_challenge_in_circuit,
                                                                                  Commitment::one(&builder),
                                                                                  stdlib_verifier_transcript);

        auto pairing_points = KZG<Curve>::reduce_verify_batch_opening_claim(opening_claim, stdlib_verifier_transcript);
        EXPECT_TRUE(CircuitChecker::check(builder));

        VerifierCommitmentKey<NativeCurve> vk;
        EXPECT_EQ(vk.pairing_check(pairing_points[0].get_value(), pairing_points[1].get_value()), true);

        if constexpr (std::is_same_v<Builder, MegaCircuitBuilder>) {
            info("eccvm rows ", builder.op_queue->get_num_rows());
        }
        info("builder num gates ", builder.get_estimated_num_finalized_gates());

        return builder.num_gates;
    }
};

struct ShpleminiUltraPCS {
    using Builder = UltraCircuitBuilder;
    using Curve = stdlib::bn254<Builder>;
    using PCSImpl = std::conditional_t<std::same_as<typename Curve::NativeCurve, curve::BN254>,
                                       KZG<typename Curve::NativeCurve>,
                                       IPA<typename Curve::NativeCurve>>;
};

struct ShpleminiMegaPCS {
    using Builder = MegaCircuitBuilder;
    using Curve = stdlib::bn254<Builder>;
    using PCSImpl = KZG<typename Curve::NativeCurve>;
};

using ShpleminiUltraTest = ShpleminiRecursionTest<ShpleminiUltraPCS>;
using ShpleminiMegaTest = ShpleminiRecursionTest<ShpleminiMegaPCS>;

TEST_F(ShpleminiUltraTest, ProveAndVerifySingleFullScalars)
{
    run_shplemini_full_scalars<13, 5>(10);
}

TEST_F(ShpleminiMegaTest, ProveAndVerifySingleFullScalars)
{
    run_shplemini_full_scalars<13, 5>(10);
}

TEST_F(ShpleminiMegaTest, GoblinProveAndVerifyShortScalars)
{
    run_shplemini_short_scalars<13, 5>(10);
    run_shplemini_short_scalars<14, 6>(10);
    run_shplemini_short_scalars<15, 7>(10);
    run_shplemini_short_scalars<16, 8>(10);
}
