// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "ultra_prover.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/flavor/mega_avm_flavor.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
namespace bb {

/**
 * @brief Prepare polynomial data for PCS and configure the batcher.
 * @details For BS>1: interleaves polynomial groups into new polynomials, configures batcher with them.
 *          For BS=1: configures batcher directly with the prover instance's polynomials.
 *          Returns storage that must outlive the batcher (RefVectors point into it).
 */
template <typename Flavor>
static auto build_pcs_polynomial_batcher(typename Flavor::ProverPolynomials&& polynomials, size_t n, size_t pcs_size)
{
    using Polynomial = typename Flavor::Polynomial;
    using PolynomialBatcher = typename GeminiProver_<typename Flavor::Curve>::PolynomialBatcher;
    constexpr size_t BATCH_SIZE = Flavor::INTERLEAVING_BATCH_SIZE;

    struct Result {
        // BS=1: heap-allocated so RefVectors survive Result move. BS>1: used as interleaving source then freed.
        std::unique_ptr<typename Flavor::ProverPolynomials> polynomials_storage;
        std::vector<Polynomial> unshifted_storage; // BS>1: interleaved polynomials
        std::vector<Polynomial> shifted_storage;
        PolynomialBatcher batcher;
    };

    Result result{ std::make_unique<typename Flavor::ProverPolynomials>(std::move(polynomials)),
                   {},
                   {},
                   PolynomialBatcher(pcs_size, /*actual_data_size=*/0, /*shift_exponent=*/BATCH_SIZE) };

    if constexpr (BATCH_SIZE > 1) {
        auto unshifted_groups = Flavor::get_unshifted_groups_mut(*result.polynomials_storage);
        auto shifted_groups = Flavor::get_to_be_shifted_groups(*result.polynomials_storage);

        auto interleave = [&](const auto& group, bool shiftable) -> Polynomial {
            Polynomial p = shiftable ? Polynomial::shiftable(pcs_size, pcs_size, BATCH_SIZE) : Polynomial(pcs_size);
            const size_t start = shiftable ? 1 : 0;
            for (size_t i = start; i < n; i++) {
                for (size_t j = 0; j < BATCH_SIZE; j++) {
                    if (j < group.size() && group[j] != nullptr) {
                        p.at(BATCH_SIZE * i + j) = (*group[j])[i];
                    }
                }
            }
            return p;
        };

        // Process shifted groups first (they share source polys with last unshifted groups)
        result.shifted_storage.reserve(shifted_groups.size());
        for (const auto& group : shifted_groups) {
            result.shifted_storage.push_back(interleave(group, /*shiftable=*/true));
        }

        // Process unshifted groups with greedy freeing of source polynomials
        result.unshifted_storage.reserve(unshifted_groups.size());
        for (auto& group : unshifted_groups) {
            result.unshifted_storage.push_back(interleave(group, /*shiftable=*/false));
            for (auto* ptr : group) {
                if (ptr != nullptr) {
                    *ptr = Polynomial();
                }
            }
        }
        result.polynomials_storage.reset(); // free remaining source memory
        vinfo("interleaved polynomial groups");

        result.batcher.set_unshifted(RefVector<Polynomial>(result.unshifted_storage));
        result.batcher.set_to_be_shifted(RefVector<Polynomial>(result.shifted_storage));
    } else {
        result.batcher.set_unshifted(result.polynomials_storage->get_unshifted());
        result.batcher.set_to_be_shifted(result.polynomials_storage->get_to_be_shifted());
    }

    return result;
}

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

    // The CRS only needs to accommodate the actual data extent (max_end_index) rather than the
    // full dyadic_size. All committed polynomials fit within this bound: witness/selector polys
    // have backing ≤ max_end_index, Gemini fold polys have size ≤ dyadic_size/2 < max_end_index,
    // Shplonk quotient Q is sized at max(claim sizes), and KZG opening proof is sized at Q.size().
    // For ZK, the gemini_masking_poly (at dyadic_size) is already reflected in max_end_index.
    size_t key_size = prover_instance->polynomials.max_end_index() * BATCH_SIZE;
    if constexpr (Flavor::HasZK) {
        // SmallSubgroupIPA commits fixed-size polynomials (up to SUBGROUP_SIZE + 3). Ensure the
        // CRS is large enough for tiny test circuits where max_end_index may be smaller.
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

    // Helper: run Shplemini prove on a prepared batcher
    auto run_shplemini = [&](PolynomialBatcher& polynomial_batcher) -> OpeningClaim {
        if constexpr (Flavor::HasZK) {
            return ShpleminiProver_<Curve>::prove(
                pcs_size, polynomial_batcher, full_challenge, ck, transcript, libra_witness_polys);
        } else {
            return ShpleminiProver_<Curve>::prove(pcs_size, polynomial_batcher, full_challenge, ck, transcript);
        }
    };

    // Interleave polynomial groups (BS>1) and configure the polynomial batcher.
    auto pcs_data = build_pcs_polynomial_batcher<Flavor>(std::move(prover_instance->polynomials), n, pcs_size);

    auto prover_opening_claim = run_shplemini(pcs_data.batcher);

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
