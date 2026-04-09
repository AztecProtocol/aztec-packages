#include "goblin_flush_circuit.hpp"

#include "barretenberg/common/log.hpp"
#include "barretenberg/goblin_without_merge/goblin_without_merge_verifier.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"

namespace bb {

UltraCircuitBuilder build_goblin_flush_circuit(const GoblinWithoutMergeProof& native_proof,
                                               const MergeVerifier::TableCommitments& merged_table)
{
    using Builder = UltraCircuitBuilder;
    using Curve = stdlib::bn254<Builder>;
    using RecursiveCommitment = Curve::AffineElement;
    using RecursiveTableCommitments = GoblinWithoutMergeRecursiveVerifier::TableCommitments;
    using Transcript = UltraStdlibTranscript;
    using GoblinFlushIO = stdlib::recursion::honk::GoblinFlushIO<Builder>;

    Builder builder;

    // Convert native proof to stdlib proof (creates witnesses in the builder)
    GoblinWithoutMergeStdlibProof stdlib_proof(builder, native_proof);

    // Convert native merge commitments to recursive (stdlib) commitments
    RecursiveTableCommitments recursive_merged_table;
    for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
        recursive_merged_table[idx] = RecursiveCommitment::from_witness(&builder, merged_table[idx]);
        // Remove the free witness tag since these are supposed to be free witnesses
        // Their correctness is checked via public inputs' propagation
        recursive_merged_table[idx].unset_free_witness_tag();
    }

    // Goblin recursive verification without merge → ECCVM → Translator
    auto transcript = std::make_shared<Transcript>();

    GoblinWithoutMergeRecursiveVerifier verifier{ transcript, stdlib_proof, recursive_merged_table };
    auto result = verifier.reduce_to_pairing_check_and_ipa_opening();

    // Set GoblinFlushIO as public inputs
    GoblinFlushIO io;
    io.pairing_inputs = std::move(result.translator_pairing_points);
    io.ipa_claim = std::move(result.ipa_claim);
    io.merged_table = std::move(recursive_merged_table);
    io.set_public();

    // Store the IPA proof for external verification
    builder.ipa_proof = stdlib_proof.ipa_proof.get_value();

    return builder;
}

} // namespace bb
