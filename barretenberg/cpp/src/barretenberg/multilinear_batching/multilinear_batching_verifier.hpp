// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once

#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_claims.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

#include <utility>

namespace bb {

/**
 * @brief Internal verifier for one per-kernel multilinear batching sumcheck of fixed width NUM_CLAIMS.
 * @details The claims being batched are supplied in memory (the caller produced them via instance_to_accumulator);
 * they are not read from the proof. The batching challenge is drawn from the shared transcript, whose state already
 * commits to those claims via the group's instance sumchecks, so no separate hashing is required. The proof carries
 * only the batching sumcheck. Not called directly: the public MultilinearBatchingVerifier routes to the
 * correctly-instantiated internal verifier based on the runtime claim count.
 */
template <typename Flavor_> class MultilinearBatchingVerifierInternal {
  public:
    using Flavor = Flavor_;
    using FF = typename Flavor::FF;
    using Curve = typename Flavor::Curve;
    using Commitment = typename Flavor::Commitment;
    using Transcript = typename Flavor::Transcript;
    using Sumcheck = SumcheckVerifier<Flavor>;
    using VerifierClaim = MultilinearBatchingVerifierClaim<Curve>;
    using Proof = std::conditional_t<Curve::is_stdlib_type, stdlib::Proof<MegaCircuitBuilder>, HonkProof>;

    static constexpr size_t NUM_CLAIMS = Flavor::NUM_CLAIMS;
    static constexpr bool IsRecursive = Curve::is_stdlib_type;

    explicit MultilinearBatchingVerifierInternal(const std::shared_ptr<Transcript>& transcript);

    // The batching sumcheck is read from the shared transcript; the caller is responsible for loading the proof onto it
    // beforehand (in HyperNova folding it is already loaded by the instance sumcheck; in the kernel path the kernel
    // loads the separate batching proof).
    std::pair<bool, VerifierClaim> verify_proof(const std::vector<VerifierClaim>& claims);

  private:
    std::shared_ptr<Transcript> transcript;

    FF compute_target_sum(const FF& alpha,
                          const std::vector<VerifierClaim>& claims,
                          const std::vector<FF>& slot_scalars) const;

    VerifierClaim compute_new_claim(const SumcheckOutput<Flavor>& sumcheck_result,
                                    const std::vector<VerifierClaim>& claims,
                                    std::vector<FF> slot_scalars);

    bool check_eq_consistency(const SumcheckOutput<Flavor>& sumcheck_result, const std::vector<VerifierClaim>& claims);
};

/**
 * @brief Public entrypoint for per-kernel multilinear batching verification.
 * @details Templated only on the native/recursive axis (a compile-time caller choice). verify_proof() routes on the
 * runtime claim count to the internal verifier of the matching width.
 */
template <bool IsRecursive_> class MultilinearBatchingVerifier {
  public:
    using BaseFlavor = std::conditional_t<IsRecursive_, MultilinearBatchingRecursiveFlavor, MultilinearBatchingFlavor>;
    using Curve = typename BaseFlavor::Curve;
    using Transcript = typename BaseFlavor::Transcript;
    using VerifierClaim = MultilinearBatchingVerifierClaim<Curve>;
    using Proof = std::conditional_t<Curve::is_stdlib_type, stdlib::Proof<MegaCircuitBuilder>, HonkProof>;

    static constexpr bool IsRecursive = IsRecursive_;

    explicit MultilinearBatchingVerifier(const std::shared_ptr<Transcript>& transcript);

    // The batching proof must already be loaded onto the shared transcript by the caller (see the internal verifier).
    std::pair<bool, VerifierClaim> verify_proof(const std::vector<VerifierClaim>& claims);

  private:
    template <size_t NumClaims>
    std::pair<bool, VerifierClaim> verify_with_width(const std::vector<VerifierClaim>& claims);

    std::shared_ptr<Transcript> transcript;
};

using MultilinearBatchingNativeVerifier = MultilinearBatchingVerifier<false>;
using MultilinearBatchingRecursiveVerifier = MultilinearBatchingVerifier<true>;

} // namespace bb
