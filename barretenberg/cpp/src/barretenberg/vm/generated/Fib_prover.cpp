

#include "Fib_prover.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/honk/proof_system/lookup_library.hpp"
#include "barretenberg/honk/proof_system/permutation_library.hpp"
#include "barretenberg/honk/proof_system/power_polynomial.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/proof_system/library/grand_product_library.hpp"
#include "barretenberg/relations/lookup_relation.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace proof_system::honk {

using Flavor = honk::flavor::FibFlavor;

/**
 * Create FibProver from proving key, witness and manifest.
 *
 * @param input_key Proving key.
 * @param input_manifest Input manifest
 *
 * @tparam settings Settings class.
 * */
FibProver::FibProver(std::shared_ptr<Flavor::ProvingKey> input_key, std::shared_ptr<PCSCommitmentKey> commitment_key)
    : key(input_key)
    , commitment_key(commitment_key)
{
    // TODO: take every polynomial and assign it to the key!!

    prover_polynomials.Fibonacci_LAST = key->Fibonacci_LAST;
    prover_polynomials.Fibonacci_FIRST = key->Fibonacci_FIRST;
    prover_polynomials.Fibonacci_x = key->Fibonacci_x;
    prover_polynomials.Fibonacci_y = key->Fibonacci_y;

    prover_polynomials.Fibonacci_x = key->Fibonacci_x;
    prover_polynomials.Fibonacci_x_shift = key->Fibonacci_x.shifted();

    prover_polynomials.Fibonacci_y = key->Fibonacci_y;
    prover_polynomials.Fibonacci_y_shift = key->Fibonacci_y.shifted();

    // prover_polynomials.lookup_inverses = key->lookup_inverses;
    // key->z_perm = Polynomial(key->circuit_size);
    // prover_polynomials.z_perm = key->z_perm;
}

/**
 * @brief Add circuit size, public input size, and public inputs to transcript
 *
 */
void FibProver::execute_preamble_round()
{
    const auto circuit_size = static_cast<uint32_t>(key->circuit_size);

    transcript.send_to_verifier("circuit_size", circuit_size);
}

/**
 * @brief Compute commitments to the first three wires
 *
 */
void FibProver::execute_wire_commitments_round()
{
    auto wire_polys = key->get_wires();
    auto labels = commitment_labels.get_wires();
    for (size_t idx = 0; idx < wire_polys.size(); ++idx) {
        transcript.send_to_verifier(labels[idx], commitment_key->commit(wire_polys[idx]));
    }
}

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
void FibProver::execute_relation_check_rounds()
{
    using Sumcheck = sumcheck::SumcheckProver<Flavor>;

    auto sumcheck = Sumcheck(key->circuit_size, transcript);
    auto alpha = transcript.get_challenge("alpha");

    sumcheck_output = sumcheck.prove(prover_polynomials, relation_parameters, alpha);
}

/**
 * @brief Execute the ZeroMorph protocol to prove the multilinear evaluations produced by Sumcheck
 * @details See https://hackmd.io/dlf9xEwhTQyE3hiGbq4FsA?view for a complete description of the unrolled protocol.
 *
 * */
void FibProver::execute_zeromorph_rounds()
{
    ZeroMorph::prove(prover_polynomials.get_unshifted(),
                     prover_polynomials.get_to_be_shifted(),
                     sumcheck_output.claimed_evaluations.get_unshifted(),
                     sumcheck_output.claimed_evaluations.get_shifted(),
                     sumcheck_output.challenge,
                     commitment_key,
                     transcript);
}

plonk::proof& FibProver::export_proof()
{
    proof.proof_data = transcript.proof_data;
    return proof;
}

plonk::proof& FibProver::construct_proof()
{
    // Add circuit size public input size and public inputs to transcript.
    execute_preamble_round();

    // Compute wire commitments
    execute_wire_commitments_round();

    // TODO: not implemented for codegen just yet
    // Compute sorted list accumulator and commitment
    // execute_log_derivative_commitments_round();

    // Fiat-Shamir: bbeta & gamma
    // Compute grand product(s) and commitments.
    // execute_grand_product_computation_round();

    // Fiat-Shamir: alpha
    // Run sumcheck subprotocol.
    execute_relation_check_rounds();

    // Fiat-Shamir: rho, y, x, z
    // Execute Zeromorph multilinear PCS
    execute_zeromorph_rounds();

    return export_proof();
}

} // namespace proof_system::honk
