#include "barretenberg/ultra_vanilla_client_ivc/ultra_vanilla_client_ivc.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"

namespace bb {

/**
 * @brief Execute prover work for accumulation
 * @details Construct an proving key for the provided circuit. If this is the first step in the IVC, simply initialize
 * the folding accumulator. Otherwise, execute the PG prover to fold the proving key into the accumulator and produce a
 * folding proof. Also execute the merge protocol to produce a merge proof.
 *
 * @param circuit
 * @param precomputed_vk
 */
void UltraVanillaClientIVC::accumulate(ClientCircuit& circuit, const std::shared_ptr<VK>& precomputed_vk)
{
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1069): Do proper aggregation with merge recursive
    // verifier.
    circuit.add_pairing_point_accumulator(stdlib::recursion::init_default_agg_obj_indices<ClientCircuit>(circuit));

    // Construct the proving key for circuit
    std::shared_ptr<PK> proving_key = std::make_shared<PK>(circuit);

    // The commitment key is initialised with the number of points determined by the trace_settings' dyadic size. If a
    // circuit overflows past the dyadic size the commitment key will not have enough points so we need to increase it
    if (proving_key->proving_key.circuit_size > bn254_commitment_key->dyadic_size) {
        bn254_commitment_key = std::make_shared<CommitmentKey<curve::BN254>>(proving_key->proving_key.circuit_size);
    }
    proving_key->proving_key.commitment_key = bn254_commitment_key;

    vinfo("getting honk vk... precomputed?: ", precomputed_vk);

    // Set the verification key from precomputed if available, else compute it
    vk = precomputed_vk ? precomputed_vk : std::make_shared<VK>(proving_key->proving_key);

    if (!initialized) {
        // If this is the first circuit in the IVC, use oink to complete the decider proving key and generate an oink
        // proof
        MegaOinkProver oink_prover{ proving_key };
        vinfo("computing oink proof...");
        oink_prover.prove();
        vinfo("oink proof constructed");
        proving_key->is_accumulator = true; // indicate to PG that it should not run oink on this key
        // Initialize the gate challenges to zero for use in first round of folding
        proving_key->gate_challenges = std::vector<FF>(CONST_PG_LOG_N, 0);

        fold_output.accumulator = proving_key; // initialize the prover accum with the completed key

        // Add oink proof and corresponding verification key to the verification queue
        verification_queue.push_back(
            bb::UltraVanillaClientIVC::VerifierInputs{ oink_prover.transcript->proof_data, honk_vk, QUEUE_TYPE::OINK });

        initialized = true;
    } else { // Otherwise, fold the new key into the accumulator
        vinfo("computing proof");
        Prover folding_prover({ fold_output.accumulator, proving_key }, trace_usage_tracker);
        prover_output = prover.prove();
        vinfo("constructed proof");

        // Add fold proof and corresponding verification key to the verification queue
        verification_queue.push_back(
            bb::UltraVanillaClientIVC::VerifierInputs{ fold_output.proof, honk_vk, QUEUE_TYPE::PG });
    }
}

/**
 * @brief Construct a proof for the IVC, which, if verified, fully establishes its correctness
 *
 * @return Proof
 */
UltraVanillaClientIVC::Proof UltraVanillaClientIVC::prove()
{
    if (!one_circuit) {
        previous_proof = construct_and_prove_hiding_circuit();
        ASSERT(merge_verification_queue.size() == 1); // ensure only a single merge proof remains in the queue
    }

    MergeProof& merge_proof = merge_verification_queue[0];
    return { previous_proof, goblin.prove(merge_proof) };
};

bool UltraVanillaClientIVC::verify(const Proof& proof, const VerificationKey& vk)
{

    // Verify the hiding circuit proof
    MegaVerifier verifer{ vk.mega };
    bool mega_verified = verifer.verify_proof(proof.previous_proof);
    vinfo("Mega verified: ", mega_verified);
    // Goblin verification (final merge, eccvm, translator)
    GoblinVerifier goblin_verifier{ vk.eccvm, vk.translator };
    bool goblin_verified = goblin_verifier.verify(proof.goblin_proof);
    vinfo("Goblin verified: ", goblin_verified);
    return goblin_verified && mega_verified;
}

/**
 * @brief Verify a full proof of the IVC
 *
 * @param proof
 * @return bool
 */
bool UltraVanillaClientIVC::verify(const Proof& proof)
{
    auto eccvm_vk = std::make_shared<ECCVMVerificationKey>(goblin.get_eccvm_proving_key());
    auto translator_vk = std::make_shared<TranslatorVerificationKey>(goblin.get_translator_proving_key());
    return verify(proof, { honk_vk, eccvm_vk, translator_vk });
}

/**
 * @brief Construct and verify a proof for the IVC
 * @note Use of this method only makes sense when the prover and verifier are the same entity, e.g. in
 * development/testing.
 *
 */
bool UltraVanillaClientIVC::prove_and_verify()
{
    auto start = std::chrono::steady_clock::now();
    const auto proof = prove();
    auto end = std::chrono::steady_clock::now();
    auto diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    vinfo("time to call UltraVanillaClientIVC::prove: ", diff.count(), " ms.");

    start = end;
    const bool verified = verify(proof);
    end = std::chrono::steady_clock::now();

    diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    vinfo("time to verify UltraVanillaClientIVC proof: ", diff.count(), " ms.");

    return verified;
}

} // namespace bb
