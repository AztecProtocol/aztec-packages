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

        PROFILE_THIS_NAME("sumcheck.prove");
        if constexpr (Flavor::HasZK) {
            auto commitment_key = std::make_shared<CommitmentKey>(Flavor::BATCHED_RELATION_PARTIAL_LENGTH);
            zk_sumcheck_data = ZKSumcheckData<Flavor>(numeric::get_msb(polynomial_size), transcript, commitment_key);
            sumcheck_output = sumcheck.prove(proving_key->proving_key.polynomials,
                                             proving_key->relation_parameters,
                                             proving_key->alphas,
                                             proving_key->gate_challenges,
                                             zk_sumcheck_data);
        } else {
            sumcheck_output = sumcheck.prove(proving_key->proving_key.polynomials,
                                             proving_key->relation_parameters,
                                             proving_key->alphas,
                                             proving_key->gate_challenges);
        }
    }
}

/**
 * @brief Produce a univariate opening claim for the sumcheck multivariate evalutions and a batched univariate claim
 * for the transcript polynomials (for the Translator consistency check). Reduce the two opening claims to a single one
 * via Shplonk and produce an opening proof with the univariate PCS of choice (IPA when operating on Grumpkin).
 *
 */
template <IsUltraFlavor Flavor> void DeciderProver_<Flavor>::execute_pcs_rounds()
{
    using OpeningClaim = ProverOpeningClaim<Curve>;

    auto& ck = proving_key->proving_key.commitment_key;
    ck = ck ? ck : std::make_shared<CommitmentKey>(proving_key->proving_key.circuit_size);

    OpeningClaim prover_opening_claim;
    if constexpr (!Flavor::HasZK) {

        prover_opening_claim = ShpleminiProver_<Curve>::prove(proving_key->proving_key.circuit_size,
                                                              proving_key->proving_key.polynomials.get_unshifted(),
                                                              proving_key->proving_key.polynomials.get_to_be_shifted(),
                                                              sumcheck_output.challenge,
                                                              ck,
                                                              transcript);
    } else {
        using namespace std::chrono;

        auto total_time = 0.0;
        auto start = high_resolution_clock::now();

        zk_sumcheck_data.compute_witnesses_and_commit(sumcheck_output.challenge, transcript, ck);

        auto end = high_resolution_clock::now();
        total_time += duration<double, std::milli>(end - start).count();

        info("total time", total_time);

        std::array<Polynomial, 4> libra_polynomials = { zk_sumcheck_data.libra_concatenated_monomial_form,
                                                        zk_sumcheck_data.big_sum_polynomial,
                                                        zk_sumcheck_data.big_sum_polynomial,
                                                        zk_sumcheck_data.batched_quotient };

        prover_opening_claim = ShpleminiProver_<Curve>::prove(proving_key->proving_key.circuit_size,
                                                              proving_key->proving_key.polynomials.get_unshifted(),
                                                              proving_key->proving_key.polynomials.get_to_be_shifted(),
                                                              sumcheck_output.challenge,
                                                              ck,
                                                              transcript,
                                                              libra_polynomials,
                                                              sumcheck_output.claimed_libra_evaluation);
    }
    vinfo("executed multivariate-to-univariate reduction");
    PCS::compute_opening_proof(ck, prover_opening_claim, transcript);
    vinfo("computed opening proof");
}

template <IsUltraFlavor Flavor> HonkProof DeciderProver_<Flavor>::export_proof()
{
    proof = transcript->proof_data;
    return proof;
}

template <IsUltraFlavor Flavor> HonkProof DeciderProver_<Flavor>::construct_proof()
{
    PROFILE_THIS_NAME("Decider::construct_proof");

    // Run sumcheck subprotocol.
    vinfo("executing relation checking rounds...");
    execute_relation_check_rounds();

    // Fiat-Shamir: rho, y, x, z
    // Execute Shplemini PCS
    vinfo("executing pcs opening rounds...");
    execute_pcs_rounds();

    return export_proof();
}

template class DeciderProver_<UltraFlavor>;
template class DeciderProver_<UltraRollupFlavor>;
template class DeciderProver_<UltraKeccakFlavor>;
template class DeciderProver_<MegaFlavor>;
template class DeciderProver_<MegaZKFlavor>;

} // namespace bb
