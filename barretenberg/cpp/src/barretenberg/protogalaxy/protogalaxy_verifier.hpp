// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/protogalaxy/constants.hpp"
#include "barretenberg/protogalaxy/folding_result.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"
#include <type_traits>

namespace bb {
template <class VerifierInstance> class ProtogalaxyVerifier_ {
  public:
    using Flavor = typename VerifierInstance::Flavor;
    using Transcript = typename Flavor::Transcript;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using SubrelationSeparators = typename Flavor::SubrelationSeparators;
    using VerifierInstances = std::array<std::shared_ptr<VerifierInstance>, NUM_INSTANCES>;

    static constexpr size_t NUM_SUBRELATIONS = Flavor::NUM_SUBRELATIONS;
    static constexpr size_t BATCHED_EXTENDED_LENGTH = computed_batched_extended_length<Flavor>();

    VerifierInstances insts_to_fold;

    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>();

    ProtogalaxyVerifier_(const VerifierInstances& insts, const std::shared_ptr<Transcript>& transcript)
        : insts_to_fold(insts)
        , transcript(transcript) {};
    ~ProtogalaxyVerifier_() = default;

    /**
     * @brief Instatiate the verifier instances and the transcript.
     *
     * @param fold_data The data transmitted via the transcript by the prover.
     */
    void run_oink_verifier_on_each_incomplete_instance(const std::vector<FF>&);

    /**
     * @brief Run the folding protocol on the verifier side to establish whether the public data ϕ of the new
     * accumulator, received from the prover, is the same as that produced by the verifier.
     */
    std::shared_ptr<VerifierInstance> verify_folding_proof(const std::vector<FF>&);

  private:
    enum class FOLDING_DATA : std::uint8_t {
        PRECOMPUTED_COMMITMENTS,
        WITNESS_COMMITMENTS,
        ALPHAS,
        RELATION_PARAMETERS
    };

    /**
     * @brief Get data to be folded grouped by commitment index
     * @example Assume the VKs are arranged as follows
     *           VK 0    VK 1    VK 2    VK 3
     *           q_c_0   q_c_1   q_c_2   q_c_3
     *           q_l_0   q_l_1   q_l_2   q_l_3
     *             ⋮        ⋮        ⋮       ⋮
     * If we wanted to extract the commitments from the verification keys in order to fold them, we would pass to the
     * function the type parameter FOLDING_DATA::PRECOMPUTED_COMMITMETS, and the function would return
     * {{q_c_0, q_c_1, q_c_2, q_c_3}, {q_l_0, q_l_1, q_l_2, q_l_3},...}. Here the "commitment index" is the index of the
     * row in the matrix whose columns are given be the instance components to be folded.
     *
     * @tparam FoldingData The type of the parameter to be folded
     */
    template <FOLDING_DATA FoldingData> auto get_data_to_fold() const
    {
        using PrecomputeCommDataType = RefArray<Commitment, Flavor::NUM_PRECOMPUTED_ENTITIES>;
        using WitnessCommitmentsDataType = RefArray<Commitment, Flavor::NUM_WITNESS_ENTITIES>;
        using AlphasDataType = Flavor::SubrelationSeparators;
        using RelationParametersDataType = RefArray<FF, RelationParameters<FF>::NUM_TO_FOLD>;
        using DataType = std::conditional_t<
            FoldingData == FOLDING_DATA::PRECOMPUTED_COMMITMENTS,
            PrecomputeCommDataType,
            std::conditional_t<
                FoldingData == FOLDING_DATA::WITNESS_COMMITMENTS,
                WitnessCommitmentsDataType,
                std::conditional_t<FoldingData == FOLDING_DATA::ALPHAS, AlphasDataType, RelationParametersDataType>>>;

        std::array<DataType, NUM_INSTANCES> data;
        if constexpr (FoldingData == FOLDING_DATA::PRECOMPUTED_COMMITMENTS) {
            data[0] = insts_to_fold[0]->vk->get_all();
            data[1] = insts_to_fold[1]->vk->get_all();
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
        for (size_t idx = 0; auto& commitment_at_idx : result) {
            commitment_at_idx[0] = data[0][idx];
            commitment_at_idx[1] = data[1][idx];
            idx++;
        }
        return result;
    }
};

} // namespace bb
