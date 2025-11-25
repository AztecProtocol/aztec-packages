#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/commitment_key.test.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/commitment_schemes/utils/mock_witness_generator.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/padding_indicator_array/padding_indicator_array.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
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
    using Transcript = StdlibTranscript<Builder>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = typename ClaimBatcher::Batch;
    using MockClaimGen = MockClaimGenerator<NativeCurve>;
    using StdlibProof = bb::stdlib::Proof<Builder>;

    static constexpr size_t log_circuit_size = 10;

    ClaimBatcher squashed_claim_batcher;
    Commitment squashed_unshifted_comm;
    Commitment squashed_shifted_comm;
    Fr squashed_unshifted_eval;
    Fr squashed_shifted_eval;

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

    void validate_num_eccvm_rows(size_t num_polys, size_t num_shifted, bool short_scalars, Builder* builder)
    {
        size_t total_num_msm_rows = builder->op_queue->get_num_rows();

        BB_ASSERT_LTE(total_num_msm_rows, 1UL << CONST_ECCVM_LOG_N, "ECCVM/Goblin: Too many ops in ecc op queue");

        if (short_scalars) {

            const size_t num_non_trivial_scalars_gemini_and_shplonk =
                /* shifted + unshifted */ 2 + /* fold comms */ (log_circuit_size - 1) +
                /* identity comm */ 1 + /*kzg comm */ 1;

            const size_t num_msm_rows_unshifted = 33 * ((num_polys - 1 + 3) / 4) + 31;
            const size_t num_msm_rows_shifted = 33 * ((num_shifted + 3) / 4) + 31;

            EXPECT_EQ(total_num_msm_rows - num_msm_rows_shifted - num_msm_rows_unshifted,
                      33 * ((num_non_trivial_scalars_gemini_and_shplonk + 1) / 2) + 33);
        } else {
            const size_t num_non_trivial_scalars_gemini_and_shplonk =
                /* fold comms */ (log_circuit_size - 1) +
                /* identity comm */ 1 + /*kzg comm */ 1;

            EXPECT_EQ(33 * ((num_polys + num_shifted + num_non_trivial_scalars_gemini_and_shplonk + 1) / 2) + 33,
                      total_num_msm_rows);
        }
    }

    void run_shplemini_full_scalars(size_t num_polys, size_t num_shifted, bool prove_eccvm = false)
    {
        run_shplemini_generic(num_polys, num_shifted, false, prove_eccvm);
    }
    void run_shplemini_short_scalars(size_t num_polys, size_t num_shifted, bool prove_eccvm = false)
    {
        run_shplemini_generic(num_polys, num_shifted, true, prove_eccvm);
    }

  private:
    void run_shplemini_generic(size_t num_polys, size_t num_shifted, bool short_scalars, bool prove_eccvm)
    {
        size_t N = 1 << log_circuit_size;

        const auto padding_indicator_array =
            stdlib::compute_padding_indicator_array<Curve, log_circuit_size>(log_circuit_size);

        CommitmentKey commitment_key(16384);
        std::vector<NativeFr> u_challenge = random_challenge_vector(log_circuit_size);

        MockClaimGen mock_claims(N, num_polys, num_shifted, 0, u_challenge, commitment_key);
        auto prover_transcript = NativeTranscript::prover_init_empty();
        // Initialize polys outside of `if` as they are used inside RefVector ClaimBatcher members.
        Polynomial<NativeFr> squashed_unshifted(N);
        Polynomial<NativeFr> squashed_shifted(Polynomial<NativeFr>::shiftable(N));
        // Labels are shared by Prover and Verifier
        std::vector<std::string> unshifted_batching_challenge_labels;
        std::vector<std::string> shifted_batching_challenge_labels;

        for (size_t idx = 0; idx < num_polys - 1; idx++) {
            unshifted_batching_challenge_labels.push_back("rho_" + std::to_string(idx));
        }
        for (size_t idx = 0; idx < num_shifted; idx++) {
            shifted_batching_challenge_labels.push_back("rho_" + std::to_string(num_polys - 1 + idx));
        }

        if (short_scalars) {

            auto unshifted_challenges =
                prover_transcript->template get_challenges<NativeFr>(unshifted_batching_challenge_labels);
            auto shifted_challenges =
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
        auto stdlib_verifier_transcript = std::make_shared<Transcript>(stdlib_proof);
        [[maybe_unused]] auto _ = stdlib_verifier_transcript->template receive_from_prover<Fr>("Init");

        // Execute Verifier protocol without the need for vk prior the final check
        auto stdlib_unshifted_commitments =
            convert_commitments_to_witnesses(builder, mock_claims.claim_batcher.get_unshifted().commitments);
        auto stdlib_shifted_commitments =
            convert_commitments_to_witnesses(builder, mock_claims.claim_batcher.get_shifted().commitments);

        auto stdlib_unshifted_evaluations =
            convert_elements_to_witnesses(builder, mock_claims.claim_batcher.get_unshifted().evaluations);
        auto stdlib_shifted_evaluations =
            convert_elements_to_witnesses(builder, mock_claims.claim_batcher.get_shifted().evaluations);

        // Removing the free witness tag, since in the full scheme these are supposed to
        // be fiat-shamirred earlier from the transcript
        for (auto& comm : stdlib_unshifted_commitments) {
            comm.unset_free_witness_tag();
        }
        for (auto& comm : stdlib_shifted_commitments) {
            comm.unset_free_witness_tag();
        }
        for (auto& eval : stdlib_unshifted_evaluations) {
            eval.unset_free_witness_tag();
        }
        for (auto& eval : stdlib_shifted_evaluations) {
            eval.unset_free_witness_tag();
        }

        std::vector<Fr> u_challenge_in_circuit = convert_elements_to_witnesses(builder, u_challenge);
        // Removing the free witness tag, since the u_challenge in the full scheme are supposed to
        // be derived from the transcript earlier
        for (auto& challenge : u_challenge_in_circuit) {
            challenge.unset_free_witness_tag();
        }

        ClaimBatcher claim_batcher{
            .unshifted = ClaimBatch{ RefVector(stdlib_unshifted_commitments), RefVector(stdlib_unshifted_evaluations) },
            .shifted = ClaimBatch{ RefVector(stdlib_shifted_commitments), RefVector(stdlib_shifted_evaluations) }
        };

        if (short_scalars) {

            // Helper that produces the vectors of batching challenges that will be fed to `batch_mul`
            auto get_batching_challenges = [&](std::span<const std::string> unshifted_labels,
                                               std::span<const std::string> shifted_labels) {
                // `batch_mul` expects a vector of scalars.
                std::vector<Fr> unshifted_challenges(num_polys);
                // Except for the first commitment, each one of them is multiplied by a challenge, which is <= 128
                // bits.
                unshifted_challenges[0] = Fr(1);
                // Get `num_polys - 1` short challenges to batch all unshifted commitments
                auto tail = stdlib_verifier_transcript->template get_challenges<Fr>(unshifted_labels);
                std::copy(tail.begin(), tail.end(), unshifted_challenges.begin() + 1);

                // Get `num_shifted` short challenges to batch all shifted commitments
                auto shifted_challenges = stdlib_verifier_transcript->template get_challenges<Fr>(shifted_labels);

                return std::pair{ std::move(unshifted_challenges), std::move(shifted_challenges) };
            };

            auto [unshifted_challenges, shifted_challenges] =
                get_batching_challenges(unshifted_batching_challenge_labels, shifted_batching_challenge_labels);

            squashed_unshifted_comm =
                Commitment::batch_mul(claim_batcher.get_unshifted().commitments, unshifted_challenges, 128);

            squashed_shifted_comm =
                Commitment::batch_mul(claim_batcher.get_shifted().commitments, shifted_challenges, 128);

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
        stdlib::recursion::PairingPoints<stdlib::bn254<Builder>> pairing_points(
            KZG<Curve>::reduce_verify_batch_opening_claim(opening_claim, stdlib_verifier_transcript));
        EXPECT_TRUE(CircuitChecker::check(builder));

        VerifierCommitmentKey<NativeCurve> vk;
        EXPECT_EQ(vk.pairing_check(pairing_points.P0.get_value(), pairing_points.P1.get_value()), true);

        if constexpr (std::is_same_v<Builder, MegaCircuitBuilder>) {
            validate_num_eccvm_rows(num_polys, num_shifted, short_scalars, &builder);
            if (prove_eccvm) {
                builder.op_queue->merge();
                using clock = std::chrono::steady_clock;
                auto start_total = clock::now();

                std::shared_ptr<NativeTranscript> eccvm_transcript = std::make_shared<NativeTranscript>();

                auto start_builder = clock::now();
                ECCVMCircuitBuilder eccvm_builder(builder.op_queue);

                ECCVMProver prover(eccvm_builder, eccvm_transcript);

                auto end_builder = clock::now();

                info("ECCVM prover construction took ",
                     std::chrono::duration_cast<std::chrono::milliseconds>(end_builder - start_builder).count(),
                     " ms");

                auto start_prove = clock::now();
                prover.construct_proof();
                auto end_prove = clock::now();

                info("ECCVM proof construction took ",
                     std::chrono::duration_cast<std::chrono::milliseconds>(end_prove - start_prove).count(),
                     " ms");

                auto end_total = clock::now();
                info("ECCVM total (builder + proof) time: ",
                     std::chrono::duration_cast<std::chrono::milliseconds>(end_total - start_total).count(),
                     " ms");
            }
        } else {
            info("builder num gates ", builder.get_num_finalized_gates_inefficient());
        }
    }
};

struct ShpleminiUltraPCS {
    using Builder = UltraCircuitBuilder;
    using Curve = stdlib::bn254<Builder>;
    using PCSImpl = KZG<typename Curve::NativeCurve>;
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
    // In UltraRecursiveVerifier instantiations, we remove the scalar muls against the commitments to shifts.
    run_shplemini_full_scalars(bb::UltraFlavor::NUM_ALL_ENTITIES, 0);
}

TEST_F(ShpleminiUltraTest, ProveAndVerifySingleShortScalars)
{
    // We don't hit any edge cases here, because all commitments are random. Note that we are paying for the shifts
    // here.
    run_shplemini_short_scalars(bb::UltraFlavor::NUM_ALL_ENTITIES, bb::UltraFlavor::NUM_WITNESS_ENTITIES);
}

TEST_F(ShpleminiMegaTest, ProveAndVerifySingleFullScalars)
{
    size_t num_polys = 100;
    size_t num_shifted = 5;

    for (size_t idx = 0; idx < 4; idx++) {
        run_shplemini_full_scalars(num_polys + idx, num_shifted + idx);
    }
}

TEST_F(ShpleminiMegaTest, GoblinProveAndVerifyShortScalars)
{
    size_t num_polys = 100;
    size_t num_shifted = 5;

    for (size_t idx = 0; idx < 4; idx++) {
        run_shplemini_short_scalars(num_polys + idx, num_shifted + idx);
    }
}

TEST_F(ShpleminiMegaTest, ManyCommitmentsWithECCVMProving)
{
    run_shplemini_full_scalars(1700, 175, true);
    run_shplemini_short_scalars(3500, 350, true);
}
