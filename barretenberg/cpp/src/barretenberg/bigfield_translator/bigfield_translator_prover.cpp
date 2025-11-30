// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "bigfield_translator_prover.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "bigfield_translator.hpp"

namespace bb {

BigfieldTranslatorProver::BigfieldTranslatorProver(const std::shared_ptr<ECCOpQueue>& op_queue,
                                                   const BF& evaluation_input_x,
                                                   const BF& batching_challenge_v,
                                                   const std::shared_ptr<Transcript>& transcript)
    : transcript(transcript)
{
    using Builder = typename Flavor::CircuitBuilder;
    using fq_ct = stdlib::bigfield<Builder, bb::Bn254FqParams>;

    // Scope to ensure builder memory is freed after prover instance creation
    {
        Builder builder;

        // Populate ecc_op block from op_queue
        BigfieldTranslator::populate_ecc_op_block(builder, op_queue);

        // Create circuit witnesses for challenges
        fq_ct x = fq_ct::create_from_u512_as_witness(&builder, uint512_t(evaluation_input_x));
        fq_ct v = fq_ct::create_from_u512_as_witness(&builder, uint512_t(batching_challenge_v));

        // Compute the accumulator in-circuit
        fq_ct result = BigfieldTranslator::compute_accumulator(builder, x, v);

        // Store the accumulated result for verification
        accumulated_result = BF(result.get_value().lo);

        // Add default public inputs required by the proving system
        stdlib::recursion::honk::DefaultIO<Builder>::add_default(builder);

        // Create prover instance and verification key
        prover_instance = std::make_shared<ProverInstance>(builder);
        verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    } // Builder is freed here
}

HonkProof BigfieldTranslatorProver::construct_proof()
{
    using Prover = UltraProver_<Flavor>;

    // Note: accumulated_result is available via get_accumulated_result() and should be
    // passed to the verifier out-of-band (similar to how TranslatorVerifier receives it)
    Prover prover(prover_instance, verification_key, transcript);
    return prover.construct_proof();
}

} // namespace bb
