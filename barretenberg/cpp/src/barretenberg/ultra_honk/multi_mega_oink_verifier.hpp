// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/flavor/multi_mega_flavor.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"

namespace bb {

/**
 * @brief Specialized OinkVerifier for MultiMegaFlavor that receives interleaved commitments.
 * @details This class receives 9 interleaved commitments instead of 24 individual ones.
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
 */
class MultiMegaOinkVerifier {
    using Flavor = MultiMegaFlavor;
    using Transcript = typename Flavor::Transcript;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using SubrelationSeparator = typename Flavor::SubrelationSeparator;
    using Instance = bb::VerifierInstance_<Flavor>;

  public:
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<Instance> verifier_instance;
    std::string domain_separator;
    typename Flavor::InterleavedCommitmentLabels interleaved_labels;
    bb::RelationParameters<FF> relation_parameters;

    // Storage for interleaved commitments
    typename Flavor::InterleavedCommitments interleaved_comms;

    // Number of public inputs - provided by caller
    size_t num_public_inputs;

    MultiMegaOinkVerifier(const std::shared_ptr<Instance>& verifier_instance,
                          const std::shared_ptr<Transcript>& transcript,
                          size_t num_public_inputs,
                          std::string domain_separator = "")
        : transcript(transcript)
        , verifier_instance(verifier_instance)
        , domain_separator(std::move(domain_separator))
        , num_public_inputs(num_public_inputs)
    {}

    void verify();

    void execute_preamble_round();
    void execute_wire_commitments_round();
    void execute_sorted_list_accumulator_round();
    void execute_log_derivative_inverse_round();
    void execute_grand_product_computation_round();
    SubrelationSeparator generate_alpha_round();
};

} // namespace bb
