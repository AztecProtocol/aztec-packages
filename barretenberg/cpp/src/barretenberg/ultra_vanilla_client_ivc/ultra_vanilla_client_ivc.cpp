#include "barretenberg/ultra_vanilla_client_ivc/ultra_vanilla_client_ivc.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"

namespace bb {

void UltraVanillaClientIVC::accumulate(Circuit& circuit, const Proof& proof, const std::shared_ptr<VK>& vk)
{
    RecursiveVerifier verifier{ &circuit, std::make_shared<RecursiveVK>(&circuit, vk) };
    Accumulator agg_obj = stdlib::recursion::init_default_aggregation_state<Circuit, stdlib::bn254<Circuit>>(circuit);
    accumulator = verifier.verify_proof(proof, agg_obj).agg_obj;
}

HonkProof UltraVanillaClientIVC::prove(CircuitSource<Flavor>& source, const bool cache_vks)
{
    for (size_t step = 0; step < source.num_circuits(); step++) {
        auto [circuit, vk] = source.next();
        if (step == 0) {
            accumulator_indices = stdlib::recursion::init_default_agg_obj_indices(circuit);
        } else {
            accumulate(circuit, previous_proof, previous_vk);
            accumulator_indices = accumulator.get_witness_indices();
        }

        circuit.add_pairing_point_accumulator(accumulator_indices);
        accumulator_value = { accumulator.P0.get_value(), accumulator.P1.get_value() };

        auto proving_key = std::make_shared<PK>(circuit);

        if (step < source.num_circuits() - 1) {
            UltraProver prover{ proving_key, commitment_key };
            previous_proof = prover.construct_proof();
        } else {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1176) Use UltraZKProver when it exists
            UltraProver prover{ proving_key, commitment_key };
            previous_proof = prover.construct_proof();
        }

        previous_vk = vk ? vk : std::make_shared<VK>(proving_key->proving_key);
        if (cache_vks) {
            vk_cache.push_back(previous_vk);
        }
    }
    return previous_proof;
};

bool UltraVanillaClientIVC::verify(const Proof& proof, const std::shared_ptr<VK>& vk)
{

    UltraVerifier verifer{ vk };
    bool verified = verifer.verify_proof(proof);
    vinfo("proof verified: ", verified);

    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    auto pcs_verification_key = std::make_shared<VerifierCommitmentKey>();
    verified &= pcs_verification_key->pairing_check(accumulator_value[0], accumulator_value[1]);
    vinfo("pairing verified: ", verified);
    return verified;
}

/**
 * @brief Construct and verify a proof for the IVC
 * @note Use of this method only makes sense when the prover and verifier are the same entity, e.g. in
 * development/testing.
 *
 */
bool UltraVanillaClientIVC::prove_and_verify(CircuitSource<Flavor>& source, const bool cache_vks)
{
    auto start = std::chrono::steady_clock::now();
    prove(source, cache_vks);
    auto end = std::chrono::steady_clock::now();
    auto diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    vinfo("time to call UltraVanillaClientIVC::prove: ", diff.count(), " ms.");

    start = end;
    bool verified = verify(previous_proof, previous_vk);
    end = std::chrono::steady_clock::now();

    diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    vinfo("time to verify UltraVanillaClientIVC proof: ", diff.count(), " ms.");

    return verified;
}

std::vector<std::shared_ptr<UltraFlavor::VerificationKey>> UltraVanillaClientIVC::compute_vks(
    CircuitSource<Flavor>& source)
{
    prove_and_verify(source, /*cache_vks=*/true);
    return vk_cache;
};

} // namespace bb
