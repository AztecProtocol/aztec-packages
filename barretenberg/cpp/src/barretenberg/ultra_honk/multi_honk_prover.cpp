// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/ultra_honk/multi_honk_prover.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/interleaved_group_batching.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/flavor/multi_mega_zk_flavor.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/multi_honk_oink_prover.hpp"

namespace bb {

template <IsMultiMegaFlavor Flavor>
MultiHonkProver_<Flavor>::MultiHonkProver_(const std::shared_ptr<ProverInstance>& prover_instance,
                                           const std::shared_ptr<typename Base::HonkVK>& honk_vk,
                                           const CommitmentKey& ck)
    : Base(prover_instance, honk_vk)
{
    this->commitment_key = ck;
}

template <IsMultiMegaFlavor Flavor>
MultiHonkProver_<Flavor>::MultiHonkProver_(const std::shared_ptr<ProverInstance>& prover_instance,
                                           const std::shared_ptr<typename Base::HonkVK>& honk_vk,
                                           const std::shared_ptr<Transcript>& transcript)
    : Base(prover_instance, honk_vk, transcript)
{}

template <IsMultiMegaFlavor Flavor>
MultiHonkProver_<Flavor>::MultiHonkProver_(Builder& circuit,
                                           const std::shared_ptr<typename Base::HonkVK>& honk_vk,
                                           const std::shared_ptr<Transcript>& transcript)
    : Base(std::make_shared<ProverInstance>(circuit), honk_vk, transcript)
{}

template <IsMultiMegaFlavor Flavor>
MultiHonkProver_<Flavor>::MultiHonkProver_(Builder&& circuit, const std::shared_ptr<typename Base::HonkVK>& honk_vk)
    : Base(std::make_shared<ProverInstance>(circuit), honk_vk)
{}

template <IsMultiMegaFlavor Flavor> typename MultiHonkProver_<Flavor>::Proof MultiHonkProver_<Flavor>::construct_proof()
{
    // Oink: interleaved commitments
    {
        MultiHonkOinkProver_<Flavor> oink_prover(this->prover_instance, this->honk_vk, this->transcript);
        oink_prover.prove();
        interleaved_commitments = oink_prover.interleaved_commitments;
    }
    vinfo("created oink proof with interleaved commitments");

    // Reuse base class gate challenge generation
    this->generate_gate_challenges();

    // Sumcheck
    {
        const size_t polynomial_size = this->prover_instance->dyadic_size();

        using Sumcheck = SumcheckProver<Flavor>;
        Sumcheck sumcheck(polynomial_size,
                          this->prover_instance->polynomials,
                          this->transcript,
                          this->prover_instance->alpha,
                          this->prover_instance->gate_challenges,
                          this->prover_instance->relation_parameters,
                          this->virtual_log_n);
        BB_BENCH_NAME("sumcheck.prove");

        if constexpr (Flavor::HasZK) {
            using Curve = typename Flavor::Curve;
            using ZKData = typename Base::ZKData;
            const size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(Curve::SUBGROUP_SIZE));
            CommitmentKey ck(1 << (log_subgroup_size + 1));
            this->zk_sumcheck_data = ZKData(numeric::get_msb(polynomial_size), this->transcript, ck);
            this->sumcheck_output = sumcheck.prove(this->zk_sumcheck_data);
        } else {
            this->sumcheck_output = sumcheck.prove();
        }
    }
    vinfo("finished sumcheck");

    // Interleaved PCS
    execute_pcs();

    // Reuse base class export_proof (appends IPA proof if present)
    return this->export_proof();
}

template <IsMultiMegaFlavor Flavor> void MultiHonkProver_<Flavor>::execute_pcs()
{
    using Curve = typename Flavor::Curve;
    constexpr size_t BATCH_SIZE = Flavor::INTERLEAVING_BATCH_SIZE;

    const size_t n = this->prover_instance->dyadic_size();
    const size_t interleaved_size = n * BATCH_SIZE;

    // Initialize commitment key
    auto& ck = this->commitment_key;
    if (!ck.initialized()) {
        size_t ck_size = interleaved_size;
        if constexpr (Flavor::HasZK) {
            ck_size = std::max(ck_size, 2 * static_cast<size_t>(Curve::SUBGROUP_SIZE));
        }
        ck = CommitmentKey(ck_size);
    }

    // Transcript challenges in verifier-matching order: interleaving → ZK → batching
    FF u0 = this->transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_0");
    FF u1 = this->transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_1");

    std::vector<FF> full_challenge;
    full_challenge.reserve(2 + this->sumcheck_output.challenge.size());
    full_challenge.push_back(u0);
    full_challenge.push_back(u1);
    full_challenge.insert(
        full_challenge.end(), this->sumcheck_output.challenge.begin(), this->sumcheck_output.challenge.end());

    // ZK: SmallSubgroupIPA (sends Libra commitments to transcript before batching challenges)
    std::array<Polynomial, NUM_SMALL_IPA_EVALUATIONS> libra_witness_polys{};
    if constexpr (Flavor::HasZK) {
        SmallSubgroupIPA small_subgroup_ipa_prover(this->zk_sumcheck_data,
                                                   this->sumcheck_output.challenge,
                                                   this->sumcheck_output.claimed_libra_evaluation,
                                                   this->transcript,
                                                   ck);
        small_subgroup_ipa_prover.prove();
        libra_witness_polys = small_subgroup_ipa_prover.get_witness_polynomials();
    }

    // Batching challenges (after interleaving + ZK in transcript)
    constexpr size_t NUM_UNSHIFTED = Flavor::NUM_ALL_INTERLEAVED_COMMITMENTS;
    constexpr size_t NUM_SHIFTED = Flavor::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS;
    auto [unshifted_challenges, shifted_challenges] =
        get_interleaved_batching_challenges<FF>(this->transcript, NUM_UNSHIFTED, NUM_SHIFTED);

    // Pre-batch interleaved polynomial groups into 2 polynomials, then let the proving key die.
    Polynomial batched_unshifted;
    Polynomial batched_to_be_shifted;
    {
        auto polys = std::move(this->prover_instance->polynomials);
        auto unshifted_groups = Flavor::get_unshifted_groups_mut(polys);
        auto shifted_groups = Flavor::get_to_be_shifted_groups(polys);
        std::tie(batched_unshifted, batched_to_be_shifted) = batch_interleaved_polynomial_groups<FF>(
            unshifted_groups, shifted_groups, unshifted_challenges, shifted_challenges, n, BATCH_SIZE);
    }
    vinfo("pre-batched interleaved groups");

    // PCS: Shplemini + KZG
    {
        using OpeningClaim = ProverOpeningClaim<Curve>;
        using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;

        PolynomialBatcher polynomial_batcher(interleaved_size, BATCH_SIZE);
        polynomial_batcher.set_unshifted(RefVector<Polynomial>(batched_unshifted));
        polynomial_batcher.set_to_be_shifted(RefVector<Polynomial>(batched_to_be_shifted));

        OpeningClaim prover_opening_claim;
        if constexpr (Flavor::HasZK) {
            prover_opening_claim = ShpleminiProver_<Curve>::prove(
                interleaved_size, polynomial_batcher, full_challenge, ck, this->transcript, libra_witness_polys);
        } else {
            prover_opening_claim = ShpleminiProver_<Curve>::prove(
                interleaved_size, polynomial_batcher, full_challenge, ck, this->transcript);
        }

        vinfo("executed multivariate-to-univariate reduction");
        PCS::compute_opening_proof(ck, prover_opening_claim, this->transcript);
        vinfo("computed opening proof");
    }
}

template class MultiHonkProver_<MultiMegaFlavor>;
template class MultiHonkProver_<MultiMegaZKFlavor>;

} // namespace bb
