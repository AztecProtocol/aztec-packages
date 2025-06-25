// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/honk/execution_trace/execution_trace_usage_tracker.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/protogalaxy/folding_result.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover_internal.hpp"
#include "barretenberg/ultra_honk/decider_keys.hpp"

namespace bb {

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1437): Change template params back to DeciderProvingKeys
template <IsUltraOrMegaHonk Flavor, size_t NUM_KEYS = 2> class ProtogalaxyProver_ {
  public:
    using DeciderProvingKeys = DeciderProvingKeys_<Flavor, NUM_KEYS>;
    using DeciderVerificationKeys = DeciderVerificationKeys_<Flavor, NUM_KEYS>;
    using FF = typename Flavor::FF;
    using CombinerQuotient = Univariate<FF, DeciderProvingKeys::BATCHED_EXTENDED_LENGTH, NUM_KEYS>;
    using TupleOfTuplesOfUnivariates = typename Flavor::template ProtogalaxyTupleOfTuplesOfUnivariates<NUM_KEYS>;
    using UnivariateRelationParameters =
        bb::RelationParameters<Univariate<FF, DeciderProvingKeys::EXTENDED_LENGTH, 0, /*skip_count=*/NUM_KEYS - 1>>;
    using UnivariateRelationSeparator =
        std::array<Univariate<FF, DeciderProvingKeys::BATCHED_EXTENDED_LENGTH>, Flavor::NUM_SUBRELATIONS - 1>;

    using Transcript = typename Flavor::Transcript;
    using DeciderPK = DeciderProvingKeys::DeciderPK;
    using DeciderVK = DeciderVerificationKeys::DeciderVK;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using PGInternal = ProtogalaxyProverInternal<DeciderProvingKeys>;

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1239): clean out broken support for multi-folding
    static_assert(DeciderProvingKeys::NUM == 2, "Protogalaxy currently only supports folding one instance at a time.");

    static constexpr size_t NUM_SUBRELATIONS = DeciderProvingKeys::NUM_SUBRELATIONS;

    DeciderProvingKeys keys_to_fold;
    DeciderVerificationKeys vks_to_fold;
    CommitmentKey commitment_key;

    // the state updated and carried forward beween rounds
    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>();
    std::shared_ptr<DeciderPK> accumulator;
    Polynomial<FF> perturbator;
    std::vector<FF> deltas;
    CombinerQuotient combiner_quotient;
    FF perturbator_evaluation;
    UnivariateRelationParameters relation_parameters;
    UnivariateRelationSeparator alphas;

    PGInternal pg_internal;

    ProtogalaxyProver_() = default;
    ProtogalaxyProver_(const std::vector<std::shared_ptr<DeciderPK>>& keys,
                       const std::vector<std::shared_ptr<DeciderVK>>& vks,
                       const std::shared_ptr<Transcript>& transcript,
                       ExecutionTraceUsageTracker trace_usage_tracker = ExecutionTraceUsageTracker{})
        : keys_to_fold(DeciderProvingKeys_(keys))
        , vks_to_fold(DeciderVerificationKeys_(vks))
        , commitment_key(keys_to_fold[1]->proving_key.commitment_key)
        , transcript(transcript)
        , pg_internal(trace_usage_tracker)
    {
        BB_ASSERT_EQ(keys.size(), NUM_KEYS, "Number of prover keys does not match the number of keys to fold");
        BB_ASSERT_EQ(
            vks.size(), NUM_KEYS, "Number of verification keys does not match the number of vks to Fiat-Shamir");
    }

    /**
     * @brief For each key produced by a circuit, prior to folding, we need to complete the computation of its
     * prover polynomials; commit to witnesses and generate the relation parameters; and send the public data ϕ of
     * the key to the verifier.
     *
     * @param domain_separator a label used for tracking data in the transcript
     */
    void run_oink_prover_on_one_incomplete_key(std::shared_ptr<DeciderPK>,
                                               std::shared_ptr<DeciderVK>,
                                               const std::string& domain_separator);

    /**
     * @brief Create inputs to folding protocol (an Oink interaction).
     * @details Complete the decider pks that will be folded: complete computation of all the witness polynomials
     * and compute commitments. Send commitments to the verifier and retrieve challenges.
     */
    void run_oink_prover_on_each_incomplete_key();

    /**
     * @brief Steps 2 - 5 of the paper.
     * @details Compute perturbator (F polynomial in paper). Send all but the constant coefficient to verifier.
     *
     * @param accumulator
     * @return std::tuple<std::vector<FF>, Polynomial<FF>> deltas, perturbator
     */
    std::tuple<std::vector<FF>, Polynomial<FF>> perturbator_round(const std::shared_ptr<const DeciderPK>& accumulator);

    /**
     * @brief Steps 6 - 11 of the paper.
     * @details Compute combiner (G polynomial in the paper) and then its quotient (K polynomial), whose coefficient
     * will be sent to the verifier.
     */
    std::tuple<std::vector<FF>, UnivariateRelationSeparator, UnivariateRelationParameters, FF, CombinerQuotient>
    combiner_quotient_round(const std::vector<FF>& gate_challenges,
                            const std::vector<FF>& deltas,
                            const DeciderProvingKeys& keys);

    /**
     * @brief Steps 12 - 13 of the paper plus the prover folding work.
     * @details Compute \f$ e^* \f$ plus, then update the prover accumulator by taking a Lagrange-linear combination of
     * the current accumulator and the decider keys to be folded. In our mental model, we are doing a scalar
     * multiplication of matrices whose columns are polynomials, as well as taking similar linear combinations of the
     * relation parameters.
     */
    void update_target_sum_and_fold(const DeciderProvingKeys& keys,
                                    const CombinerQuotient& combiner_quotient,
                                    const UnivariateRelationSeparator& alphas,
                                    const UnivariateRelationParameters& univariate_relation_parameters,
                                    const FF& perturbator_evaluation);

    /**
     * @brief Execute the folding prover.
     *
     * @return FoldingResult is a pair consisting of an accumulator and a folding proof, which is a proof that the
     * accumulator was computed correctly.
     */
    BB_PROFILE FoldingResult<Flavor> prove();
};
} // namespace bb
