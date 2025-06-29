// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "decider_prover.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
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
template <IsUltraOrMegaHonk Flavor>
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
template <IsUltraOrMegaHonk Flavor> void DeciderProver_<Flavor>::execute_relation_check_rounds()
{
    using Sumcheck = SumcheckProver<Flavor>;
    size_t polynomial_size = proving_key->metadata.circuit_size;
    auto sumcheck = Sumcheck(polynomial_size, transcript);
    {

        PROFILE_THIS_NAME("sumcheck.prove");

        if constexpr (Flavor::HasZK) {
            const size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(Curve::SUBGROUP_SIZE));
            CommitmentKey commitment_key(1 << (log_subgroup_size + 1));
            zk_sumcheck_data = ZKData(numeric::get_msb(polynomial_size), transcript, commitment_key);
            sumcheck_output = sumcheck.prove(proving_key->polynomials,
                                             proving_key->relation_parameters,
                                             proving_key->alphas,
                                             proving_key->gate_challenges,
                                             zk_sumcheck_data);
        } else {

            sumcheck_output = sumcheck.prove(proving_key->polynomials,
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
template <IsUltraOrMegaHonk Flavor> void DeciderProver_<Flavor>::execute_pcs_rounds()
{
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;

    auto& ck = proving_key->commitment_key;
    if (!ck.initialized()) {
        ck = CommitmentKey(proving_key->dyadic_circuit_size);
    }

    PolynomialBatcher polynomial_batcher(proving_key->dyadic_circuit_size);
    polynomial_batcher.set_unshifted(proving_key->polynomials.get_unshifted());
    polynomial_batcher.set_to_be_shifted_by_one(proving_key->polynomials.get_to_be_shifted());

    OpeningClaim prover_opening_claim;
    if constexpr (!Flavor::HasZK) {
        prover_opening_claim = ShpleminiProver_<Curve>::prove(
            proving_key->dyadic_circuit_size, polynomial_batcher, sumcheck_output.challenge, ck, transcript);
    } else {

        SmallSubgroupIPA small_subgroup_ipa_prover(
            zk_sumcheck_data, sumcheck_output.challenge, sumcheck_output.claimed_libra_evaluation, transcript, ck);
        small_subgroup_ipa_prover.prove();

        prover_opening_claim = ShpleminiProver_<Curve>::prove(proving_key->dyadic_circuit_size,
                                                              polynomial_batcher,
                                                              sumcheck_output.challenge,
                                                              ck,
                                                              transcript,
                                                              small_subgroup_ipa_prover.get_witness_polynomials());
    }
    vinfo("executed multivariate-to-univariate reduction");
    PCS::compute_opening_proof(ck, prover_opening_claim, transcript);
    vinfo("computed opening proof");
}

template <IsUltraOrMegaHonk Flavor> HonkProof DeciderProver_<Flavor>::export_proof()
{
    return transcript->export_proof();
}

template <IsUltraOrMegaHonk Flavor> void DeciderProver_<Flavor>::construct_proof()
{
    PROFILE_THIS_NAME("Decider::construct_proof");

    // Run sumcheck subprotocol.
    execute_relation_check_rounds();

    // Fiat-Shamir: rho, y, x, z
    // Execute Shplemini PCS
    execute_pcs_rounds();
    vinfo("finished decider proving.");
}

template class DeciderProver_<UltraFlavor>;
template class DeciderProver_<UltraZKFlavor>;
template class DeciderProver_<UltraRollupFlavor>;
template class DeciderProver_<UltraKeccakFlavor>;
#ifdef STARKNET_GARAGA_FLAVORS
template class DeciderProver_<UltraStarknetFlavor>;
template class DeciderProver_<UltraStarknetZKFlavor>;
#endif
template class DeciderProver_<UltraKeccakZKFlavor>;
template class DeciderProver_<MegaFlavor>;
template class DeciderProver_<MegaZKFlavor>;

} // namespace bb
