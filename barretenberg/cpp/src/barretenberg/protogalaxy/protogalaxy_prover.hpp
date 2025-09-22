// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/honk/execution_trace/execution_trace_usage_tracker.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/protogalaxy/constants.hpp"
#include "barretenberg/protogalaxy/folding_result.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover_internal.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"

namespace bb {

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1437): Change template params back to ProverInstances
// TODO(https://github.com/AztecProtocol/barretenberg/issues/1239): clean out broken support for multi-folding
template <IsUltraOrMegaHonk Flavor> class ProtogalaxyProver_ {
  public:
    static constexpr size_t NUM_SUBRELATIONS = Flavor::NUM_SUBRELATIONS;
    static constexpr size_t EXTENDED_LENGTH = computed_extended_length<Flavor>();
    static constexpr size_t BATCHED_EXTENDED_LENGTH = computed_batched_extended_length<Flavor>();

    using ProverInstance = ProverInstance_<Flavor>;
    using VerifierInstance = VerifierInstance_<Flavor>;
    using FF = typename Flavor::FF;
    using CombinerQuotient = Univariate<FF, BATCHED_EXTENDED_LENGTH, NUM_INSTANCES>;
    using TupleOfTuplesOfUnivariates = typename Flavor::template ProtogalaxyTupleOfTuplesOfUnivariates<NUM_INSTANCES>;
    using UnivariateRelationParameters =
        bb::RelationParameters<Univariate<FF, EXTENDED_LENGTH, 0, /*skip_count=*/SKIP_COUNT>>;
    using UnivariateSubrelationSeparators = std::array<Univariate<FF, BATCHED_EXTENDED_LENGTH>, NUM_SUBRELATIONS - 1>;

    using Transcript = typename Flavor::Transcript;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using PGInternal = ProtogalaxyProverInternal<ProverInstance>;

    using ProverInstances = std::array<std::shared_ptr<ProverInstance>, NUM_INSTANCES>;
    using VerifierInstances = std::array<std::shared_ptr<VerifierInstance>, NUM_INSTANCES>;

    ProverInstances prover_insts_to_fold;
    VerifierInstances verifier_insts_to_fold;
    CommitmentKey commitment_key;

    // the state updated and carried forward beween rounds
    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>();
    std::shared_ptr<ProverInstance> accumulator;
    Polynomial<FF> perturbator;
    std::vector<FF> deltas;
    CombinerQuotient combiner_quotient;
    FF perturbator_evaluation;
    UnivariateRelationParameters relation_parameters;
    UnivariateSubrelationSeparators alphas;

    PGInternal pg_internal;

    ProtogalaxyProver_() = default;
    ProtogalaxyProver_(const ProverInstances& prover_insts,
                       const VerifierInstances& verifier_insts,
                       const std::shared_ptr<Transcript>& transcript,
                       ExecutionTraceUsageTracker trace_usage_tracker = ExecutionTraceUsageTracker{})
        : prover_insts_to_fold(prover_insts)
        , verifier_insts_to_fold(verifier_insts)
        , commitment_key(prover_insts_to_fold[1]->commitment_key)
        , transcript(transcript)
        , pg_internal(trace_usage_tracker)
    {}

    /**
     * @brief For each Prover instance derived from a circuit, prior to folding, we need to complete the computation of
     * its polynomials (some of which require generating relation parameters first); commit to witnesses and generate
     * the relation parameters; and send the public data ϕ of the instance to the verifier (which will represent the
     * verifier instance).
     *
     * @param domain_separator a label used for tracking data in the transcript
     */
    void run_oink_prover_on_one_incomplete_instance(std::shared_ptr<ProverInstance>,
                                                    std::shared_ptr<VerifierInstance>,
                                                    const std::string& domain_separator);

    /**
     * @brief Create inputs to folding protocol (an Oink interaction).
     * @details Complete all Prover instances that will be folded: complete computation of all the witness polynomials
     * and compute commitments. Send commitments to the verifier and retrieve challenges.
     */
    void run_oink_prover_on_each_incomplete_instance();

    /**
     * @brief Steps 2 - 5 of the paper.
     * @details Compute perturbator (F polynomial in paper). Send all but the constant coefficient to verifier.
     *
     * @param accumulator
     * @return std::tuple<std::vector<FF>, Polynomial<FF>> deltas, perturbator
     */
    std::tuple<std::vector<FF>, Polynomial<FF>> perturbator_round(
        const std::shared_ptr<const ProverInstance>& accumulator);

    /**
     * @brief Steps 6 - 11 of the paper.
     * @details Compute combiner (G polynomial in the paper) and then its quotient (K polynomial), whose coefficients
     * will be sent to the verifier.
     */
    std::tuple<std::vector<FF>, UnivariateSubrelationSeparators, UnivariateRelationParameters, FF, CombinerQuotient>
    combiner_quotient_round(const std::vector<FF>& gate_challenges,
                            const std::vector<FF>& deltas,
                            const ProverInstances& instances);

    /**
     * @brief Steps 12 - 13 of the paper plus the prover folding work.
     * @details Compute \f$ e^* \f$ (the new target sum), then update the prover accumulator by taking a
     * Lagrange-linear combination of the current accumulator and the prover instances to be folded. In our mental
     * model, we are doing a scalar multiplication of matrices whose columns are polynomials, as well as taking similar
     * linear combinations of the relation parameters.
     */
    void update_target_sum_and_fold(const ProverInstances& instances,
                                    const CombinerQuotient& combiner_quotient,
                                    const UnivariateSubrelationSeparators& alphas,
                                    const UnivariateRelationParameters& univariate_relation_parameters,
                                    const FF& perturbator_evaluation);

    /**
     * @brief Execute the folding prover.
     *
     * @return FoldingResult is a pair consisting of the new accumulator and a folding proof, which is a proof that the
     * accumulator was computed correctly.
     */
    BB_PROFILE FoldingResult<Flavor> prove();

  private:
    /**
     * @brief Get the maximum dyadic circuit size among all prover instances
     * @return The maximum dyadic size
     */
    size_t get_max_dyadic_size() const
    {
        return std::ranges::max(prover_insts_to_fold | std::views::transform([](const auto& inst) {
                                    return inst != nullptr ? inst->dyadic_size() : 0;
                                }));
    }
};
} // namespace bb
