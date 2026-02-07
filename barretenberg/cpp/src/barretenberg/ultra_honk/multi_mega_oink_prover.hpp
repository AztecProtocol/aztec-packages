// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/flavor/flavor_concepts.hpp"
#include "barretenberg/flavor/multi_mega_flavor.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

namespace bb {

/**
 * @brief Specialized OinkProver for MultiMegaFlavor that uses interleaved commitments.
 * @details This class commits to batches of 4 polynomials using interleaved MSM, reducing
 *          the number of witness commitments from 24 to 9.
 *
 * Batching layout (9 interleaved witness commits):
 *
 * ROUND 1 (before eta) - 5 commits:
 *   W₁ (shiftable):   [w_l, w_r, w_o, ZERO]
 *   W₂ (unshiftable): [ecc_op_wire_1, ecc_op_wire_2, ecc_op_wire_3, ecc_op_wire_4]
 *   W₃ (unshiftable): [calldata, calldata_read_counts, calldata_read_tags, secondary_calldata]
 *   W₄ (unshiftable): [secondary_calldata_read_counts, secondary_calldata_read_tags, return_data,
 * return_data_read_counts] W₅ (unshiftable): [return_data_read_tags, ZERO, ZERO, ZERO]
 *
 * ROUND 2 (after eta) - 2 commits:
 *   W₆ (shiftable):   [w_4, ZERO, ZERO, ZERO]
 *   W₇ (unshiftable): [lookup_read_counts, lookup_read_tags, ZERO, ZERO]
 *
 * ROUND 3 (after beta/gamma) - 1 commit:
 *   W₈ (unshiftable): [lookup_inverses, calldata_inverses, secondary_calldata_inverses, return_data_inverses]
 *
 * ROUND 4 - 1 commit:
 *   W₉ (shiftable):   [z_perm, ZERO, ZERO, ZERO]
 *
 * @tparam Flavor_ MultiMegaFlavor or MultiMegaZKFlavor
 */
template <IsMultiMegaFlavor Flavor_> class MultiMegaOinkProver_ {
    using Flavor = Flavor_;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using HonkVK = typename Flavor::VerificationKey;
    using ProverInstance = ProverInstance_<Flavor>;
    using Transcript = typename Flavor::Transcript;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using Proof = typename Transcript::Proof;
    using Polynomial = typename Flavor::Polynomial;

    static constexpr size_t BATCH_SIZE = Flavor::INTERLEAVING_BATCH_SIZE;

  public:
    std::shared_ptr<ProverInstance> prover_instance;
    std::shared_ptr<HonkVK> honk_vk;
    std::shared_ptr<Transcript> transcript;
    std::string domain_separator;

    typename Flavor::CommitmentLabels commitment_labels;
    typename Flavor::InterleavedCommitmentLabels interleaved_labels;
    using SubrelationSeparator = typename Flavor::SubrelationSeparator;

    // Storage for interleaved commitments
    typename Flavor::InterleavedCommitments interleaved_commitments;

    MultiMegaOinkProver_(std::shared_ptr<ProverInstance> prover_instance,
                         std::shared_ptr<HonkVK> honk_vk,
                         const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>(),
                         std::string domain_separator = "")
        : prover_instance(prover_instance)
        , honk_vk(honk_vk)
        , transcript(transcript)
        , domain_separator(std::move(domain_separator))
    {}

    void prove();
    Proof export_proof();
    void execute_preamble_round();
    void commit_to_masking_poly();
    void execute_wire_commitments_round();
    void execute_sorted_list_accumulator_round();
    void execute_log_derivative_inverse_round();
    void execute_grand_product_computation_round();
    SubrelationSeparator generate_alpha_round();

  private:
    /**
     * @brief Commit to an interleaved group of polynomials and send to verifier.
     * @details If fewer than BATCH_SIZE polynomials are provided, zeros are used for missing slots
     *          (the MSM efficiently skips zero contributions).
     *
     * @param polynomials Array of polynomials to commit (can be less than BATCH_SIZE)
     * @param label Label for the transcript
     * @return Commitment to the interleaved polynomial
     */
    template <size_t NUM_POLYS>
    Commitment commit_interleaved_and_send(std::array<PolynomialSpan<const FF>, NUM_POLYS> polynomials,
                                           const std::string& label);
};

using MultiMegaOinkProver = MultiMegaOinkProver_<MultiMegaFlavor>;

} // namespace bb
