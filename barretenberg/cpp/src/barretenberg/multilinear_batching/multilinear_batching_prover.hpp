// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once

#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"

#include <optional>

namespace bb {

/**
 * @brief Internal prover for one per-kernel multilinear batching proof of fixed width.
 * @details Templated on the flavor, whose NUM_CLAIMS fixes the batching width at compile time. A family of widths
 * (2 .. CHONK_MAX_CLAIMS_PER_KERNEL) is instantiated so each kernel uses the circuit that exactly fits its group. Not
 * called directly: the public MultilinearBatchingProver routes to the correctly-instantiated internal prover
 * based on the runtime claim count.
 */
template <typename Flavor_> class MultilinearBatchingProverInternal {
  public:
    using Flavor = Flavor_;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using ProvingKey = typename Flavor::ProvingKey;
    using Transcript = typename Flavor::Transcript;

    MultilinearBatchingProverInternal(std::vector<MultilinearBatchingProverClaim>&& claims,
                                      std::shared_ptr<Transcript> transcript);

    BB_PROFILE void execute_claims_round();
    BB_PROFILE void execute_relation_check_rounds();
    BB_PROFILE MultilinearBatchingProverClaim compute_new_claim();

    HonkProof export_proof();
    HonkProof construct_proof();

    std::shared_ptr<Transcript> transcript;
    ProvingKey key;
    SumcheckOutput<Flavor> sumcheck_output;

  private:
    FF claim_batching_challenge = FF(0);
};

/**
 * @brief Public entrypoint for per-kernel multilinear batching.
 * @details Holds the claims to batch and, on construct_proof(), routes to the internal prover of the width matching the
 * runtime claim count. The new accumulator claim is cached and returned by compute_new_claim().
 */
class MultilinearBatchingProver {
  public:
    using ProverClaim = MultilinearBatchingProverClaim;
    using Transcript = NativeTranscript;

    MultilinearBatchingProver(std::vector<ProverClaim>&& claims, std::shared_ptr<Transcript> transcript);

    HonkProof construct_proof();
    ProverClaim compute_new_claim();

  private:
    template <size_t NumClaims> HonkProof prove_with_width();

    std::vector<ProverClaim> claims;
    std::shared_ptr<Transcript> transcript;
    std::optional<ProverClaim> new_claim;
};

} // namespace bb
