#include "barretenberg/ultra_vanilla_client_ivc/ultra_vanilla_client_ivc.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"

namespace bb {

/**
 * @brief Execute one IVC step
 *
 * @param circuit
 * @param precomputed_vk
 */
void UltraVanillaClientIVC::accumulate(Circuit& circuit, const Proof& proof, const std::shared_ptr<VK>& vk)
{
    RecursiveVerifier verifier{ &circuit, std::make_shared<RecursiveVK>(&circuit, vk) };
    Accumulator agg_obj = stdlib::recursion::init_default_aggregation_state<Circuit, stdlib::bn254<Circuit>>(circuit);
    accumulator = verifier.verify_proof(proof, agg_obj).agg_obj;
}

HonkProof UltraVanillaClientIVC::prove(std::vector<Circuit> circuits,
                                       std::vector<std::optional<std::shared_ptr<VK>>> vks)
{
    for (size_t step = 0; auto [circuit, vk] : zip_view(circuits, vks)) {
        if (step == 0) {
            accumulator_indices = stdlib::recursion::init_default_agg_obj_indices(circuit);
        } else {
            accumulate(circuit, previous_proof, previous_vk);
            accumulator_indices = accumulator.get_witness_indices();
        }

        circuit.add_pairing_point_accumulator(accumulator_indices);

        auto proving_key = std::make_shared<PK>(circuit);

        if (step < circuits.size() - 1) {
            UltraProver prover{ proving_key, commitment_key };
            previous_proof = prover.construct_proof();
        } else {
            // WORKTODO: use ZK here
            UltraProver prover{ proving_key, commitment_key };
            previous_proof = prover.construct_proof();
        }

        previous_vk = vk.has_value() ? *vk : std::make_shared<VK>(proving_key->proving_key);
        step++;
    }
    return previous_proof;
};

bool UltraVanillaClientIVC::verify(const Proof& proof, const std::shared_ptr<VK>& vk)
{

    // Verify the hiding circuit proof
    UltraVerifier verifer{ vk };
    const bool verified = verifer.verify_proof(proof);
    vinfo("verified: ", verified);
    return verified;
}

/**
 * @brief Construct and verify a proof for the IVC
 * @note Use of this method only makes sense when the prover and verifier are the same entity, e.g. in
 * development/testing.
 *
 */
bool UltraVanillaClientIVC::prove_and_verify(std::vector<Circuit> circuits,
                                             std::vector<std::optional<std::shared_ptr<VK>>> vks)
{
    auto start = std::chrono::steady_clock::now();
    prove(circuits, vks);
    auto end = std::chrono::steady_clock::now();
    auto diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    vinfo("time to call UltraVanillaClientIVC::prove: ", diff.count(), " ms.");

    start = end;
    const bool verified = verify(previous_proof, previous_vk);
    end = std::chrono::steady_clock::now();

    diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    vinfo("time to verify UltraVanillaClientIVC proof: ", diff.count(), " ms.");

    return verified;
}

} // namespace bb
