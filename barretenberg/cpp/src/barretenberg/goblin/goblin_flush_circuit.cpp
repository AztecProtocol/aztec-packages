#include "goblin_flush_circuit.hpp"

#include "barretenberg/common/log.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"

namespace bb {

UltraCircuitBuilder build_goblin_flush_circuit(const GoblinProof& native_proof,
                                               const MergeVerifier::InputCommitments& native_merge_commitments)
{
    using Builder = UltraCircuitBuilder;
    using Curve = stdlib::bn254<Builder>;
    using RecursiveCommitment = Curve::AffineElement;
    using RecursiveMergeCommitments = GoblinRecursiveVerifier::MergeCommitments;
    using Transcript = UltraStdlibTranscript;
    using GoblinFlushIO = stdlib::recursion::honk::GoblinFlushIO;

    Builder builder;

    // Convert native proof to stdlib proof (creates witnesses in the builder)
    GoblinStdlibProof stdlib_proof(builder, native_proof);

    // Convert native merge commitments to recursive (stdlib) commitments
    RecursiveMergeCommitments recursive_merge_commitments;
    for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
        recursive_merge_commitments.t_commitments[idx] =
            RecursiveCommitment::from_witness(&builder, native_merge_commitments.t_commitments[idx]);
        recursive_merge_commitments.T_prev_commitments[idx] =
            RecursiveCommitment::from_witness(&builder, native_merge_commitments.T_prev_commitments[idx]);
        // Remove the free witness tag since these are supposed to be free witnesses
        // Their correctness is checked via public inputs' propagation
        recursive_merge_commitments.t_commitments[idx].unset_free_witness_tag();
        recursive_merge_commitments.T_prev_commitments[idx].unset_free_witness_tag();
    }

    // Run the GoblinRecursiveVerifier: Merge → ECCVM → Translator
    auto transcript = std::make_shared<Transcript>();
    GoblinRecursiveVerifier verifier{ transcript, stdlib_proof, recursive_merge_commitments, MergeSettings::APPEND };
    auto result = verifier.reduce_to_pairing_check_and_ipa_opening();

    // Aggregate Merge and Translator pairing points
    result.translator_pairing_points.aggregate(result.merge_pairing_points);

    // Set GoblinFlushIO as public inputs
    GoblinFlushIO io;
    io.pairing_inputs = std::move(result.translator_pairing_points);
    io.ipa_claim = std::move(result.ipa_claim);
    io.T_prev = std::move(recursive_merge_commitments.T_prev_commitments);
    io.t = std::move(recursive_merge_commitments.t_commitments);
    io.set_public();

    // Store the IPA proof for external verification
    builder.ipa_proof = stdlib_proof.ipa_proof.get_value();

    info("Goblin flush circuit (Circuit C): num gates = ", builder.get_num_finalized_gates_inefficient());

    return builder;
}

} // namespace bb
