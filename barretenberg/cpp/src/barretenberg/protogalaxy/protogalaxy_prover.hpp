#pragma once
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/protogalaxy/folding_result.hpp"

namespace bb {

template <class DeciderProvingKeys_> class ProtogalaxyProver_ {
  public:
    using DeciderProvingKey = typename DeciderProvingKeys_::DeciderPK;
    using Flavor = typename DeciderProvingKeys_::Flavor;
    using FF = typename DeciderProvingKeys_::Flavor::FF;
    static constexpr size_t NUM_KEYS = DeciderProvingKeys_::NUM;
    using CombinerQuotient = Univariate<FF, DeciderProvingKeys_::BATCHED_EXTENDED_LENGTH, NUM_KEYS>;
    using TupleOfTuplesOfUnivariatesNoOptimisticSkipping =
        typename Flavor::template ProtogalaxyTupleOfTuplesOfUnivariatesNoOptimisticSkipping<NUM_KEYS>;
    using TupleOfTuplesOfUnivariates = typename Flavor::template ProtogalaxyTupleOfTuplesOfUnivariates<NUM_KEYS>;
    using UnivariateRelationParameters =
        bb::RelationParameters<Univariate<FF, DeciderProvingKeys_::EXTENDED_LENGTH, 0, /*skip_count=*/NUM_KEYS - 1>>;
    using UnivariateRelationSeparator =
        std::array<Univariate<FF, DeciderProvingKeys_::BATCHED_EXTENDED_LENGTH>, Flavor::NUM_SUBRELATIONS - 1>;

    using Transcript = typename Flavor::Transcript;
    using DeciderPK = typename DeciderProvingKeys_::DeciderPK;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using DeciderProvingKeys = DeciderProvingKeys_;
    using RelationEvaluations = typename Flavor::TupleOfArraysOfValues; // WORKTODO: del?
    using ComponentEvaluations = typename Flavor::ComponentEvaluations;

    static constexpr size_t NUM_SUBRELATIONS = DeciderProvingKeys_::NUM_SUBRELATIONS;

    DeciderProvingKeys_ keys_to_fold;
    std::shared_ptr<CommitmentKey> commitment_key;

    // the state updated and carried forward beween rounds
    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>();
    std::shared_ptr<DeciderProvingKey> accumulator;
    std::shared_ptr<ComponentEvaluations[]> component_evaluations;
    Polynomial<FF> perturbator;
    std::vector<FF> deltas;
    CombinerQuotient combiner_quotient;
    FF perturbator_evaluation;
    UnivariateRelationParameters relation_parameters;
    UnivariateRelationSeparator alphas;

    ProtogalaxyProver_() = default;
    ProtogalaxyProver_(const std::vector<std::shared_ptr<DeciderPK>>& keys)
        : keys_to_fold(DeciderProvingKeys_(keys))
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/878)
        , commitment_key(keys_to_fold[1]->proving_key.commitment_key){};

    /**
     * @brief For each key produced by a circuit, prior to folding, we need to complete the computation of its
     * prover polynomials; commit to witnesses and generate the relation parameters; and send the public data ϕ of
     * the key to the verifier.
     *
     * @param domain_separator a label used for tracking data in the transcript
     */
    void run_oink_prover_on_one_incomplete_key(std::shared_ptr<DeciderPK>, const std::string& domain_separator);

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
    std::tuple<std::vector<FF>, std::shared_ptr<ComponentEvaluations[]>, Polynomial<FF>> perturbator_round(
        const std::shared_ptr<const DeciderPK>& accumulator);

    /**
     * @brief Steps 6 - 11 of the paper.
     * @details Compute combiner (G polynomial in the paper) and then its quotient (K polynomial), whose coefficient
     * will be sent to the verifier.
     */
    std::tuple<std::vector<FF>, UnivariateRelationSeparator, UnivariateRelationParameters, FF, CombinerQuotient>
    combiner_quotient_round(const std::vector<FF>& gate_challenges,
                            const std::vector<FF>& deltas,
                            const DeciderProvingKeys_& keys,
                            const std::shared_ptr<ComponentEvaluations[]>& component_evaluations);

    /**
     * @brief Steps 12 - 13 of the paper plus the prover folding work.
     * @details Compute \f$ e^* \f$ plus, then update the prover accumulator by taking a Lagrange-linear combination of
     * the current accumulator and the decider keys to be folded. In our mental model, we are doing a scalar
     * multiplication of matrices whose columns are polynomials, as well as taking similar linear combinations of the
     * relation parameters.
     */
    FoldingResult<Flavor> update_target_sum_and_fold(const DeciderProvingKeys_& keys,
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