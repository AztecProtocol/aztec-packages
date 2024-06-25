

#include "copy_prover.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/honk/proof_system/permutation_library.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_library.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb {

using Flavor = CopyFlavor;
using FF = Flavor::FF;

/**
 * Create CopyProver from proving key, witness and manifest.
 *
 * @param input_key Proving key.
 * @param input_manifest Input manifest
 *
 * @tparam settings Settings class.
 * */
CopyProver::CopyProver(std::shared_ptr<Flavor::ProvingKey> input_key, std::shared_ptr<PCSCommitmentKey> commitment_key)
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
void CopyProver::execute_preamble_round()
{
    const auto circuit_size = static_cast<uint32_t>(key->circuit_size);

    transcript->send_to_verifier("circuit_size", circuit_size);
}

/**
 * @brief Compute commitments to all of the witness wires (apart from the logderivative inverse wires)
 *
 */
void CopyProver::execute_wire_commitments_round()
{

    // Commit to all polynomials (apart from logderivative inverse polynomials, which are committed to in the later
    // logderivative phase)
    witness_commitments.copy_a = commitment_key->commit(key->copy_a);
    witness_commitments.copy_b = commitment_key->commit(key->copy_b);
    witness_commitments.copy_c = commitment_key->commit(key->copy_c);
    witness_commitments.copy_d = commitment_key->commit(key->copy_d);
    witness_commitments.copy_sigma_a = commitment_key->commit(key->copy_sigma_a);
    witness_commitments.copy_sigma_b = commitment_key->commit(key->copy_sigma_b);
    witness_commitments.copy_sigma_c = commitment_key->commit(key->copy_sigma_c);
    witness_commitments.copy_sigma_d = commitment_key->commit(key->copy_sigma_d);
    witness_commitments.copy_sigma_x = commitment_key->commit(key->copy_sigma_x);
    witness_commitments.copy_sigma_y = commitment_key->commit(key->copy_sigma_y);
    witness_commitments.copy_sigma_z = commitment_key->commit(key->copy_sigma_z);
    witness_commitments.copy_x = commitment_key->commit(key->copy_x);
    witness_commitments.copy_y = commitment_key->commit(key->copy_y);
    witness_commitments.copy_z = commitment_key->commit(key->copy_z);
    witness_commitments.copy_main = commitment_key->commit(key->copy_main);
    witness_commitments.copy_second = commitment_key->commit(key->copy_second);
    witness_commitments.id_0 = commitment_key->commit(key->id_0);
    witness_commitments.id_1 = commitment_key->commit(key->id_1);
    witness_commitments.id_2 = commitment_key->commit(key->id_2);
    witness_commitments.id_3 = commitment_key->commit(key->id_3);

    // Send all commitments to the verifier
    transcript->send_to_verifier(commitment_labels.copy_a, witness_commitments.copy_a);
    transcript->send_to_verifier(commitment_labels.copy_b, witness_commitments.copy_b);
    transcript->send_to_verifier(commitment_labels.copy_c, witness_commitments.copy_c);
    transcript->send_to_verifier(commitment_labels.copy_d, witness_commitments.copy_d);
    transcript->send_to_verifier(commitment_labels.copy_sigma_a, witness_commitments.copy_sigma_a);
    transcript->send_to_verifier(commitment_labels.copy_sigma_b, witness_commitments.copy_sigma_b);
    transcript->send_to_verifier(commitment_labels.copy_sigma_c, witness_commitments.copy_sigma_c);
    transcript->send_to_verifier(commitment_labels.copy_sigma_d, witness_commitments.copy_sigma_d);
    transcript->send_to_verifier(commitment_labels.copy_sigma_x, witness_commitments.copy_sigma_x);
    transcript->send_to_verifier(commitment_labels.copy_sigma_y, witness_commitments.copy_sigma_y);
    transcript->send_to_verifier(commitment_labels.copy_sigma_z, witness_commitments.copy_sigma_z);
    transcript->send_to_verifier(commitment_labels.copy_x, witness_commitments.copy_x);
    transcript->send_to_verifier(commitment_labels.copy_y, witness_commitments.copy_y);
    transcript->send_to_verifier(commitment_labels.copy_z, witness_commitments.copy_z);
    transcript->send_to_verifier(commitment_labels.copy_main, witness_commitments.copy_main);
    transcript->send_to_verifier(commitment_labels.copy_second, witness_commitments.copy_second);
    transcript->send_to_verifier(commitment_labels.id_0, witness_commitments.id_0);
    transcript->send_to_verifier(commitment_labels.id_1, witness_commitments.id_1);
    transcript->send_to_verifier(commitment_labels.id_2, witness_commitments.id_2);
    transcript->send_to_verifier(commitment_labels.id_3, witness_commitments.id_3);
}

void CopyProver::execute_log_derivative_inverse_round() {}

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
void CopyProver::execute_relation_check_rounds()
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
void CopyProver::execute_zeromorph_rounds()
{
    ZeroMorph::prove(prover_polynomials.get_unshifted(),
                     prover_polynomials.get_to_be_shifted(),
                     sumcheck_output.claimed_evaluations.get_unshifted(),
                     sumcheck_output.claimed_evaluations.get_shifted(),
                     sumcheck_output.challenge,
                     commitment_key,
                     transcript);
}

HonkProof CopyProver::export_proof()
{
    proof = transcript->proof_data;
    return proof;
}

HonkProof CopyProver::construct_proof()
{
    // Add circuit size public input size and public inputs to transcript.
    execute_preamble_round();

    // Compute wire commitments
    execute_wire_commitments_round();

    // Compute sorted list accumulator and commitment

    // Fiat-Shamir: alpha
    // Run sumcheck subprotocol.
    execute_relation_check_rounds();

    // Fiat-Shamir: rho, y, x, z
    // Execute Zeromorph multilinear PCS
    execute_zeromorph_rounds();

    return export_proof();
}

} // namespace bb
