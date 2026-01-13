// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/ultra_honk/verifier_instance.hpp"

namespace bb {

/**
 * @brief Verifier class for all the presumcheck rounds, which are shared between the folding verifier and ultra
 * verifier.
 * @details This class contains execute_preamble_round(), execute_wire_commitments_round(),
 * execute_sorted_list_accumulator_round(), execute_log_derivative_inverse_round(), and
 * execute_grand_product_computation_round().
 *
 * Works with both native and recursive flavors. When instantiated with a recursive flavor (IsRecursiveFlavor<Flavor>),
 * automatically handles the differences in VK access and VK hash assertion.
 *
 * @tparam Flavor Native or recursive flavor
 */
template <typename Flavor> class OinkVerifier {
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using Transcript = typename Flavor::Transcript;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using SubrelationSeparator = typename Flavor::SubrelationSeparator;
    using Instance = bb::VerifierInstance_<Flavor>;

  public:
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<Instance> verifier_instance;
    std::string domain_separator;
    typename Flavor::CommitmentLabels comm_labels;
    bb::RelationParameters<FF> relation_parameters;
    WitnessCommitments witness_comms;

    OinkVerifier(const std::shared_ptr<Instance>& verifier_instance,
                 const std::shared_ptr<Transcript>& transcript,
                 std::string domain_separator = "")
        : transcript(transcript)
        , verifier_instance(verifier_instance)
        , domain_separator(std::move(domain_separator))
    {}

    void verify();

    void execute_preamble_round();

    void execute_wire_commitments_round();

    void execute_sorted_list_accumulator_round();

    void execute_log_derivative_inverse_round();

    void execute_grand_product_computation_round();

    SubrelationSeparator generate_alpha_round();

  private:
    /**
     * @brief Helper to get number of public inputs, abstracting differences between native and recursive flavors
     * @return Number of public inputs as size_t
     */
    size_t get_num_public_inputs() const
    {
        auto vk = verifier_instance->get_vk();
        if constexpr (IsRecursiveFlavor<Flavor>) {
            return static_cast<size_t>(static_cast<uint32_t>(vk->num_public_inputs.get_value()));
        } else {
            return static_cast<size_t>(vk->num_public_inputs);
        }
    }
};
} // namespace bb
