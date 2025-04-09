#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/op_queue/ecc_op_queue.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief Prover class for the Goblin ECC op queue transcript merge protocol
 *
 */
class MergeProver {
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Commitment = Curve::AffineElement;
    using Polynomial = bb::Polynomial<FF>;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using PCS = KZG<Curve>;
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using OpeningPair = bb::OpeningPair<Curve>;
    using Transcript = NativeTranscript;

  public:
    using MergeProof = std::vector<FF>;

    std::shared_ptr<Transcript> transcript;

    explicit MergeProver(const std::shared_ptr<ECCOpQueue>& op_queue,
                         std::shared_ptr<CommitmentKey> commitment_key = nullptr);

    BB_PROFILE MergeProof construct_proof();

  private:
    std::shared_ptr<ECCOpQueue> op_queue;
    std::shared_ptr<CommitmentKey> pcs_commitment_key;
    // Number of columns that jointly constitute the op_queue, should be the same as the number of wires in the
    // MegaCircuitBuilder
    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;
};

} // namespace bb
