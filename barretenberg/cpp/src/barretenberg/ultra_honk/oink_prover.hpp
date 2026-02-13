// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

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
#include "barretenberg/ultra_honk/prover_instance.hpp"

namespace bb {
/**
 * @brief Class for all the oink rounds, which are shared between the folding prover and ultra prover.
 *
 * @tparam Flavor
 */
template <typename Flavor> class OinkProver {
    using CommitmentKey = typename Flavor::CommitmentKey;
    using HonkVK = typename Flavor::VerificationKey;
    using ProverInstance = ProverInstance_<Flavor>;
    using Transcript = typename Flavor::Transcript;
    using FF = typename Flavor::FF;
    using Proof = typename Transcript::Proof;

  public:
    OinkProver(std::shared_ptr<ProverInstance> prover_instance,
               std::shared_ptr<HonkVK> honk_vk,
               const std::shared_ptr<typename Flavor::Transcript>& transcript)
        : prover_instance(prover_instance)
        , honk_vk(honk_vk)
        , transcript(transcript)
    {}

    void prove();
    Proof export_proof();

  private:
    std::shared_ptr<ProverInstance> prover_instance;
    std::shared_ptr<HonkVK> honk_vk;
    std::shared_ptr<Transcript> transcript;
    typename Flavor::CommitmentLabels commitment_labels;
    void send_vk_hash_and_public_inputs();
    void commit_to_wires();
    void commit_to_lookup_counts_and_w4();
    void commit_to_logderiv_inverses();
    void commit_to_z_perm();
    void commit_to_masking_poly();
    Flavor::Commitment commit_to_witness_polynomial(Polynomial<FF>& polynomial, const std::string& label);
};

using MegaOinkProver = OinkProver<MegaFlavor>;

} // namespace bb
