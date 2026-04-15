// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/circuit_checker/translator_circuit_checker.hpp"
#include "barretenberg/translator_vm/translator.fuzzer.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"
extern "C" void LLVMFuzzerInitialize(int*, char***)
{
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
}
/**
 * @brief A very primitive fuzzer for the composer
 *
 * @details Super-slow. Shouldn't be run on its own. First you need to run the circuit builder fuzzer, then minimize the
 * corpus and then just use that corpus
 *
 */
extern "C" int LLVMFuzzerTestOneInput(const unsigned char* data, size_t size)
{
    // Parse challenges and opqueue from data
    auto parsing_result = parse_and_construct_opqueue(data, size);
    if (!parsing_result.has_value()) {
        return 0;
    }
    auto [batching_challenge_init, x, op_queue] = parsing_result.value();
    auto prover_transcript = std::make_shared<bb::TranslatorFlavor::Transcript>();
    prover_transcript->send_to_verifier("init", batching_challenge_init);
    prover_transcript->export_proof();
    Fq translation_batching_challenge = prover_transcript->template get_challenge<Fq>("Translation:batching_challenge");

    // Construct circuit
    auto circuit_builder = TranslatorCircuitBuilder(translation_batching_challenge, x, op_queue);

    // Check that the circuit passes
    bool checked = TranslatorCircuitChecker::check(circuit_builder);
    // Construct proof
    auto proving_key = std::make_shared<TranslatorProvingKey>(circuit_builder);
    TranslatorProver prover(proving_key, prover_transcript);
    auto proof = prover.construct_proof();

    // Get accumulated_result from prover
    uint256_t accumulated_result = prover.get_accumulated_result();

    // Commit to op queue wires (normally provided by merge protocol)
    std::array<TranslatorFlavor::Commitment, TranslatorFlavor::NUM_OP_QUEUE_WIRES> op_queue_commitments;
    op_queue_commitments[0] = proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.op);
    op_queue_commitments[1] =
        proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.x_lo_y_hi);
    op_queue_commitments[2] =
        proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.x_hi_z_1);
    op_queue_commitments[3] =
        proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.y_lo_z_2);

    // Verify proof using unified verifier API
    auto verifier_transcript = std::make_shared<bb::TranslatorFlavor::Transcript>();
    TranslatorVerifier verifier(
        verifier_transcript, proof, x, translation_batching_challenge, accumulated_result, op_queue_commitments);
    auto verification_result = verifier.reduce_to_pairing_check();
    bool verified = verification_result.reduction_succeeded && verification_result.pairing_points.check();
    BB_ASSERT(checked, "Translator CircuitChecker failed on valid circuit");
    BB_ASSERT(verified, "Translator proof verification failed for honest prover");
    return 0;
}
