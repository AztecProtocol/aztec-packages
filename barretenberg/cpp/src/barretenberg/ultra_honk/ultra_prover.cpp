// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "ultra_prover.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/flavor/mega_avm_flavor.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
namespace bb {

template <typename Flavor>
UltraProver_<Flavor>::UltraProver_(std::shared_ptr<ProverInstance> prover_instance,
                                   const std::shared_ptr<HonkVK>& honk_vk,
                                   const std::shared_ptr<Transcript>& transcript)
    : prover_instance(std::move(prover_instance))
    , transcript(transcript)
    , honk_vk(honk_vk)
{}

/**
 * @brief Export the complete proof, including IPA proof for rollup circuits
 * @details Two-level proof structure for rollup circuits:
 *
 * **Prover Level (this function):**
 *   [public_inputs | honk_proof | ipa_proof]
 *   - Appends IPA proof if prover_instance->ipa_proof is non-empty
 *   - SYMMETRIC with UltraVerifier_::split_rollup_proof() which extracts the IPA portion
 *
 * **API Level (bbapi):**
 *   - _prove() further splits into: public_inputs (ACIR only) vs proof (rest including IPA)
 *   - concatenate_proof() reassembles for verification
 *
 * @note IPA_PROOF_LENGTH is defined in ipa.hpp as 4*CONST_ECCVM_LOG_N + 4 = 64 elements
 */
template <typename Flavor> typename UltraProver_<Flavor>::Proof UltraProver_<Flavor>::export_proof()
{
    auto proof = transcript->export_proof();

    // Append IPA proof if present
    if (!prover_instance->ipa_proof.empty()) {
        BB_ASSERT_EQ(prover_instance->ipa_proof.size(), static_cast<size_t>(IPA_PROOF_LENGTH));
        proof.insert(proof.end(), prover_instance->ipa_proof.begin(), prover_instance->ipa_proof.end());
    }

    return proof;
}

template <typename Flavor> void UltraProver_<Flavor>::generate_gate_challenges()
{
    virtual_log_n =
        Flavor::USE_PADDING ? Flavor::VIRTUAL_LOG_N : static_cast<size_t>(prover_instance->log_dyadic_size());

    prover_instance->gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", virtual_log_n);
}

template <typename Flavor> typename UltraProver_<Flavor>::Proof UltraProver_<Flavor>::construct_proof()
{
    // The CRS only needs to accommodate the actual data extent (max_end_index) rather than the
    // full dyadic_size. All committed polynomials fit within this bound: witness/selector polys
    // have backing ≤ max_end_index, Gemini fold polys have size ≤ dyadic_size/2 < max_end_index,
    // Shplonk quotient Q is sized at max(claim sizes), and KZG opening proof is sized at Q.size().
    // For ZK, the gemini_masking_poly (at dyadic_size) is already reflected in max_end_index.
    size_t key_size = prover_instance->polynomials.max_end_index();
    if constexpr (Flavor::HasZK) {
        // Masking tails extend A_0 to dyadic_size in Gemini, so the commitment key must
        // accommodate the full dyadic circuit size (Shplonk quotient may be dyadic-sized).
        // SmallSubgroupIPA also commits fixed-size polynomials (up to SUBGROUP_SIZE + 3).
        constexpr size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(Curve::SUBGROUP_SIZE));
        key_size = std::max({ key_size, prover_instance->dyadic_size(), size_t{ 1 } << (log_subgroup_size + 1) });
    }
    commitment_key = CommitmentKey(key_size);

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
 * @brief Run Sumcheck to establish that ∑_i pow(\vec{β*})f_i(ω) = 0, producing sumcheck round challenges
 * u = (u_1,...,u_d) and claimed evaluations at u.
 */
template <typename Flavor> void UltraProver_<Flavor>::execute_sumcheck_iop()
{
    BB_BENCH_NAME("sumcheck.prove");

    using Sumcheck = SumcheckProver<Flavor>;
    size_t polynomial_size = prover_instance->dyadic_size();
    Sumcheck sumcheck(polynomial_size,
                      prover_instance->polynomials,
                      transcript,
                      prover_instance->alpha,
                      prover_instance->gate_challenges,
                      prover_instance->relation_parameters,
                      virtual_log_n);

    if constexpr (Flavor::HasZK) {
        zk_sumcheck_data = ZKData(numeric::get_msb(polynomial_size), transcript, commitment_key);
        sumcheck_output = sumcheck.prove(zk_sumcheck_data, prover_instance->masking_tail_data);
    } else {
        sumcheck_output = sumcheck.prove();
    }
}

/**
 * @brief Reduce the sumcheck multivariate evaluations to a single univariate opening claim via Shplemini,
 * then produce an opening proof with the PCS (KZG or IPA).
 */
template <typename Flavor> void UltraProver_<Flavor>::execute_pcs()
{
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;

    auto& ck = commitment_key;

    PolynomialBatcher polynomial_batcher(prover_instance->dyadic_size(), prover_instance->polynomials.max_end_index());
    polynomial_batcher.set_unshifted(prover_instance->polynomials.get_unshifted());
    polynomial_batcher.set_to_be_shifted_by_one(prover_instance->polynomials.get_to_be_shifted());

    // For ZK: register masking tail polynomials with the batcher so PCS includes them
    if constexpr (Flavor::HasZK) {
        if (prover_instance->masking_tail_data.is_active()) {
            prover_instance->masking_tail_data.add_tails_to_batcher(prover_instance->polynomials, polynomial_batcher);
        }
    }

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
template class UltraProver_<MegaFlavor>;
template class UltraProver_<MegaZKFlavor>;
template class UltraProver_<MegaAvmFlavor>;

} // namespace bb
