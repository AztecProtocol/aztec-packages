// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"

namespace bb::stdlib::recursion::goblin {
template <typename CircuitBuilder> class MergeRecursiveVerifier_ {
  public:
    using Curve = bn254<CircuitBuilder>;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::Element;
    using GroupElement = typename Curve::Element;
    using KZG = ::bb::KZG<Curve>;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<CircuitBuilder>>;
    using PairingPoints = stdlib::recursion::PairingPoints<CircuitBuilder>;

    CircuitBuilder* builder;
    std::shared_ptr<Transcript> transcript;
    MergeSettings settings;

    // Number of columns that jointly constitute the op_queue, should be the same as the number of wires in the
    // MegaCircuitBuilder
    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;

    /**
     * @brief Commitments to the subtable t_j on which the Merge verifier operates
     *
     */
    class SubtableWitnessCommitments {
      public:
        std::array<Commitment, NUM_WIRES> t_commitments;
        // std::array<Commitment, NUM_WIRES> T_prev_commitments;

        SubtableWitnessCommitments() = default;

        /**
         * @brief Set t_commitments from RefArray
         *
         * @param t_commitments_ref
         */
        void set_t_commitments(const RefArray<Commitment, NUM_WIRES>& t_commitments_ref)
        {
            for (size_t idx = 0; idx < NUM_WIRES; idx++) {
                t_commitments[idx] = t_commitments_ref[idx];
            }
        }
    };

    /**
     * @brief Commitments used by the Merge verifier during the protocol
     *
     */
    class WitnessCommitments : public SubtableWitnessCommitments {
      public:
        std::array<Commitment, NUM_WIRES> T_commitments;

        WitnessCommitments() = default;
    };

    explicit MergeRecursiveVerifier_(CircuitBuilder* builder,
                                     const MergeSettings settings = MergeSettings::PREPEND,
                                     const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    [[nodiscard("Pairing points should be accumulated")]] PairingPoints verify_proof(
        const stdlib::Proof<CircuitBuilder>& proof,
        const SubtableWitnessCommitments& subtable_commitments,
        std::array<Commitment, NUM_WIRES>& merged_table_commitment);
};

} // namespace bb::stdlib::recursion::goblin
