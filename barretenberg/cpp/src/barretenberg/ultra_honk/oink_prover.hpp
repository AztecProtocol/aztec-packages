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

// Helper to conditionally provide interleaved commitment types (empty for non-interleaved flavors)
namespace detail {
template <typename Flavor, bool = (Flavor::INTERLEAVING_BATCH_SIZE > 1)> struct InterleavedOinkTypes {
    struct Empty {
        auto get_all() { return RefArray<typename Flavor::Commitment, 0>{}; }
        auto get_all() const { return RefArray<const typename Flavor::Commitment, 0>{}; }
    };
    using CommitmentsType = Empty;
    using LabelsType = Empty;
};
template <typename Flavor> struct InterleavedOinkTypes<Flavor, true> {
    using CommitmentsType = typename Flavor::InterleavedCommitments;
    using LabelsType = typename Flavor::InterleavedCommitmentLabels;
};
} // namespace detail

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
 * For interleaved flavors (INTERLEAVING_BATCH_SIZE > 1), polynomials are committed in groups
 * using interleaved MSM, reducing the number of witness commitments.
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
    using Commitment = typename Flavor::Commitment;
    using Proof = typename Transcript::Proof;
    using Polynomial = typename Flavor::Polynomial;

    static constexpr size_t BATCH_SIZE = Flavor::INTERLEAVING_BATCH_SIZE;

  public:
    std::shared_ptr<ProverInstance> prover_instance;
    std::shared_ptr<HonkVK> honk_vk;
    std::shared_ptr<Transcript> transcript;
    CommitmentKey commitment_key;

    typename Flavor::CommitmentLabels commitment_labels;

    // Interleaved commitment storage and labels (empty structs for BATCH_SIZE=1)
    using InterleavedCommitmentsType = typename detail::InterleavedOinkTypes<Flavor>::CommitmentsType;
    using InterleavedLabelsType = typename detail::InterleavedOinkTypes<Flavor>::LabelsType;
    InterleavedCommitmentsType interleaved_commitments;
    InterleavedLabelsType interleaved_labels;

    OinkProver(std::shared_ptr<ProverInstance> prover_instance,
               std::shared_ptr<HonkVK> honk_vk,
               const std::shared_ptr<Transcript>& transcript)
        : prover_instance(prover_instance)
        , honk_vk(honk_vk)
        , transcript(transcript)
    {}

    void prove();
    Proof export_proof();

    static void add_ram_rom_memory_records_to_wire_4(ProverInstance& instance);
    static void compute_logderivative_inverses(ProverInstance& instance);
    static void compute_grand_product_polynomial(ProverInstance& instance);

  private:
    void send_vk_hash_and_public_inputs();
    void commit_to_wires();
    void commit_to_lookup_counts_and_w4();
    void commit_to_logderiv_inverses();
    void commit_to_z_perm();
    void commit_to_masking_poly();

    /**
     * @brief Commit to an interleaved group of polynomials and send to verifier.
     * @details Only available for BATCH_SIZE > 1. If fewer than BATCH_SIZE polynomials are provided,
     *          zeros are used for missing slots (the MSM efficiently skips zero contributions).
     */
    template <size_t NUM_POLYS>
    Commitment commit_interleaved_and_send(std::array<PolynomialSpan<const FF>, NUM_POLYS> polynomials,
                                           const std::string& label);
};

using MegaOinkProver = OinkProver<MegaFlavor>;

} // namespace bb
