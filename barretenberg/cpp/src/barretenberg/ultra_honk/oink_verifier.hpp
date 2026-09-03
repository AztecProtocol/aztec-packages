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
 * Works with both native and recursive flavors. When instantiated with a recursive flavor
 * (IsRecursiveFlavor<Flavor>), automatically handles the differences in VK access and VK hash assertion.
 */
template <typename Flavor> class OinkVerifier {
    using Transcript = typename Flavor::Transcript;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using Instance = bb::VerifierInstance_<Flavor>;

  public:
    OinkVerifier(const std::shared_ptr<Instance>& verifier_instance,
                 const std::shared_ptr<Transcript>& transcript,
                 size_t num_public_inputs)
        : transcript(transcript)
        , verifier_instance(verifier_instance)
        , comm_labels(Flavor::commitment_labels())
        , num_public_inputs(num_public_inputs)
    {}

    // emit_alpha: when false, skip drawing the "alpha" challenge at the end of Oink.
    // Used by BatchedHonkTranslatorVerifier, which draws a single joint alpha ("Sumcheck:alpha")
    // after both circuits' pre-sumcheck phases instead.
    void verify(bool emit_alpha = true);
    void set_stage_callback(std::function<void(std::string_view)> callback) { stage_callback = std::move(callback); }

  private:
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<Instance> verifier_instance;
    typename Flavor::CommitmentLabels comm_labels;
    size_t num_public_inputs;
    std::function<void(std::string_view)> stage_callback;
    void receive_vk_hash_and_public_inputs();
    void receive_wire_commitments();
    void receive_lookup_counts_and_w4_commitments();
    void receive_logderiv_commitments();
    void complete_grand_product_round();
};
} // namespace bb
