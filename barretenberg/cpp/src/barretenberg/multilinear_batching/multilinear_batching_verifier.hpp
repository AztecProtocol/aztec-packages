// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

#include <vector>

namespace bb {

class MultilinearBatchingVerifier {
  public:
    using Flavor = MultilinearBatchingFlavor;
    using FF = typename Flavor::FF;
    using Transcript = typename Flavor::Transcript;
    using SumcheckOutput = SumcheckOutput<Flavor>;

    using Sumcheck = SumcheckVerifier<MultilinearBatchingFlavor>;
    explicit MultilinearBatchingVerifier(const std::shared_ptr<Transcript>& transcript);

    std::pair<bool, SumcheckOutput> verify_proof(const HonkProof& proof);

  private:
    std::shared_ptr<Transcript> transcript;
    RelationParameters<FF> relation_parameters;
};

} // namespace bb
