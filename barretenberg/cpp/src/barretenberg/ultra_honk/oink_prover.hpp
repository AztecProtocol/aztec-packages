// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
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
 * @brief Executes the "Oink" phase of the Honk proving protocol: the initial rounds that commit to
 * witness data, lookup/logderivative inverses, and the permutation grand product, producing the
 * relation parameters (eta, beta, gamma, alpha) along the way.
 *
 * @details The rounds proceed in order:
 *   1. send_vk_hash_and_public_inputs – hash the verification key and send public inputs to transcript
 *   2. commit_to_masking_poly – (ZK only) commit to a random masking polynomial for Gemini
 *   3. commit_to_wires – commit to wire polynomials (w_l, w_r, w_o; plus ECC-op & databus wires for Mega)
 *   4. commit_to_lookup_counts_and_w4 – get eta challenge, add RAM/ROM memory records to w_4,
 *      commit to lookup read counts/tags and the finalized w_4
 *   5. commit_to_logderiv_inverses – get beta/gamma challenges, compute and commit to log-derivative
 *      lookup inverses (plus databus inverses for Mega)
 *   6. commit_to_z_perm – compute and commit to the permutation grand product polynomial
 *   7. get alpha challenge
 *
 * After prove() completes, the prover instance holds all committed polynomials and relation
 * parameters needed by the subsequent Sumcheck and PCS phases in UltraProver.
 *
 * The underlying witness computations (RAM/ROM memory records, log-derivative inverses, permutation
 * grand product) are also exposed as public static methods so that test code can invoke them
 * independently of the transcript-driven commit flow.
 */
template <typename Flavor> class OinkProver {
    using CommitmentKey = typename Flavor::CommitmentKey;
    using HonkVK = typename Flavor::VerificationKey;
    using ProverInstance = ProverInstance_<Flavor>;
    using Transcript = typename Flavor::Transcript;
    using FF = typename Flavor::FF;
    using Proof = typename Transcript::Proof;
    using EntityId = typename Flavor::ProverPolynomials::EntityId;

  public:
    OinkProver(std::shared_ptr<ProverInstance> prover_instance,
               std::shared_ptr<HonkVK> honk_vk,
               const std::shared_ptr<typename Flavor::Transcript>& transcript)
        : prover_instance(prover_instance)
        , honk_vk(honk_vk)
        , transcript(transcript)
        , commitment_labels(Flavor::commitment_labels())
    {}

    // emit_alpha: when false, skip drawing the "alpha" challenge at the end of Oink.
    // Used by BatchedHonkTranslatorProver, which draws a single joint alpha ("Sumcheck:alpha")
    // after both circuits' pre-sumcheck phases instead.
    void prove(bool emit_alpha = true);
    Proof export_proof();

    static void add_ram_rom_memory_records_to_wire_4(ProverInstance& instance);
    static void add_rom_logup_inverses_to_wire_4(ProverInstance& instance);
    static void compute_logderivative_inverses(ProverInstance& instance);
    // Writes into `z_perm_dup_count` the number of adjacent-duplicate z_perm coefficients (rows where
    // the grand-product ratio is 1), measured during the grand-product construction for the MSM dedup hint.
    static void compute_grand_product_polynomial(ProverInstance& instance, uint32_t& z_perm_dup_count);

  private:
    std::shared_ptr<ProverInstance> prover_instance;
    std::shared_ptr<HonkVK> honk_vk;
    std::shared_ptr<Transcript> transcript;
    CommitmentKey commitment_key;
    typename Flavor::CommitmentLabels commitment_labels;
    void send_vk_hash_and_public_inputs();
    void commit_to_wires();
    void commit_to_lookup_counts_and_w4();
    void commit_to_logderiv_inverses();
    void commit_to_z_perm();
    void commit_to_masking_poly();
};

using MegaOinkProver = OinkProver<MegaFlavor>;

} // namespace bb
