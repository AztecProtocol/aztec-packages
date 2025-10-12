// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include "barretenberg/flavor/multilinear_batching_recursive_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_claims.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

#include <vector>

namespace bb {

template <typename Flavor_> class MultilinearBatchingVerifier {
  public:
    using Flavor = Flavor_;
    using FF = typename Flavor::FF;
    using Curve = typename Flavor::Curve;
    using Transcript = typename Flavor::Transcript;

    using Commitment = typename Flavor::Commitment;
    using Sumcheck = SumcheckVerifier<Flavor>;
    using VerifierClaim = MultilinearBatchingVerifierClaim<Curve>;
    using Proof = std::vector<FF>;

    explicit MultilinearBatchingVerifier(const std::shared_ptr<Transcript>& transcript);

    std::pair<bool, VerifierClaim> verify_proof();

  private:
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<VerifierClaim> accumulator_claim;
    std::shared_ptr<VerifierClaim> instance_claim;
    RelationParameters<FF> relation_parameters;
};

} // namespace bb
