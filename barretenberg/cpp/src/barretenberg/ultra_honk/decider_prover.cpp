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

        size_t log_circuit_size = proving_key->proving_key.log_circuit_size;
        Polynomial big_sum_polynomial(377);
        Polynomial challenge_polynomial(377);
        const size_t big_sum_size = 377;
        // compute challenge polynomial F with coeffs (1, 1, u_1, u_1^2,...., u_{d-1}^12)
        for (size_t poly_idx = 0; poly_idx < log_circuit_size; poly_idx++) {

            for (size_t idx = 0; idx < Flavor::BATCHED_RELATION_PARTIAL_LENGTH; idx++) {
                size_t current_idx = 1 + poly_idx * Flavor::BATCHED_RELATION_PARTIAL_LENGTH + idx;
                info(current_idx);
                challenge_polynomial.at(current_idx) = sumcheck_output.challenge[poly_idx].pow(idx);
            }
        }

        // compute big sum polynomial, commit to it
        big_sum_polynomial.at(0) = FF(0);
        for (size_t idx = 1; idx < big_sum_size; idx++) {
            size_t prev_idx = idx - 1;
            big_sum_polynomial.at(idx) =
                big_sum_polynomial.at(prev_idx) +
                zk_sumcheck_data.polynomial_lagrange_form.at(prev_idx) * challenge_polynomial.at(prev_idx);
            // info(big_sum_polynomial.at(idx));
        }

        Commitment big_sum_commitment = ck->commit(big_sum_polynomial);
        transcript->template send_to_verifier("Libra:big_sum_commitment", big_sum_commitment);

        // compute the quotient polynomial C(x)/Z_H(X)
        // C(x) = L_g(X) A(X) + (X-g) (A(gx) - (A(x) - F(x) G(x))) + L_{1}(x)(A(x) - s)
        // A = big_sum polynomial, in Lagrange basis
        // F = challenge polynomial, in Lagrange basis
        // G = libra in Lagrange basis, i.e. polynomial_lagrange_form

        Polynomial batched_polynomial_lagrange(big_sum_size);
        batched_polynomial_lagrange.at(0) = big_sum_polynomial.at(0);
        batched_polynomial_lagrange.at(big_sum_size - 2) = big_sum_polynomial.at(big_sum_size - 2);
        std::vector<FF> x_minus_g_coeffs(big_sum_size);
        auto generator = zk_sumcheck_data.interpolation_domain[0];
        info(generator.pow(377));
        for (auto generator_power : zk_sumcheck_data.interpolation_domain) {
            x_minus_g_coeffs.push_back(generator_power - generator);
        }

        Polynomial x_minus_g = Polynomial(x_minus_g_coeffs);
        info(x_minus_g.at(0));
        for (size_t idx = 1; idx < big_sum_size - 1; idx++) {
            batched_polynomial_lagrange.at(idx) =
                x_minus_g.at(idx) * (big_sum_polynomial.at(idx + 1) - big_sum_polynomial.at(idx) -
                                     challenge_polynomial.at(idx) * zk_sumcheck_data.polynomial_lagrange_form.at(idx));
            info(batched_polynomial_lagrange.at(idx));
        }

        prover_opening_claim = ShpleminiProver_<Curve>::prove(proving_key->proving_key.circuit_size,
                                                              proving_key->proving_key.polynomials.get_unshifted(),
                                                              proving_key->proving_key.polynomials.get_to_be_shifted(),
                                                              sumcheck_output.challenge,
                                                              ck,
                                                              transcript,
                                                              zk_sumcheck_data.libra_univariates_monomial,
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
