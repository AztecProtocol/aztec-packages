#pragma once

#include "barretenberg/honk/flavor/goblin_ultra.hpp"
#include "barretenberg/honk/flavor/ultra.hpp"
#include "barretenberg/honk/pcs/claim.hpp"
#include "barretenberg/honk/transcript/transcript.hpp"
#include "barretenberg/plonk/proof_system/types/proof.hpp"
#include "barretenberg/proof_system/op_queue/ecc_op_queue.hpp"

namespace proof_system::honk {

/**
 * @brief Prover class for the Goblin ECC op queue transcript merge protocol
 *
 * @tparam Flavor
 */
template <typename Flavor> class MergeProver_ {
    using FF = typename Flavor::FF;
    using Polynomial = typename Flavor::Polynomial;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using Commitment = typename Flavor::Commitment;
    using PCS = typename Flavor::PCS;
    using Curve = typename Flavor::Curve;
    using OpeningClaim = typename pcs::ProverOpeningClaim<Curve>;
    using OpeningPair = typename pcs::OpeningPair<Curve>;

  public:
    ProverTranscript<FF> transcript;
    std::shared_ptr<ECCOpQueue> op_queue;
    std::shared_ptr<CommitmentKey> pcs_commitment_key;

    explicit MergeProver_(std::shared_ptr<CommitmentKey>, std::shared_ptr<ECCOpQueue>);
    plonk::proof& construct_proof();

  private:
    plonk::proof proof;
};

extern template class MergeProver_<honk::flavor::Ultra>;
extern template class MergeProver_<honk::flavor::GoblinUltra>;

} // namespace proof_system::honk