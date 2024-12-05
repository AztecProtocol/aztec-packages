#pragma once
// clang-format off
/*                                            )\   /|
*                                          .-/'-|_/ |
*                       __            __,-' (   / \/
*                   .-'"  "'-..__,-'""          -o.`-._
*                  /                                   '/
*          *--._ ./                                 _.--
*                |                              _.-'
*                :                           .-/
*                 \                       )_ /
*                  \                _)   / \(
*                    `.   /-.___.---'(  /   \\
*                     (  /   \\       \(     L\
*                      \(     L\       \\
*                       \\              \\
*                        L\              L\
*/
// clang-format on
#include <utility>

#include "barretenberg/plonk_honk_shared/execution_trace/execution_trace_usage_tracker.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"

namespace bb {
/**
 * @brief Class for all the oink rounds, which are shared between the folding prover and ultra prover.
 * @details This class contains execute_preamble_round(), execute_wire_commitments_round(),
 * execute_sorted_list_accumulator_round(), execute_log_derivative_inverse_round(), and
 * execute_grand_product_computation_round().
 *
 * @tparam Flavor
 */
template <IsUltraFlavor Flavor> class OinkProver {
    using CommitmentKey = typename Flavor::CommitmentKey;
    using DeciderPK = DeciderProvingKey_<Flavor>;
    using Transcript = typename Flavor::Transcript;
    using FF = typename Flavor::FF;

  public:
    std::shared_ptr<DeciderPK> proving_key;
    std::shared_ptr<Transcript> transcript;
    std::string domain_separator;
    ExecutionTraceUsageTracker trace_usage_tracker;

    typename Flavor::WitnessCommitments witness_commitments;
    typename Flavor::CommitmentLabels commitment_labels;
    using RelationSeparator = typename Flavor::RelationSeparator;

    OinkProver(std::shared_ptr<DeciderPK> proving_key,
               const std::shared_ptr<typename Flavor::Transcript>& transcript = std::make_shared<Transcript>(),
               std::string domain_separator = "",
               const ExecutionTraceUsageTracker& trace_usage_tracker = ExecutionTraceUsageTracker{})
        : proving_key(proving_key)
        , transcript(transcript)
        , domain_separator(std::move(domain_separator))
        , trace_usage_tracker(trace_usage_tracker)
    {}

    void prove();
    void execute_preamble_round();
    void execute_wire_commitments_round();
    void execute_sorted_list_accumulator_round();
    void execute_log_derivative_inverse_round();
    void execute_grand_product_computation_round();
    RelationSeparator generate_alphas_round();
};

using MegaOinkProver = OinkProver<MegaFlavor>;

} // namespace bb