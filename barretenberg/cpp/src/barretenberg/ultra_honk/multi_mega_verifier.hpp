// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/flavor/multi_mega_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"

namespace bb {

/**
 * @brief Output type for MultiMegaVerifier
 */
struct MultiMegaVerifierOutput {
    using Flavor = MultiMegaFlavor;
    using Commitment = typename Flavor::Commitment;

    bool result = false;

    MultiMegaVerifierOutput() = default;
};

/**
 * @brief Verifier for MultiMegaFlavor using interleaved commitments.
 * @details Uses MultiMegaOinkVerifier which receives 9 interleaved commitments instead of 24 individual ones.
 */
class MultiMegaVerifier {
  public:
    using Flavor = MultiMegaFlavor;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using Curve = typename Flavor::Curve;
    using PCS = typename Flavor::PCS;
    using VerificationKey = typename Flavor::VerificationKey;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using Transcript = typename Flavor::Transcript;
    using Instance = VerifierInstance_<Flavor>;
    using VKAndHash = typename Flavor::VKAndHash;

    using PublicInputs = std::vector<FF>;
    using Proof = typename Transcript::Proof;
    using PairingPoints = bb::PairingPoints<Curve>;
    using Output = MultiMegaVerifierOutput;

    /**
     * @brief Result of reducing proof to pairing points check.
     */
    struct ReductionResult {
        PairingPoints pairing_points;
        bool reduction_succeeded = false;
    };

    explicit MultiMegaVerifier(const std::shared_ptr<VKAndHash>& vk_and_hash,
                               const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>())
        : vk_and_hash(vk_and_hash)
        , verifier_instance(std::make_shared<Instance>(vk_and_hash))
        , transcript(transcript)
    {}

    /**
     * @brief Compute log_n based on flavor.
     */
    size_t compute_log_n() const;

    /**
     * @brief Compute padding indicator array.
     */
    static std::vector<FF> compute_padding_indicator_array(size_t log_n);

    /**
     * @brief Compute Lagrange basis evaluations for interleaving (k=2).
     * @param u0 First sumcheck challenge
     * @param u1 Second sumcheck challenge
     * @return Array of 4 Lagrange basis evaluations: L₀, L₁, L₂, L₃
     */
    static std::array<FF, 4> compute_lagrange_basis(const FF& u0, const FF& u1);

    /**
     * @brief Combine individual polynomial evaluations into batched evaluation.
     * @param lagrange_basis The 4 Lagrange basis evaluations
     * @param individual_evals The 4 individual polynomial evaluations (pad with zeros if < 4)
     * @return Batched evaluation F(u) = Σⱼ fⱼ(u_k,...) · Lⱼ(u₀,u₁)
     */
    static FF compute_batched_evaluation(const std::array<FF, 4>& lagrange_basis,
                                         const std::array<FF, 4>& individual_evals);

    /**
     * @brief Reduce proof to pairing check.
     */
    [[nodiscard("Reduction result should be verified")]] ReductionResult reduce_to_pairing_check(const Proof& proof);

    /**
     * @brief Verify the proof.
     */
    Output verify_proof(const Proof& proof);

    /**
     * @brief Get the transcript.
     */
    const std::shared_ptr<Transcript>& get_transcript() const { return transcript; }

    /**
     * @brief Get the verifier instance.
     */
    const std::shared_ptr<Instance>& get_verifier_instance() const { return verifier_instance; }

    /**
     * @brief Get public inputs.
     */
    const PublicInputs& get_public_inputs() const { return verifier_instance->public_inputs; }

    /**
     * @brief Get interleaved commitments.
     */
    const typename Flavor::InterleavedCommitments& get_interleaved_commitments() const
    {
        return verifier_instance->interleaved_commitments;
    }

  private:
    std::shared_ptr<VKAndHash> vk_and_hash;
    std::shared_ptr<Instance> verifier_instance;
    std::shared_ptr<Transcript> transcript;
};

} // namespace bb
