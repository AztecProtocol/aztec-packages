// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/ultra_honk/multi_mega_prover.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/multi_mega_oink_prover.hpp"

namespace bb {

MultiMegaProver::MultiMegaProver(const std::shared_ptr<ProverInstance>& prover_instance,
                                 const std::shared_ptr<HonkVK>& honk_vk,
                                 const CommitmentKey& commitment_key)
    : prover_instance(std::move(prover_instance))
    , honk_vk(honk_vk)
    , transcript(std::make_shared<Transcript>())
    , commitment_key(commitment_key)
{}

MultiMegaProver::MultiMegaProver(const std::shared_ptr<ProverInstance>& prover_instance,
                                 const std::shared_ptr<HonkVK>& honk_vk,
                                 const std::shared_ptr<Transcript>& transcript)
    : prover_instance(std::move(prover_instance))
    , honk_vk(honk_vk)
    , transcript(transcript)
    , commitment_key(prover_instance->commitment_key)
{}

MultiMegaProver::MultiMegaProver(Builder& circuit,
                                 const std::shared_ptr<HonkVK>& honk_vk,
                                 const std::shared_ptr<Transcript>& transcript)
    : prover_instance(std::make_shared<ProverInstance>(circuit))
    , honk_vk(honk_vk)
    , transcript(transcript)
    , commitment_key(prover_instance->commitment_key)
{}

MultiMegaProver::MultiMegaProver(Builder&& circuit, const std::shared_ptr<HonkVK>& honk_vk)
    : prover_instance(std::make_shared<ProverInstance>(circuit))
    , honk_vk(honk_vk)
    , transcript(std::make_shared<Transcript>())
    , commitment_key(prover_instance->commitment_key)
{}

MultiMegaProver::Proof MultiMegaProver::export_proof()
{
    auto proof = transcript->export_proof();

    // Append IPA proof if present
    if (!prover_instance->ipa_proof.empty()) {
        proof.insert(proof.end(), prover_instance->ipa_proof.begin(), prover_instance->ipa_proof.end());
    }

    return proof;
}

void MultiMegaProver::generate_gate_challenges()
{
    const size_t virtual_log_n =
        Flavor::USE_PADDING ? Flavor::VIRTUAL_LOG_N : static_cast<size_t>(prover_instance->log_dyadic_size());

    prover_instance->gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", virtual_log_n);
}

MultiMegaProver::Proof MultiMegaProver::construct_proof()
{
    // Use MultiMegaOinkProver for interleaved commitments
    MultiMegaOinkProver oink_prover(prover_instance, honk_vk, transcript);
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

void MultiMegaProver::execute_sumcheck_iop()
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
        sumcheck_output = sumcheck.prove();
    }
}

void MultiMegaProver::execute_pcs()
{
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;
    constexpr size_t BATCH_SIZE = Flavor::INTERLEAVING_BATCH_SIZE;

    const size_t n = prover_instance->dyadic_size();
    const size_t interleaved_size = n * BATCH_SIZE;

    auto& ck = prover_instance->commitment_key;
    if (!ck.initialized()) {
        // For interleaved commitments, we need 4x the polynomial size for the SRS
        ck = CommitmentKey(interleaved_size);
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

    // Define the 17 unshifted groups and 3 shifted groups (component polynomials)
    using PolyGroup = std::array<Polynomial const*, BATCH_SIZE>;
    std::array<PolyGroup, 17> unshifted_groups = { {
        // P₁-P₈: precomputed groups (match VK sequential chunking of 31 PrecomputedEntities)
        { &polys.q_m, &polys.q_c, &polys.q_l, &polys.q_r },
        { &polys.q_o, &polys.q_4, &polys.q_busread, &polys.q_lookup },
        { &polys.q_arith, &polys.q_delta_range, &polys.q_elliptic, &polys.q_memory },
        { &polys.q_nnf, &polys.q_poseidon2_external, &polys.q_poseidon2_internal, &polys.sigma_1 },
        { &polys.sigma_2, &polys.sigma_3, &polys.sigma_4, &polys.id_1 },
        { &polys.id_2, &polys.id_3, &polys.id_4, &polys.table_1 },
        { &polys.table_2, &polys.table_3, &polys.table_4, &polys.lagrange_first },
        { &polys.lagrange_last, &polys.lagrange_ecc_op, &polys.databus_id, nullptr },
        // W₁-W₉: witness groups
        { &polys.w_l, &polys.w_r, &polys.w_o, nullptr },
        { &polys.ecc_op_wire_1, &polys.ecc_op_wire_2, &polys.ecc_op_wire_3, &polys.ecc_op_wire_4 },
        { &polys.calldata, &polys.calldata_read_counts, &polys.calldata_read_tags, &polys.secondary_calldata },
        { &polys.secondary_calldata_read_counts,
          &polys.secondary_calldata_read_tags,
          &polys.return_data,
          &polys.return_data_read_counts },
        { &polys.return_data_read_tags, nullptr, nullptr, nullptr },
        { &polys.w_4, nullptr, nullptr, nullptr },
        { &polys.lookup_read_counts, &polys.lookup_read_tags, nullptr, nullptr },
        { &polys.lookup_inverses,
          &polys.calldata_inverses,
          &polys.secondary_calldata_inverses,
          &polys.return_data_inverses },
        { &polys.z_perm, nullptr, nullptr, nullptr },
    } };

    std::array<PolyGroup, 3> shifted_groups = { {
        { &polys.w_l, &polys.w_r, &polys.w_o, nullptr },
        { &polys.w_4, nullptr, nullptr, nullptr },
        { &polys.z_perm, nullptr, nullptr, nullptr },
    } };

    // DIAGNOSTIC: Materialize interleaved polynomials (like the passing unit tests)
    // instead of using set_unshifted_interleaved_groups / set_shifted_interleaved_groups.

    // Helper: materialize an interleaved polynomial from a group of component polynomials
    auto materialize_interleaved = [&](const PolyGroup& group) -> Polynomial {
        Polynomial result(interleaved_size);
        for (size_t i = 0; i < n; ++i) {
            for (size_t j = 0; j < BATCH_SIZE; ++j) {
                if (group[j] != nullptr) {
                    result.at(BATCH_SIZE * i + j) = group[j]->get(i);
                }
            }
        }
        return result;
    };

    // Helper: materialize a shiftable interleaved polynomial (start_index = BATCH_SIZE)
    auto materialize_interleaved_shiftable = [&](const PolyGroup& group) -> Polynomial {
        Polynomial result = Polynomial::shiftable(interleaved_size, interleaved_size, BATCH_SIZE);
        for (size_t i = 1; i < n; ++i) {
            for (size_t j = 0; j < BATCH_SIZE; ++j) {
                if (group[j] != nullptr) {
                    result.at(BATCH_SIZE * i + j) = group[j]->get(i);
                }
            }
        }
        return result;
    };

    // Materialize 17 unshifted interleaved polynomials
    std::vector<Polynomial> materialized_unshifted;
    materialized_unshifted.reserve(17);
    for (const auto& group : unshifted_groups) {
        materialized_unshifted.emplace_back(materialize_interleaved(group));
    }

    // Materialize 3 shifted interleaved polynomials (shiftable by BATCH_SIZE)
    std::vector<Polynomial> materialized_shifted;
    materialized_shifted.reserve(3);
    for (const auto& group : shifted_groups) {
        materialized_shifted.emplace_back(materialize_interleaved_shiftable(group));
    }

    // Build RefVectors for the batcher
    RefVector<Polynomial> unshifted_refs;
    for (auto& p : materialized_unshifted) {
        unshifted_refs.push_back(p);
    }
    RefVector<Polynomial> shifted_refs;
    for (auto& p : materialized_shifted) {
        shifted_refs.push_back(p);
    }

    // DEBUG: trace sizes
    info("DEBUG PROVER n=",
         n,
         " interleaved_size=",
         interleaved_size,
         " log2(interleaved_size)=",
         numeric::get_msb(interleaved_size),
         " full_challenge.size()=",
         full_challenge.size(),
         " sumcheck_output.challenge.size()=",
         sumcheck_output.challenge.size());
    info("DEBUG PROVER component poly size: q_m.size()=",
         polys.q_m.size(),
         " q_m.virtual_size()=",
         polys.q_m.virtual_size(),
         " w_l.size()=",
         polys.w_l.size(),
         " w_l.virtual_size()=",
         polys.w_l.virtual_size());
    info("DEBUG PROVER materialized[0].size()=",
         materialized_unshifted[0].size(),
         " materialized[0].virtual_size()=",
         materialized_unshifted[0].virtual_size());

    PolynomialBatcher polynomial_batcher(interleaved_size, BATCH_SIZE);
    polynomial_batcher.set_unshifted(std::move(unshifted_refs));
    polynomial_batcher.set_to_be_shifted(std::move(shifted_refs));

    OpeningClaim prover_opening_claim =
        ShpleminiProver_<Curve>::prove(interleaved_size, polynomial_batcher, full_challenge, ck, transcript);

    info("DEBUG PROVER opening_claim.challenge=",
         prover_opening_claim.opening_pair.challenge,
         " eval=",
         prover_opening_claim.opening_pair.evaluation,
         " poly.size()=",
         prover_opening_claim.polynomial.size());

    vinfo("executed multivariate-to-univariate reduction");
    PCS::compute_opening_proof(ck, prover_opening_claim, transcript);
    vinfo("computed opening proof");
}

} // namespace bb
