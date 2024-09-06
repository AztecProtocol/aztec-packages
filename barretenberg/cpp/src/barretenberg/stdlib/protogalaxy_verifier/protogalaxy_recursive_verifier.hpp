#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/protogalaxy/folding_result.hpp"
#include "barretenberg/stdlib/honk_verifier/oink_recursive_verifier.hpp"
#include "barretenberg/stdlib/protogalaxy_verifier/recursive_instances.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_recursive_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_recursive_flavor.hpp"

namespace bb::stdlib::recursion::honk {
template <class DeciderVerificationKeys> class ProtogalaxyRecursiveVerifier_ {
  public:
    using Flavor = typename DeciderVerificationKeys::Flavor;
    using NativeFlavor = typename Flavor::NativeFlavor;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using GroupElement = typename Flavor::GroupElement;
    using DeciderVK = typename DeciderVerificationKeys::DeciderVK;
    using NativeDeciderVK = bb::DeciderVerificationKey_<NativeFlavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using NativeVerificationKey = typename Flavor::NativeVerificationKey;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using Builder = typename Flavor::CircuitBuilder;
    using RelationSeparator = typename Flavor::RelationSeparator;
    using PairingPoints = std::array<GroupElement, 2>;
    static constexpr size_t NUM = DeciderVerificationKeys::NUM;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    using OinkVerifier = OinkRecursiveVerifier_<Flavor>;
    struct VerifierInput {
      public:
        using DeciderVK = NativeDeciderVK;
        std::shared_ptr<DeciderVK> accumulator;
        std::vector<std::shared_ptr<NativeVerificationKey>> decider_vks;
    };

    static constexpr size_t NUM_SUBRELATIONS = Flavor::NUM_SUBRELATIONS;

    CommitmentLabels commitment_labels;

    Builder* builder;
    std::shared_ptr<Transcript> transcript;
    DeciderVerificationKeys keys_to_fold;

    ProtogalaxyRecursiveVerifier_(Builder* builder,
                                  const std::shared_ptr<DeciderVK>& accumulator,
                                  const std::vector<std::shared_ptr<VerificationKey>>& decider_vks)
        : builder(builder)
        , keys_to_fold(DeciderVerificationKeys(builder, accumulator, decider_vks)){};

    /**
     * @brief Given δ, compute the vector [δ, δ^2,..., δ^num_powers].
     * @details This is Step 2 of the protocol as written in the paper.
     */
    static std::vector<FF> compute_round_challenge_pows(const size_t num_powers, const FF& round_challenge)
    {
        std::vector<FF> pows(num_powers);
        pows[0] = round_challenge;
        for (size_t i = 1; i < num_powers; i++) {
            pows[i] = pows[i - 1].sqr();
        }
        return pows;
    }

    static std::vector<FF> update_gate_challenges(const FF perturbator_challenge,
                                                  const std::vector<FF>& gate_challenges,
                                                  const std::vector<FF>& round_challenges)
    {
        const size_t num_challenges = gate_challenges.size();
        std::vector<FF> next_gate_challenges(num_challenges);

        for (size_t idx = 0; idx < num_challenges; idx++) {
            next_gate_challenges[idx] = gate_challenges[idx] + perturbator_challenge * round_challenges[idx];
        }
        return next_gate_challenges;
    }

    std::shared_ptr<DeciderVK> get_accumulator() { return keys_to_fold[0]; }

    /**
     * @brief Instatiate the decider verification keys and the transcript.
     *
     * @param fold_data The data transmitted via the transcript by the prover.
     */
    void prepare_for_folding();

    /**
     * @brief Instantiate the accumulator from the transcript.
     *
     */
    void receive_accumulator(const std::shared_ptr<DeciderVK>&, const std::string&);

    /**
     * @brief Process the public data ϕ for the keys to be folded.
     *
     */
    void receive_and_finalise_key(const std::shared_ptr<DeciderVK>&, std::string&);

    /**
     * @brief Run the folding protocol on the verifier side to establish whether the public data ϕ of the new
     * accumulator, received from the prover is the same as that produced by the verifier.
     *
     * @details In the recursive setting this function doesn't return anything because the equality checks performed by
     * the recursive verifier, ensuring the folded ϕ*, e* and β* on the verifier side correspond to what has been sent
     * by the prover, are expressed as constraints.
     *
     */
    std::shared_ptr<DeciderVK> verify_folding_proof(const StdlibProof<Builder>&);

    /**
     * @brief Evaluates the perturbator at a  given scalar, in a sequential manner for the recursive setting.
     *
     * @details This method is equivalent to the one in the Polynomial class for evaluating a polynomial, represented by
     * coefficients in monomial basis, at a given point. The Polynomial class is used in the native verifier for
     * constructing and computing the perturbator. We implement this separate functionality here in the recursive
     * folding verifier to avoid instantiating the entire Polynomial class on stdlib::bn254. Furthermore, the evaluation
     * needs to be done sequentially as we don't support a parallel_for in circuits.
     *
     */
    static FF evaluate_perturbator(std::vector<FF> coeffs, FF point)
    {
        FF point_acc = FF(1);
        FF result = FF(0);
        for (size_t i = 0; i < coeffs.size(); i++) {
            result += coeffs[i] * point_acc;
            point_acc *= point;
        }
        return result;
    };

    /**
     * @brief Folds the witness commitments and verification key (part of ϕ) and stores the values in the accumulator.
     *
     *
     */

    void fold_commitments(std::vector<FF> lagranges,
                          DeciderVerificationKeys& keys,
                          std::shared_ptr<DeciderVK>& accumulator)
    {
        size_t vk_idx = 0;
        for (auto& expected_vk : accumulator->verification_key->get_all()) {
            std::vector<Commitment> commitments;
            for (auto& key : keys) {
                commitments.emplace_back(key->verification_key->get_all()[vk_idx]);
            }
            // For ultra we need to enable edgecase prevention
            expected_vk = Commitment::batch_mul(
                commitments, lagranges, /*max_num_bits=*/0, /*with_edgecases=*/IsUltraBuilder<Builder>);
            vk_idx++;
        }

        size_t comm_idx = 0;
        for (auto& comm : accumulator->witness_commitments.get_all()) {
            std::vector<Commitment> commitments;
            for (auto& key : keys) {
                commitments.emplace_back(key->witness_commitments.get_all()[comm_idx]);
            }
            // For ultra we need to enable edgecase prevention
            comm = Commitment::batch_mul(
                commitments, lagranges, /*max_num_bits=*/0, /*with_edgecases=*/IsUltraBuilder<Builder>);
            comm_idx++;
        }
    }
};

} // namespace bb::stdlib::recursion::honk