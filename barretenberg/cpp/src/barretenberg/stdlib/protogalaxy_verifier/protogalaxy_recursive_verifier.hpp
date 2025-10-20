// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/protogalaxy/constants.hpp"
#include "barretenberg/protogalaxy/folding_result.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"

namespace bb::stdlib::recursion::honk {
template <class VerifierInstance> class ProtogalaxyRecursiveVerifier_ {
  public:
    using Flavor = typename VerifierInstance::Flavor;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using BaseField = typename Commitment::BaseField;
    using VKAndHash = typename Flavor::VKAndHash;
    using VerifierInstances = std::array<std::shared_ptr<VerifierInstance>, NUM_INSTANCES>;

    using Builder = typename Flavor::CircuitBuilder;
    using Transcript = StdlibTranscript<Builder>;

    static constexpr size_t EXTENDED_LENGTH = computed_extended_length<Flavor>();
    static constexpr size_t BATCHED_EXTENDED_LENGTH = computed_batched_extended_length<Flavor>();
    static constexpr size_t NUM_SUBRELATIONS = Flavor::NUM_SUBRELATIONS;

    Builder* builder;

    VerifierInstances insts_to_fold;

    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>();

    ProtogalaxyRecursiveVerifier_(Builder* builder,
                                  const std::shared_ptr<VerifierInstance>& accumulator,
                                  const std::shared_ptr<VKAndHash>& vk_and_hash,
                                  const std::shared_ptr<Transcript>& transcript)
        : builder(builder)
        , transcript(transcript)
    {
        insts_to_fold[0] = accumulator;
        insts_to_fold[1] = std::make_shared<VerifierInstance>(builder, vk_and_hash);
    };

    ProtogalaxyRecursiveVerifier_(Builder* builder,
                                  const std::shared_ptr<VerifierInstance>& accumulator,
                                  const std::shared_ptr<VerifierInstance>& incoming_instance,
                                  const std::shared_ptr<Transcript>& transcript)
        : builder(builder)
        , transcript(transcript)
    {
        insts_to_fold[0] = accumulator;
        insts_to_fold[1] = incoming_instance;
    };

    /**
     * @brief Process the public data \f$\phi\f$ for the verification keys to be folded.
     */
    void run_oink_verifier_on_each_incomplete_instance(const std::vector<FF>&);

    /**
     * @brief Run the folding protocol on the verifier side to establish whether the public data \f$\phi\f$ of the new
     * accumulator received from the prover is the same as that produced by the verifier.
     *
     * @note We update the first instance with which the verifier was constructed in-place. That is, the result of the
     * folding verification is stored in insts_to_fold[0] after the execution of this function.
     *
     * @note In the recursive setting this function doesn't return anything because the equality checks performed by
     * the recursive verifier, ensuring the folded \f$\phi^{\ast}\f$, \f$e^{\ast}\f$ and \f$\beta^{\ast}\f$ on the
     * verifier side correspond to what has been sent by the prover, are expressed as constraints.
     *
     * @details We run the Protogalaxy verifier with parameters k = 1 (we fold one instance/accumulator with an
     * instance) , n = 2^CONST_PG_LOG_N, and d = (Flavor::MAX_TOTAL_RELATION_LENGTH - 1) + 1 (the first term is the
     * maximum of the degrees of the subrelations considering relation parameters as variables, while the second term
     * comes from the batching challenges).
     */
    std::shared_ptr<VerifierInstance> verify_folding_proof(const stdlib::Proof<Builder>&);

  private:
    enum class FOLDING_DATA : std::uint8_t {
        PRECOMPUTED_COMMITMENTS,
        WITNESS_COMMITMENTS,
        ALPHAS,
        RELATION_PARAMETERS
    };

    /**
     * @brief Get data to be folded grouped by commitment index. Here the "commitment index" is the index of the
     * row in the matrix whose columns are given be the instance components to be folded.
     *
     * @tparam FoldingData The type of the parameter to be folded
     */
    template <FOLDING_DATA FoldingData> auto get_data_to_fold() const
    {
        using PrecomputedCommDataType = RefArray<Commitment, Flavor::NUM_PRECOMPUTED_ENTITIES>;
        using WitnessCommitmentsDataType = RefArray<Commitment, Flavor::NUM_WITNESS_ENTITIES>;
        using AlphasDataType = Flavor::SubrelationSeparators;
        using RelationParametersDataType = RefArray<FF, RelationParameters<FF>::NUM_TO_FOLD>;
        using DataType = std::conditional_t<
            FoldingData == FOLDING_DATA::PRECOMPUTED_COMMITMENTS,
            PrecomputedCommDataType,
            std::conditional_t<
                FoldingData == FOLDING_DATA::WITNESS_COMMITMENTS,
                WitnessCommitmentsDataType,
                std::conditional_t<FoldingData == FOLDING_DATA::ALPHAS, AlphasDataType, RelationParametersDataType>>>;

        std::array<DataType, NUM_INSTANCES> data;
        if constexpr (FoldingData == FOLDING_DATA::PRECOMPUTED_COMMITMENTS) {
            data[0] = insts_to_fold[0]->vk_and_hash->vk->get_all();
            data[1] = insts_to_fold[1]->vk_and_hash->vk->get_all();
        } else if constexpr (FoldingData == FOLDING_DATA::WITNESS_COMMITMENTS) {
            data[0] = insts_to_fold[0]->witness_commitments.get_all();
            data[1] = insts_to_fold[1]->witness_commitments.get_all();
        } else if constexpr (FoldingData == FOLDING_DATA::ALPHAS) {
            data[0] = insts_to_fold[0]->alphas;
            data[1] = insts_to_fold[1]->alphas;
        } else if constexpr (FoldingData == FOLDING_DATA::RELATION_PARAMETERS) {
            data[0] = insts_to_fold[0]->relation_parameters.get_to_fold();
            data[1] = insts_to_fold[1]->relation_parameters.get_to_fold();
        } else {
            throw_or_abort("Invalid folding data type.");
        }

        // Extract data type (strip references for storage in std::vector)
        using ReturnType = decltype(data[0][0]);
        using ReturnValue = std::remove_reference_t<ReturnType>;

        const size_t num_to_fold = data[0].size();
        std::vector<std::vector<ReturnValue>> result(num_to_fold, std::vector<ReturnValue>(NUM_INSTANCES));
        for (size_t idx = 0; auto& data_at_idx : result) {
            data_at_idx[0] = data[0][idx];
            data_at_idx[1] = data[1][idx];
            idx++;
        }
        return result;
    }
};

} // namespace bb::stdlib::recursion::honk
