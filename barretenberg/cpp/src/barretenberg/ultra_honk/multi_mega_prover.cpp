// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/ultra_honk/multi_mega_prover.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/flavor/multi_mega_zk_flavor.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/multi_mega_oink_prover.hpp"

namespace bb {

template <IsMultiMegaFlavor Flavor>
MultiMegaProver_<Flavor>::MultiMegaProver_(const std::shared_ptr<ProverInstance>& prover_instance,
                                           const std::shared_ptr<HonkVK>& honk_vk,
                                           const CommitmentKey& commitment_key)
    : prover_instance(std::move(prover_instance))
    , honk_vk(honk_vk)
    , transcript(std::make_shared<Transcript>())
    , commitment_key(commitment_key)
{}

template <IsMultiMegaFlavor Flavor>
MultiMegaProver_<Flavor>::MultiMegaProver_(const std::shared_ptr<ProverInstance>& prover_instance,
                                           const std::shared_ptr<HonkVK>& honk_vk,
                                           const std::shared_ptr<Transcript>& transcript)
    : prover_instance(std::move(prover_instance))
    , honk_vk(honk_vk)
    , transcript(transcript)
    , commitment_key(prover_instance->commitment_key)
{}

template <IsMultiMegaFlavor Flavor>
MultiMegaProver_<Flavor>::MultiMegaProver_(Builder& circuit,
                                           const std::shared_ptr<HonkVK>& honk_vk,
                                           const std::shared_ptr<Transcript>& transcript)
    : prover_instance(std::make_shared<ProverInstance>(circuit))
    , honk_vk(honk_vk)
    , transcript(transcript)
    , commitment_key(prover_instance->commitment_key)
{}

template <IsMultiMegaFlavor Flavor>
MultiMegaProver_<Flavor>::MultiMegaProver_(Builder&& circuit, const std::shared_ptr<HonkVK>& honk_vk)
    : prover_instance(std::make_shared<ProverInstance>(circuit))
    , honk_vk(honk_vk)
    , transcript(std::make_shared<Transcript>())
    , commitment_key(prover_instance->commitment_key)
{}

template <IsMultiMegaFlavor Flavor> typename MultiMegaProver_<Flavor>::Proof MultiMegaProver_<Flavor>::export_proof()
{
    auto proof = transcript->export_proof();

    // Append IPA proof if present
    if (!prover_instance->ipa_proof.empty()) {
        proof.insert(proof.end(), prover_instance->ipa_proof.begin(), prover_instance->ipa_proof.end());
    }

    return proof;
}

template <IsMultiMegaFlavor Flavor> void MultiMegaProver_<Flavor>::generate_gate_challenges()
{
    const size_t virtual_log_n =
        Flavor::USE_PADDING ? Flavor::VIRTUAL_LOG_N : static_cast<size_t>(prover_instance->log_dyadic_size());

    prover_instance->gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", virtual_log_n);
}

template <IsMultiMegaFlavor Flavor> typename MultiMegaProver_<Flavor>::Proof MultiMegaProver_<Flavor>::construct_proof()
{
    // Use MultiMegaOinkProver for interleaved commitments
    MultiMegaOinkProver_<Flavor> oink_prover(prover_instance, honk_vk, transcript);
    oink_prover.prove();

    // Store interleaved commitments for later use (e.g., by verifier via transcript)
    interleaved_commitments = oink_prover.interleaved_commitments;

    vinfo("created oink proof with interleaved commitments");

    generate_gate_challenges();

    // Run sumcheck
    execute_sumcheck_iop();
    vinfo("finished relation check rounds");

    // Execute Shplemini PCS
    execute_pcs();
    vinfo("finished PCS rounds");

    return export_proof();
}

template <IsMultiMegaFlavor Flavor> void MultiMegaProver_<Flavor>::execute_sumcheck_iop()
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
            CommitmentKey ck(1 << (log_subgroup_size + 1));
            zk_sumcheck_data = ZKData(numeric::get_msb(polynomial_size), transcript, ck);
            sumcheck_output = sumcheck.prove(zk_sumcheck_data);
        } else {
            sumcheck_output = sumcheck.prove();
        }
    }
}

template <IsMultiMegaFlavor Flavor> void MultiMegaProver_<Flavor>::execute_pcs()
{
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;
    constexpr size_t BATCH_SIZE = Flavor::INTERLEAVING_BATCH_SIZE;

    const size_t n = prover_instance->dyadic_size();
    const size_t interleaved_size = n * BATCH_SIZE;

    auto& ck = prover_instance->commitment_key;
    if (!ck.initialized()) {
        // For interleaved commitments, we need 4x the polynomial size for the SRS.
        // For ZK, SmallSubgroupIPA also needs 2 * SUBGROUP_SIZE for its polynomial commitments.
        size_t ck_size = interleaved_size;
        if constexpr (Flavor::HasZK) {
            ck_size = std::max(ck_size, 2 * static_cast<size_t>(Curve::SUBGROUP_SIZE));
        }
        ck = CommitmentKey(ck_size);
    }

    // Get interleaving challenges (must match verifier order)
    FF u0 = transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_0");
    FF u1 = transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_1");

    // Build the full challenge vector: prepend interleaving challenges to sumcheck challenges
    std::vector<FF> full_challenge;
    full_challenge.reserve(2 + sumcheck_output.challenge.size());
    full_challenge.push_back(u0);
    full_challenge.push_back(u1);
    full_challenge.insert(full_challenge.end(), sumcheck_output.challenge.begin(), sumcheck_output.challenge.end());

    auto& polys = prover_instance->polynomials;

    // The polynomial batcher picks up ALL interleaved groups from the flavor:
    // - Non-ZK: 17 unshifted groups (8 precomputed + 9 witness) + 3 shifted
    // - ZK: 18 unshifted groups (8 precomputed + 9 witness + 1 masking) + 3 shifted
    // No manual masking handling needed - masking chunks are in ProverPolynomials.
    PolynomialBatcher polynomial_batcher(interleaved_size, BATCH_SIZE);
    polynomial_batcher.set_unshifted_interleaved_groups(Flavor::get_unshifted_groups(polys));
    polynomial_batcher.set_shifted_interleaved_groups(Flavor::get_to_be_shifted_groups(polys));

    OpeningClaim prover_opening_claim;
    if constexpr (Flavor::HasZK) {
        // SmallSubgroupIPA sends Libra:grand_sum_commitment and Libra:quotient_commitment
        // Use sumcheck challenge (not full_challenge which includes interleaving prefixes)
        SmallSubgroupIPA small_subgroup_ipa_prover(
            zk_sumcheck_data, sumcheck_output.challenge, sumcheck_output.claimed_libra_evaluation, transcript, ck);
        small_subgroup_ipa_prover.prove();

        prover_opening_claim = ShpleminiProver_<Curve>::prove(interleaved_size,
                                                              polynomial_batcher,
                                                              full_challenge,
                                                              ck,
                                                              transcript,
                                                              small_subgroup_ipa_prover.get_witness_polynomials());
    } else {
        prover_opening_claim =
            ShpleminiProver_<Curve>::prove(interleaved_size, polynomial_batcher, full_challenge, ck, transcript);
    }

    vinfo("executed multivariate-to-univariate reduction");
    PCS::compute_opening_proof(ck, prover_opening_claim, transcript);
    vinfo("computed opening proof");
}

template class MultiMegaProver_<MultiMegaFlavor>;
template class MultiMegaProver_<MultiMegaZKFlavor>;

} // namespace bb
