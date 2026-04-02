#include "goblin_flush_circuit.hpp"

#include "barretenberg/common/log.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"

namespace bb {

UltraCircuitBuilder build_goblin_flush_circuit(const GoblinProof& native_proof,
                                               const MergeVerifier::TableCommitments& merged_table)
{
    using Builder = UltraCircuitBuilder;
    using Curve = stdlib::bn254<Builder>;
    using ECCVMRecursiveVerifier = GoblinRecursiveVerifier::ECCVMVerifier;
    using TranslatorRecursiveVerifier = GoblinRecursiveVerifier::TranslatorVerifier;
    using RecursiveCommitment = Curve::AffineElement;
    using RecursiveTableCommitments = GoblinRecursiveVerifier::MergeVerifier::TableCommitments;
    using Transcript = UltraStdlibTranscript;
    using GoblinFlushIO = stdlib::recursion::honk::GoblinFlushIO<Builder>;

    Builder builder;

    // Convert native proof to stdlib proof (creates witnesses in the builder)
    GoblinStdlibProof stdlib_proof(builder, native_proof);

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

    // Step 1: Verify the ECCVM proof
    ECCVMRecursiveVerifier eccvm_verifier{ transcript, stdlib_proof.eccvm_proof };
    auto eccvm_result = eccvm_verifier.reduce_to_ipa_opening();
    vinfo("Goblin: ECCVM reduced to IPA opening successfully: ", eccvm_result.reduction_succeeded ? "true" : "false");

    // Get translation data from ECCVM verifier
    auto translator_input = eccvm_verifier.get_translator_input_data();

    // Step 2: Verify the Translator proof
    // - Pass `recursive_merged_table` as the table over which to perform verification (which commits to all the ecc ops
    // performed by apps and kernels up to this point in the Chonk accumulation)
    // - `accumulated_result` and corresponding challenges ensure non-native computation matches ECCVM's native result
    TranslatorRecursiveVerifier translator_verifier{ transcript,
                                                     stdlib_proof.translator_proof,
                                                     translator_input.evaluation_challenge_x,
                                                     translator_input.batching_challenge_v,
                                                     translator_input.accumulated_result,
                                                     recursive_merged_table };
    auto translator_result = translator_verifier.reduce_to_pairing_check();
    vinfo("Goblin: Translator reduced to pairing check successfully: ",
          translator_result.reduction_succeeded ? "true" : "false");

    // Set GoblinFlushIO as public inputs
    GoblinFlushIO io;
    io.pairing_inputs = std::move(translator_result.pairing_points);
    io.ipa_claim = std::move(eccvm_result.ipa_claim);
    io.merged_table = std::move(recursive_merged_table);
    io.set_public();

    // Store the IPA proof for external verification
    builder.ipa_proof = stdlib_proof.ipa_proof.get_value();

    info("Goblin flush circuit (Circuit C): num gates = ", builder.get_num_finalized_gates_inefficient());

    return builder;
}

} // namespace bb
