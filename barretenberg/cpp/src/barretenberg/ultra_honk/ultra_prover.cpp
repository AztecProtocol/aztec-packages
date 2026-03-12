// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "ultra_prover.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/interleaved_group_batching.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/flavor/mega_avm_flavor.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
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
    constexpr size_t BATCH_SIZE = Flavor::INTERLEAVING_BATCH_SIZE;

    size_t key_size = prover_instance->dyadic_size() * BATCH_SIZE;
    if constexpr (Flavor::HasZK) {
        constexpr size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(Curve::SUBGROUP_SIZE));
        key_size = std::max(key_size, size_t{ 1 } << (log_subgroup_size + 1));
    }
    commitment_key = CommitmentKey(key_size);

    OinkProver<Flavor> oink_prover(prover_instance, honk_vk, transcript);
    oink_prover.commitment_key = commitment_key;
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
        sumcheck_output = sumcheck.prove(zk_sumcheck_data);
    } else {
        sumcheck_output = sumcheck.prove();
    }
}

/**
 * @brief Reduce the sumcheck multivariate evaluations to a single univariate opening claim via Shplemini,
 * then produce an opening proof with the PCS (KZG or IPA).
 *
 * For interleaved flavors (BATCH_SIZE > 1), adds interleaving challenges, pre-batches polynomial groups,
 * and uses interleaved PCS flow.
 */
template <typename Flavor> void UltraProver_<Flavor>::execute_pcs()
{
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;
    using Polynomial = typename Flavor::Polynomial;

    constexpr size_t BATCH_SIZE = Flavor::INTERLEAVING_BATCH_SIZE;
    constexpr size_t LOG_K = Flavor::INTERLEAVING_LOG_K;

    auto& ck = commitment_key;
    if (!ck.initialized()) {
        size_t ck_size = prover_instance->dyadic_size() * BATCH_SIZE;
        if constexpr (Flavor::HasZK) {
            ck_size = std::max(ck_size, 2 * static_cast<size_t>(Curve::SUBGROUP_SIZE));
        }
        ck = CommitmentKey(ck_size);
    }

    const size_t n = prover_instance->dyadic_size();
    const size_t pcs_size = n * BATCH_SIZE;

    // Build full challenge vector: interleaving challenges (if any) + sumcheck challenges
    std::vector<FF> full_challenge;
    full_challenge.reserve(LOG_K + sumcheck_output.challenge.size());
    for (size_t i = 0; i < LOG_K; i++) {
        full_challenge.push_back(
            transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_" + std::to_string(i)));
    }
    full_challenge.insert(full_challenge.end(), sumcheck_output.challenge.begin(), sumcheck_output.challenge.end());

    // ZK: SmallSubgroupIPA
    std::array<Polynomial, NUM_SMALL_IPA_EVALUATIONS> libra_witness_polys{};
    if constexpr (Flavor::HasZK) {
        SmallSubgroupIPA small_subgroup_ipa_prover(
            zk_sumcheck_data, sumcheck_output.challenge, sumcheck_output.claimed_libra_evaluation, transcript, ck);
        small_subgroup_ipa_prover.prove();
        libra_witness_polys = small_subgroup_ipa_prover.get_witness_polynomials();
    }

    // Set up polynomial batcher and prove opening
    OpeningClaim prover_opening_claim;

    if constexpr (BATCH_SIZE > 1) {
        // Pre-batch interleaved polynomial groups into 2 polynomials
        constexpr size_t NUM_UNSHIFTED = Flavor::NUM_ALL_INTERLEAVED_COMMITMENTS;
        constexpr size_t NUM_SHIFTED = Flavor::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS;
        auto [unshifted_challenges, shifted_challenges] =
            get_interleaved_batching_challenges<FF>(transcript, NUM_UNSHIFTED, NUM_SHIFTED);

        Polynomial batched_unshifted;
        Polynomial batched_to_be_shifted;
        {
            auto polys = std::move(prover_instance->polynomials);
            auto unshifted_groups = Flavor::get_unshifted_groups_mut(polys);
            auto shifted_groups = Flavor::get_to_be_shifted_groups(polys);
            std::tie(batched_unshifted, batched_to_be_shifted) = batch_interleaved_polynomial_groups<FF>(
                unshifted_groups, shifted_groups, unshifted_challenges, shifted_challenges, n, BATCH_SIZE);
        }
        vinfo("pre-batched interleaved groups");

        PolynomialBatcher polynomial_batcher(pcs_size, BATCH_SIZE);
        polynomial_batcher.set_unshifted(RefVector<Polynomial>(batched_unshifted));
        polynomial_batcher.set_to_be_shifted(RefVector<Polynomial>(batched_to_be_shifted));

        if constexpr (Flavor::HasZK) {
            prover_opening_claim = ShpleminiProver_<Curve>::prove(
                pcs_size, polynomial_batcher, full_challenge, ck, transcript, libra_witness_polys);
        } else {
            prover_opening_claim =
                ShpleminiProver_<Curve>::prove(pcs_size, polynomial_batcher, full_challenge, ck, transcript);
        }
    } else {
        PolynomialBatcher polynomial_batcher(pcs_size);
        polynomial_batcher.set_unshifted(prover_instance->polynomials.get_unshifted());
        polynomial_batcher.set_to_be_shifted(prover_instance->polynomials.get_to_be_shifted());

        if constexpr (Flavor::HasZK) {
            prover_opening_claim = ShpleminiProver_<Curve>::prove(
                pcs_size, polynomial_batcher, full_challenge, ck, transcript, libra_witness_polys);
        } else {
            prover_opening_claim =
                ShpleminiProver_<Curve>::prove(pcs_size, polynomial_batcher, full_challenge, ck, transcript);
        }
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
template class UltraProver_<MultiMegaFlavor>;
template class UltraProver_<MultiMegaZKFlavor>;

} // namespace bb
