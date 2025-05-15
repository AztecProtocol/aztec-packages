// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
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

    // Verify proof
    auto verifier_transcript = std::make_shared<bb::TranslatorFlavor::Transcript>(prover_transcript->proof_data);
    verifier_transcript->template receive_from_prover<Fq>("init");
    auto verification_key = std::make_shared<TranslatorFlavor::VerificationKey>(proving_key->proving_key);
    TranslatorVerifier verifier(verification_key, verifier_transcript);
    bool verified = verifier.verify_proof(proof, x, translation_batching_challenge);
    (void)checked;
    (void)verified;
    return 0;
}
