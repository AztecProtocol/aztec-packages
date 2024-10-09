#include "decider_prover.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb {

/**
 * Create DeciderProver_ from an accumulator.
 *
 * @param accumulator Relaxed instance (ϕ, ω, \vec{β}, e) whose proof we want to generate, produced by Protogalaxy
 * folding prover
 *
 * @tparam a type of UltraFlavor
 * */
template <IsUltraFlavor Flavor>
DeciderProver_<Flavor>::DeciderProver_(const std::shared_ptr<DeciderPK>& proving_key,
                                       const std::shared_ptr<Transcript>& transcript)
    : proving_key(std::move(proving_key))
    , transcript(transcript)
{}

/**
 * @brief Run Sumcheck to establish that ∑_i pow(\vec{β*})f_i(ω) = e*. This results in u = (u_1,...,u_d) sumcheck round
 * challenges and all evaluations at u being calculated.
 *
 */
template <IsUltraFlavor Flavor> void DeciderProver_<Flavor>::execute_relation_check_rounds()
{
    using Sumcheck = SumcheckProver<Flavor>;
    size_t polynomial_size = proving_key->proving_key.circuit_size;
    auto sumcheck = Sumcheck(polynomial_size, transcript);
    {

#ifdef TRACY_MEMORY
        ZoneScopedN("sumcheck.prove");
#endif
        sumcheck_output = sumcheck.prove(proving_key->proving_key.polynomials,
                                         proving_key->relation_parameters,
                                         proving_key->alphas,
                                         proving_key->gate_challenges);
    }
}

/**
 * @brief Execute the ZeroMorph protocol to produce an opening claim for the multilinear evaluations produced by
 * Sumcheck and then produce an opening proof with a univariate PCS.
 * @details See https://hackmd.io/dlf9xEwhTQyE3hiGbq4FsA?view for a complete description of the unrolled protocol.
 *
 * */
template <IsUltraFlavor Flavor> void DeciderProver_<Flavor>::execute_pcs_rounds()
{
    if (proving_key->proving_key.commitment_key == nullptr) {
        proving_key->proving_key.commitment_key =
            std::make_shared<CommitmentKey>(proving_key->proving_key.circuit_size);
    }
    using OpeningClaim = ProverOpeningClaim<Curve>;

    const OpeningClaim prover_opening_claim =
        ShpleminiProver_<Curve>::prove(proving_key->proving_key.circuit_size,
                                       proving_key->proving_key.polynomials.get_unshifted(),
                                       proving_key->proving_key.polynomials.get_to_be_shifted(),
                                       sumcheck_output.challenge,
                                       proving_key->proving_key.commitment_key,
                                       transcript);
    PCS::compute_opening_proof(proving_key->proving_key.commitment_key, prover_opening_claim, transcript);
}

template <IsUltraFlavor Flavor> HonkProof DeciderProver_<Flavor>::export_proof()
{
    proof = transcript->proof_data;
    return proof;
}

template <IsUltraFlavor Flavor> HonkProof DeciderProver_<Flavor>::construct_proof()
{
    BB_OP_COUNT_TIME_NAME("Decider::construct_proof");

    // Run sumcheck subprotocol.
    execute_relation_check_rounds();

    // Fiat-Shamir: rho, y, x, z
    // Execute Zeromorph multilinear PCS
    execute_pcs_rounds();

    return export_proof();
}

template class DeciderProver_<UltraFlavor>;
template class DeciderProver_<UltraKeccakFlavor>;
template class DeciderProver_<MegaFlavor>;

} // namespace bb
