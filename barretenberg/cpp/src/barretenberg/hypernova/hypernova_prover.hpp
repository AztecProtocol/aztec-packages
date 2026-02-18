// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once
#include "barretenberg/flavor/multi_mega_flavor.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_claims.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/multi_mega_oink_prover.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

namespace bb {

/**
 * @brief HyperNova folding prover. Folds circuit instances into accumulators, deferring PCS verification.
 * @details See: chonk/README.md#hypernova-folding-details
 *
 * ## Accumulator Concept
 *
 * An Accumulator represents batched polynomial evaluation claims from one or more circuits.
 * Instead of verifying each circuit's PCS separately, we batch claims into an accumulator
 * and defer verification to a final "decider" proof. This enables efficient recursion.
 *
 * Each accumulator contains:
 *   - challenge: The evaluation point (from Sumcheck)
 *   - non_shifted_{polynomial,commitment,evaluation}: Batched claims for standard polynomials
 *   - shifted_{polynomial,commitment,evaluation}: Batched claims for shifted polynomials
 *
 * ## Shifted vs Unshifted Polynomials
 *
 * - **Unshifted**: Standard witness/selector polynomials evaluated at point r
 * - **Shifted**: Polynomials referencing the "next row" in relations. We enforce p(0) = 0,
 *   so p(X)/X is a polynomial. The shift is p(X)/X evaluated at r, i.e., p(r)/r.
 *   Same commitment works for both p and its shift (no separate commitment needed).
 *
 * The batching formula: batched = Σᵢ ρᵢ·pᵢ where ρᵢ are Fiat-Shamir challenges.
 */
class HypernovaFoldingProver {
  public:
    using Flavor = MultiMegaFlavor;
    using FF = Flavor::FF;
    using Commitment = Flavor::Commitment;
    using ProverInstance = ProverInstance_<Flavor>;
    using Accumulator = MultilinearBatchingProverClaim;
    using VerificationKey = Flavor::VerificationKey;
    using MegaOinkProver = MultiMegaOinkProver_<Flavor>;
    using MegaSumcheckProver = SumcheckProver<Flavor>;
    using MegaSumcheckOutput = SumcheckOutput<Flavor>;
    using Transcript = Flavor::Transcript;

    // Batching uses interleaved polynomial groups (17 unshifted, 3 shifted) instead of individual polynomials.
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = Flavor::NUM_ALL_INTERLEAVED_COMMITMENTS;
    static constexpr size_t NUM_SHIFTED_ENTITIES = Flavor::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS;
    static constexpr size_t BATCH_SIZE = Flavor::INTERLEAVING_BATCH_SIZE;

    HypernovaFoldingProver(std::shared_ptr<Transcript> transcript)
        : transcript(std::move(transcript)) {};

    /**
     * @brief Turn an instance into an accumulator by running Sumcheck.
     *
     * @param instance
     * @return Accumulator
     */
    Accumulator instance_to_accumulator(const std::shared_ptr<ProverInstance>& instance,
                                        const std::shared_ptr<VerificationKey>& honk_vk = nullptr);

    /**
     * @brief Fold an instance into an accumulator.
     * @details Takes ownership of accumulator via move - the old accumulator's data is consumed
     * and a new accumulator is returned. This enables zero-copy flow through the proving pipeline.
     *
     * @param accumulator Moved into the fold operation (consumed)
     * @param instance The new instance to fold in
     * @return std::pair<HonkProof, Accumulator> The proof and new accumulator (owns the combined data)
     */
    std::pair<HonkProof, Accumulator> fold(Accumulator&& accumulator,
                                           const std::shared_ptr<ProverInstance>& instance,
                                           const std::shared_ptr<VerificationKey>& honk_vk = nullptr);

    /**
     * @brief Export the proof contained in the transcript
     *
     * @return HonkProof
     */
    HonkProof export_proof() { return transcript->export_proof(); };

  private:
    std::shared_ptr<Transcript> transcript;

    /**
     * @brief Convert the output of the sumcheck run on the incoming instance into an accumulator.
     * @details Constructs interleaved polynomials from groups, batches them and the interleaved
     *          commitments, computes evaluations via Lagrange basis, and prepends interleaving
     *          challenges to the sumcheck challenge vector.
     */
    Accumulator sumcheck_output_to_accumulator(MegaSumcheckOutput& sumcheck_output,
                                               const std::shared_ptr<ProverInstance>& instance,
                                               const MegaOinkProver& oink_prover);

    /**
     * @brief Construct an interleaved polynomial from a group of up to BATCH_SIZE individual polynomials.
     * @details For group (p0, p1, ..., p_{k-1}), constructs F where F[BATCH_SIZE*i + j] = p_j[i].
     */
    static Polynomial<FF> construct_interleaved_polynomial(const std::vector<Polynomial<FF> const*>& group,
                                                           size_t individual_poly_size,
                                                           bool shiftable = false);

    /**
     * @brief Utility to perform batch mul of commitments.
     */
    template <size_t N> Commitment batch_mul(const RefArray<Commitment, N>& _points, const std::vector<FF>& scalars);
};

} // namespace bb
