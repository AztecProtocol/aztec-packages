// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/ultra_honk/decider_verification_key.hpp"

namespace bb {

/**
 * @brief Verifier class for all the presumcheck rounds, which are shared between the folding verifier and ultra
 * verifier.
 * @details This class contains execute_preamble_round(), execute_wire_commitments_round(),
 * execute_sorted_list_accumulator_round(), execute_log_derivative_inverse_round(), and
 * execute_grand_product_computation_round().
 *
 * @tparam Flavor
 */
template <IsUltraOrMegaHonk Flavor> class OinkVerifier {
    using DeciderVK = DeciderVerificationKey_<Flavor>;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using Transcript = typename Flavor::Transcript;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using RelationSeparator = typename Flavor::RelationSeparator;

  public:
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<DeciderVK> verification_key;
    std::string domain_separator;
    typename Flavor::CommitmentLabels comm_labels;
    bb::RelationParameters<FF> relation_parameters;
    WitnessCommitments witness_comms;
    std::vector<FF> public_inputs;

    OinkVerifier(const std::shared_ptr<DeciderVK>& verification_key,
                 const std::shared_ptr<Transcript>& transcript,
                 std::string domain_separator = "")
        : transcript(transcript)
        , verification_key(verification_key)
        , domain_separator(std::move(domain_separator))
    {}

    void verify();

    void execute_preamble_round();

    void execute_wire_commitments_round();

    void execute_sorted_list_accumulator_round();

    void execute_log_derivative_inverse_round();

    void execute_grand_product_computation_round();

    RelationSeparator generate_alphas_round();
};
} // namespace bb