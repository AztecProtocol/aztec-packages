// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/flavor/multi_mega_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

namespace bb {

/**
 * @brief Prover for MultiMegaFlavor using interleaved commitments.
 * @details Uses MultiMegaOinkProver which commits to 9 interleaved batches instead of 24 individual commitments.
 */
class MultiMegaProver {
  public:
    using Flavor = MultiMegaFlavor;
    using FF = typename Flavor::FF;
    using Builder = typename Flavor::CircuitBuilder;
    using Commitment = typename Flavor::Commitment;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using Curve = typename Flavor::Curve;
    using Polynomial = typename Flavor::Polynomial;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using PCS = typename Flavor::PCS;
    using ProverInstance = ProverInstance_<Flavor>;
    using HonkVK = typename Flavor::VerificationKey;
    using Transcript = typename Flavor::Transcript;
    using Proof = typename Transcript::Proof;

    std::shared_ptr<ProverInstance> prover_instance;
    std::shared_ptr<HonkVK> honk_vk;

    std::shared_ptr<Transcript> transcript;

    bb::RelationParameters<FF> relation_parameters;

    Polynomial quotient_W;

    SumcheckOutput<Flavor> sumcheck_output;

    CommitmentKey commitment_key;

    // Storage for interleaved commitments from OinkProver
    typename Flavor::InterleavedCommitments interleaved_commitments;

    MultiMegaProver(const std::shared_ptr<ProverInstance>&, const std::shared_ptr<HonkVK>&, const CommitmentKey&);

    explicit MultiMegaProver(const std::shared_ptr<ProverInstance>&,
                             const std::shared_ptr<HonkVK>&,
                             const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    explicit MultiMegaProver(Builder&,
                             const std::shared_ptr<HonkVK>&,
                             const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    explicit MultiMegaProver(Builder&&, const std::shared_ptr<HonkVK>&);

    void generate_gate_challenges();

    void execute_sumcheck_iop();
    void execute_pcs();

    /**
     * @brief Compute interleaved batched polynomials for PCS.
     * @details Batches polynomials by chunk position (all 0th, all 1st, etc.) then interleaves.
     * @param rho The batching challenge
     * @return Pair of (batched_unshifted, batched_shifted) interleaved polynomials
     */
    std::pair<Polynomial, Polynomial> compute_interleaved_batched_polynomials(const FF& rho);

    Proof export_proof();
    Proof construct_proof();
    Proof prove() { return construct_proof(); }
};

} // namespace bb
