// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "ultra_prover.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
namespace bb {

template <IsUltraOrMegaHonk Flavor>
UltraProver_<Flavor>::UltraProver_(const std::shared_ptr<ProverInstance>& prover_instance,
                                   const std::shared_ptr<HonkVK>& honk_vk,
                                   const CommitmentKey& commitment_key)
    : prover_instance(std::move(prover_instance))
    , honk_vk(honk_vk)
    , transcript(std::make_shared<Transcript>())
    , commitment_key(commitment_key)
{}

/**
 * @brief Create UltraProver_ from a decider proving key.
 *
 * @param prover_instance key whose proof we want to generate.
 *
 * @tparam a type of UltraFlavor
 * */
template <IsUltraOrMegaHonk Flavor>
UltraProver_<Flavor>::UltraProver_(const std::shared_ptr<ProverInstance>& prover_instance,
                                   const std::shared_ptr<HonkVK>& honk_vk,
                                   const std::shared_ptr<Transcript>& transcript)
    : prover_instance(std::move(prover_instance))
    , honk_vk(honk_vk)
    , transcript(transcript)
    , commitment_key(prover_instance->commitment_key)
{}

/**
 * @brief Create UltraProver_ from a circuit.
 *
 * @param circuit Circuit with witnesses whose validity we'd like to prove.
 *
 * @tparam a type of UltraFlavor
 * */
template <IsUltraOrMegaHonk Flavor>
UltraProver_<Flavor>::UltraProver_(Builder& circuit,
                                   const std::shared_ptr<HonkVK>& honk_vk,
                                   const std::shared_ptr<Transcript>& transcript)
    : prover_instance(std::make_shared<ProverInstance>(circuit))
    , honk_vk(honk_vk)
    , transcript(transcript)
    , commitment_key(prover_instance->commitment_key)
{}

template <IsUltraOrMegaHonk Flavor>
UltraProver_<Flavor>::UltraProver_(Builder&& circuit, const std::shared_ptr<HonkVK>& honk_vk)
    : prover_instance(std::make_shared<ProverInstance>(circuit))
    , honk_vk(honk_vk)
    , transcript(std::make_shared<Transcript>())
    , commitment_key(prover_instance->commitment_key)
{}

template <IsUltraOrMegaHonk Flavor> typename UltraProver_<Flavor>::Proof UltraProver_<Flavor>::export_proof()
{
    auto proof = transcript->export_proof();

    // Add the IPA proof
    if constexpr (HasIPAAccumulator<Flavor>) {
        // The extra calculation is for the IPA proof length.
        BB_ASSERT_EQ(prover_instance->ipa_proof.size(), static_cast<size_t>(IPA_PROOF_LENGTH));
        proof.insert(proof.end(), prover_instance->ipa_proof.begin(), prover_instance->ipa_proof.end());
    }

    return proof;
}

template <IsUltraOrMegaHonk Flavor> void UltraProver_<Flavor>::generate_gate_challenges()
{
    // Determine the number of rounds in the sumcheck based on whether or not padding is employed
    const size_t virtual_log_n =
        Flavor::USE_PADDING ? Flavor::VIRTUAL_LOG_N : static_cast<size_t>(prover_instance->log_dyadic_size());

    prover_instance->gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", virtual_log_n);
}

template <IsUltraOrMegaHonk Flavor> typename UltraProver_<Flavor>::Proof UltraProver_<Flavor>::construct_proof()
{
    OinkProver<Flavor> oink_prover(prover_instance, honk_vk, transcript);
    oink_prover.prove();
    vinfo("created oink proof");

    generate_gate_challenges();

    // Run sumcheck
    execute_sumcheck_iop();
    vinfo("finished relation check rounds");
    // Execute Shplemini PCS
    execute_pcs();
    vinfo("finished PCS rounds");

    return export_proof();
}

/**
 * @brief Run Sumcheck to establish that ∑_i pow(\vec{β*})f_i(ω) = 0. This results in u = (u_1,...,u_d) sumcheck round
 * challenges and all evaluations at u being calculated.
 *
 */
template <IsUltraOrMegaHonk Flavor> void UltraProver_<Flavor>::execute_sumcheck_iop()
{
    const size_t virtual_log_n = Flavor::USE_PADDING ? Flavor::VIRTUAL_LOG_N : prover_instance->log_dyadic_size();

    using Sumcheck = SumcheckProver<Flavor>;
    size_t polynomial_size = prover_instance->dyadic_size();
    Sumcheck sumcheck(polynomial_size,
                      prover_instance->polynomials,
                      transcript,
                      prover_instance->alpha,
                      prover_instance->gate_challenges,
                      prover_instance->relation_parameters,
                      virtual_log_n);
    {

        BB_BENCH_NAME("sumcheck.prove");

        if constexpr (Flavor::HasZK) {
            const size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(Curve::SUBGROUP_SIZE));
            CommitmentKey commitment_key(1 << (log_subgroup_size + 1));
            zk_sumcheck_data = ZKData(numeric::get_msb(polynomial_size), transcript, commitment_key);
            sumcheck_output = sumcheck.prove(zk_sumcheck_data);
        } else {
            sumcheck_output = sumcheck.prove();
        }
    }
}

/**
 * @brief Produce a univariate opening claim for the sumcheck multivariate evalutions and a batched univariate claim
 * for the transcript polynomials (for the Translator consistency check). Reduce the two opening claims to a single one
 * via Shplonk and produce an opening proof with the univariate PCS of choice (IPA when operating on Grumpkin).
 *
 */
template <IsUltraOrMegaHonk Flavor> void UltraProver_<Flavor>::execute_pcs()
{
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;

    auto& ck = prover_instance->commitment_key;
    if (!ck.initialized()) {
        ck = CommitmentKey(prover_instance->dyadic_size());
    }

    PolynomialBatcher polynomial_batcher(prover_instance->dyadic_size());
    polynomial_batcher.set_unshifted(prover_instance->polynomials.get_unshifted());
    polynomial_batcher.set_to_be_shifted_by_one(prover_instance->polynomials.get_to_be_shifted());

    OpeningClaim prover_opening_claim;
    if constexpr (!Flavor::HasZK) {
        prover_opening_claim = ShpleminiProver_<Curve>::prove(
            prover_instance->dyadic_size(), polynomial_batcher, sumcheck_output.challenge, ck, transcript);
    } else {

        SmallSubgroupIPA small_subgroup_ipa_prover(
            zk_sumcheck_data, sumcheck_output.challenge, sumcheck_output.claimed_libra_evaluation, transcript, ck);
        small_subgroup_ipa_prover.prove();

        prover_opening_claim = ShpleminiProver_<Curve>::prove(prover_instance->dyadic_size(),
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

template class UltraProver_<UltraFlavor>;
template class UltraProver_<UltraZKFlavor>;
template class UltraProver_<UltraKeccakFlavor>;
#ifdef STARKNET_GARAGA_FLAVORS
template class UltraProver_<UltraStarknetFlavor>;
template class UltraProver_<UltraStarknetZKFlavor>;
#endif
template class UltraProver_<UltraKeccakZKFlavor>;
template class UltraProver_<UltraRollupFlavor>;
template class UltraProver_<MegaFlavor>;
template class UltraProver_<MegaZKFlavor>;

} // namespace bb
