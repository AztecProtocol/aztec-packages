// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/ultra_honk/verifier_instance.hpp"

namespace bb {

/**
 * @brief Verifier counterpart to OinkProver: receives witness commitments, computes relation parameters,
 * and prepares for Sumcheck.
 *
 * @details The rounds mirror OinkProver::prove() and proceed in order:
 *   1. receive_vk_hash_and_public_inputs – hash the VK, assert consistency, receive public inputs
 *   2. (ZK only) receive masking polynomial commitment
 *   3. receive_wire_commitments – receive w_l, w_r, w_o (plus ECC-op & databus for Mega)
 *   4. receive_lookup_counts_and_w4_commitments – get eta challenge, receive lookup counts/tags and w_4
 *   5. receive_logderiv_commitments – get beta/gamma challenges, receive log-derivative inverses
 *      (plus databus inverses for Mega)
 *   6. complete_grand_product_round – compute public_input_delta, receive z_perm
 *   7. get alpha challenge
 *
 * For interleaved flavors (INTERLEAVING_BATCH_SIZE > 1), receives interleaved commitments instead
 * of individual ones, reducing the number of witness commitments.
 *
 * Works with both native and recursive flavors. When instantiated with a recursive flavor
 * (IsRecursiveFlavor<Flavor>), automatically handles the differences in VK access and VK hash assertion.
 */
template <typename Flavor> class OinkVerifier {
    using Transcript = typename Flavor::Transcript;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using Instance = bb::VerifierInstance_<Flavor>;

    static constexpr size_t BATCH_SIZE = Flavor::INTERLEAVING_BATCH_SIZE;

  public:
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<Instance> verifier_instance;
    size_t num_public_inputs;

    OinkVerifier(const std::shared_ptr<Instance>& verifier_instance,
                 const std::shared_ptr<Transcript>& transcript,
                 size_t num_public_inputs)
        : transcript(transcript)
        , verifier_instance(verifier_instance)
        , num_public_inputs(num_public_inputs)
    {}

    // emit_alpha: when false, skip drawing the "alpha" challenge at the end of Oink.
    // Used by BatchedHonkTranslatorVerifier, which draws a single joint alpha ("Sumcheck:alpha")
    // after both circuits' pre-sumcheck phases instead.
    void verify(bool emit_alpha = true);

  private:
    void receive_vk_hash_and_public_inputs();
    void receive_wire_commitments();
    void receive_lookup_counts_and_w4_commitments();
    void receive_logderiv_commitments();
    void complete_grand_product_round();

    /**
     * @brief Receive commitments for a round's groups from transcript.
     * @details Group descriptors are obtained by calling OinkRounds on received_commitments,
     *          so entity pointers point into the commitment storage. The received commitment
     *          is written through the first non-null pointer in each group (for BS=1, that's
     *          the single entity; for BS>1, the first field of the interleaved commitment).
     */
    template <typename GroupDescs> void receive_round_groups(const GroupDescs& groups);
};
} // namespace bb
