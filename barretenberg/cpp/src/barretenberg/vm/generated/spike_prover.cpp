

#include "spike_prover.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/honk/proof_system/permutation_library.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_library.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/relations/lookup_relation.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb {

using Flavor = SpikeFlavor;
using FF = Flavor::FF;

/**
 * Create SpikeProver from proving key, witness and manifest.
 *
 * @param input_key Proving key.
 * @param input_manifest Input manifest
 *
 * @tparam settings Settings class.
 * */
SpikeProver::SpikeProver(std::shared_ptr<Flavor::ProvingKey> input_key,
                         std::shared_ptr<PCSCommitmentKey> commitment_key)
    : key(input_key)
    , commitment_key(commitment_key)
{
    for (auto [prover_poly, key_poly] : zip_view(prover_polynomials.get_unshifted(), key->get_all())) {
        ASSERT(bb::flavor_get_label(prover_polynomials, prover_poly) == bb::flavor_get_label(*key, key_poly));
        prover_poly = key_poly.share();
    }
    for (auto [prover_poly, key_poly] : zip_view(prover_polynomials.get_shifted(), key->get_to_be_shifted())) {
        ASSERT(bb::flavor_get_label(prover_polynomials, prover_poly) ==
               bb::flavor_get_label(*key, key_poly) + "_shift");
        prover_poly = key_poly.shifted();
    }
}

/**
 * @brief Add circuit size, public input size, and public inputs to transcript
 *
 */
// void SpikeProver::execute_preamble_round(SpikeProver::PublicInputColumns public_inputs)
// TODO(md): as we are sending the commitment to the verifier, we do NOT need to send the public inputs to the verifier
// one by one. We only do so in this case in preparation for when we stop sending the commitment
void SpikeProver::execute_preamble_round(std::vector<FF> public_inputs)
{
    const auto circuit_size = static_cast<uint32_t>(key->circuit_size);

    transcript->send_to_verifier("circuit_size", circuit_size);

    // send all of the public inputs to the prover - this wont work
    for (size_t i = 0; i < public_inputs.size(); ++i) {
        auto public_input_i = public_inputs[i];
        // TODO:
        transcript->send_to_verifier("public_input_" + std::to_string(i), public_input_i);
    }
}

/**
 * @brief Compute commitments to all of the witness wires (apart from the logderivative inverse wires)
 *
 */
void SpikeProver::execute_wire_commitments_round()
{

    // Commit to all polynomials (apart from logderivative inverse polynomials, which are committed to in the later
    // logderivative phase)
    witness_commitments.Spike_kernel_inputs__is_public = commitment_key->commit(key->Spike_kernel_inputs__is_public);
    witness_commitments.Spike_x = commitment_key->commit(key->Spike_x);

    // Send all commitments to the verifier
    // transcript->send_to_verifier(commitment_labels.Spike_kernel_inputs__is_public,
    //                              witness_commitments.Spike_kernel_inputs__is_public);
    transcript->send_to_verifier(commitment_labels.Spike_x, witness_commitments.Spike_x);
}

void SpikeProver::execute_log_derivative_inverse_round()
{

    auto [beta, gamm] = transcript->template get_challenges<FF>("beta", "gamma");
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamm;

    key->compute_logderivative_inverses(relation_parameters);

    // Commit to all logderivative inverse polynomials

    // Send all commitments to the verifier
}

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
void SpikeProver::execute_relation_check_rounds()
{
    using Sumcheck = SumcheckProver<Flavor>;

    auto sumcheck = Sumcheck(key->circuit_size, transcript);

    FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");
    std::vector<FF> gate_challenges(numeric::get_msb(key->circuit_size));

    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }
    sumcheck_output = sumcheck.prove(prover_polynomials, relation_parameters, alpha, gate_challenges);
}

/**
 * @brief Execute the ZeroMorph protocol to prove the multilinear evaluations produced by Sumcheck
 * @details See https://hackmd.io/dlf9xEwhTQyE3hiGbq4FsA?view for a complete description of the unrolled protocol.
 *
 * */
void SpikeProver::execute_zeromorph_rounds()
{
    ZeroMorph::prove(prover_polynomials.get_unshifted(),
                     prover_polynomials.get_to_be_shifted(),
                     sumcheck_output.claimed_evaluations.get_unshifted(),
                     sumcheck_output.claimed_evaluations.get_shifted(),
                     sumcheck_output.challenge,
                     commitment_key,
                     transcript);
}

HonkProof& SpikeProver::export_proof()
{
    proof = transcript->proof_data;
    return proof;
}

// TODO: maybe the public inputs can be sent in the circuit builder?
HonkProof& SpikeProver::construct_proof(std::vector<FF> public_inputs)
{
    // Add circuit size public input size and public inputs to transcript.
    execute_preamble_round(public_inputs);

    // Compute wire commitments
    execute_wire_commitments_round();

    // Compute sorted list accumulator and commitment
    execute_log_derivative_inverse_round();

    // Fiat-Shamir: alpha
    // Run sumcheck subprotocol.
    execute_relation_check_rounds();

    // Fiat-Shamir: rho, y, x, z
    // Execute Zeromorph multilinear PCS
    execute_zeromorph_rounds();

    return export_proof();
}

} // namespace bb
