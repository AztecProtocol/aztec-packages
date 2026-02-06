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

/**
 * @brief Construct interleaved batched polynomials for PCS.
 * @details Instead of constructing each interleaved polynomial separately, we batch by chunk position:
 *   G₀ = Σᵢ ρⁱ·f_{i,0}  (all 0th chunks batched)
 *   G₁ = Σᵢ ρⁱ·f_{i,1}  (all 1st chunks batched)
 *   G₂ = Σᵢ ρⁱ·f_{i,2}  (all 2nd chunks batched)
 *   G₃ = Σᵢ ρⁱ·f_{i,3}  (all 3rd chunks batched)
 *
 * Then the batched interleaved polynomial is:
 *   F(X) = G₀(X⁴) + X·G₁(X⁴) + X²·G₂(X⁴) + X³·G₃(X⁴)
 */
std::pair<MultiMegaProver::Polynomial, MultiMegaProver::Polynomial> MultiMegaProver::
    compute_interleaved_batched_polynomials(const FF& rho)
{
    const size_t poly_size = prover_instance->dyadic_size();
    auto& polys = prover_instance->polynomials;

    // Initialize the 4 batched chunk polynomials
    Polynomial G0(poly_size); // batched 0th chunks
    Polynomial G1(poly_size); // batched 1st chunks
    Polynomial G2(poly_size); // batched 2nd chunks
    Polynomial G3(poly_size); // batched 3rd chunks

    // Similarly for shifted (only 3 shiftable groups: W₁, W₆, W₉)
    Polynomial G0_shifted(Polynomial::shiftable(poly_size));
    Polynomial G1_shifted(Polynomial::shiftable(poly_size));
    Polynomial G2_shifted(Polynomial::shiftable(poly_size));
    Polynomial G3_shifted(Polynomial::shiftable(poly_size));

    FF rho_power = FF::one();

    // Helper to add a polynomial to the appropriate chunk batch
    auto batch_group = [&](const std::array<const Polynomial*, 4>& group, bool is_shiftable) {
        for (size_t j = 0; j < 4; ++j) {
            if (group[j] != nullptr) {
                if (j == 0) {
                    G0.add_scaled(*group[j], rho_power);
                    if (is_shiftable)
                        G0_shifted.add_scaled(*group[j], rho_power);
                } else if (j == 1) {
                    G1.add_scaled(*group[j], rho_power);
                    if (is_shiftable)
                        G1_shifted.add_scaled(*group[j], rho_power);
                } else if (j == 2) {
                    G2.add_scaled(*group[j], rho_power);
                    if (is_shiftable)
                        G2_shifted.add_scaled(*group[j], rho_power);
                } else {
                    G3.add_scaled(*group[j], rho_power);
                    if (is_shiftable)
                        G3_shifted.add_scaled(*group[j], rho_power);
                }
            }
        }
        rho_power *= rho;
    };

    // S₁: [q_m, q_c, q_l, q_r] - precomputed, unshiftable
    batch_group({ &polys.q_m, &polys.q_c, &polys.q_l, &polys.q_r }, false);

    // S₂: [q_o, q_4, q_busread, q_lookup]
    batch_group({ &polys.q_o, &polys.q_4, &polys.q_busread, &polys.q_lookup }, false);

    // S₃: [q_arith, q_delta_range, q_elliptic, q_memory]
    batch_group({ &polys.q_arith, &polys.q_delta_range, &polys.q_elliptic, &polys.q_memory }, false);

    // S₄: [q_nnf, q_poseidon2_external, q_poseidon2_internal, ZERO]
    batch_group({ &polys.q_nnf, &polys.q_poseidon2_external, &polys.q_poseidon2_internal, nullptr }, false);

    // S₅: [sigma_1, sigma_2, sigma_3, sigma_4]
    batch_group({ &polys.sigma_1, &polys.sigma_2, &polys.sigma_3, &polys.sigma_4 }, false);

    // S₆: [id_1, id_2, id_3, id_4]
    batch_group({ &polys.id_1, &polys.id_2, &polys.id_3, &polys.id_4 }, false);

    // S₇: [table_1, table_2, table_3, table_4]
    batch_group({ &polys.table_1, &polys.table_2, &polys.table_3, &polys.table_4 }, false);

    // S₈: [lagrange_first, lagrange_last, lagrange_ecc_op, databus_id]
    batch_group({ &polys.lagrange_first, &polys.lagrange_last, &polys.lagrange_ecc_op, &polys.databus_id }, false);

    // W₁: [w_l, w_r, w_o, ZERO] - shiftable
    batch_group({ &polys.w_l, &polys.w_r, &polys.w_o, nullptr }, true);

    // W₂: [ecc_op_wire_1, ecc_op_wire_2, ecc_op_wire_3, ecc_op_wire_4]
    batch_group({ &polys.ecc_op_wire_1, &polys.ecc_op_wire_2, &polys.ecc_op_wire_3, &polys.ecc_op_wire_4 }, false);

    // W₃: [calldata, calldata_read_counts, calldata_read_tags, secondary_calldata]
    batch_group({ &polys.calldata, &polys.calldata_read_counts, &polys.calldata_read_tags, &polys.secondary_calldata },
                false);

    // W₄: [secondary_calldata_read_counts, secondary_calldata_read_tags, return_data, return_data_read_counts]
    batch_group({ &polys.secondary_calldata_read_counts,
                  &polys.secondary_calldata_read_tags,
                  &polys.return_data,
                  &polys.return_data_read_counts },
                false);

    // W₅: [return_data_read_tags, ZERO, ZERO, ZERO]
    batch_group({ &polys.return_data_read_tags, nullptr, nullptr, nullptr }, false);

    // W₆: [w_4, ZERO, ZERO, ZERO] - shiftable
    batch_group({ &polys.w_4, nullptr, nullptr, nullptr }, true);

    // W₇: [lookup_read_counts, lookup_read_tags, ZERO, ZERO]
    batch_group({ &polys.lookup_read_counts, &polys.lookup_read_tags, nullptr, nullptr }, false);

    // W₈: [lookup_inverses, calldata_inverses, secondary_calldata_inverses, return_data_inverses]
    batch_group({ &polys.lookup_inverses,
                  &polys.calldata_inverses,
                  &polys.secondary_calldata_inverses,
                  &polys.return_data_inverses },
                false);

    // W₉: [z_perm, ZERO, ZERO, ZERO] - shiftable
    batch_group({ &polys.z_perm, nullptr, nullptr, nullptr }, true);

    // Construct the interleaved batched polynomial:
    // F(X) = G₀(X⁴) + X·G₁(X⁴) + X²·G₂(X⁴) + X³·G₃(X⁴)
    const size_t interleaved_size = poly_size * 4;
    Polynomial batched_unshifted(interleaved_size);
    // Use regular Polynomial for shifted - indices 0-3 are implicitly 0 (not written to)
    // For interleaved shift by 4, the first 4 coefficients must be zero
    Polynomial batched_shifted(interleaved_size);

    // Interleave: coefficient at index 4i+j comes from G_j[i]
    for (size_t i = 0; i < poly_size; ++i) {
        batched_unshifted.at((4 * i) + 0) = G0[i];
        batched_unshifted.at((4 * i) + 1) = G1[i];
        batched_unshifted.at((4 * i) + 2) = G2[i];
        batched_unshifted.at((4 * i) + 3) = G3[i];
    }

    // For shifted polynomials, start from i=1 since G*_shifted[0] = 0 (shiftable property)
    // Indices 0-3 of batched_shifted remain 0 (required for shift-by-4)
    for (size_t i = 1; i < poly_size; ++i) {
        batched_shifted.at((4 * i) + 0) = G0_shifted[i];
        batched_shifted.at((4 * i) + 1) = G1_shifted[i];
        batched_shifted.at((4 * i) + 2) = G2_shifted[i];
        batched_shifted.at((4 * i) + 3) = G3_shifted[i];
    }

    return { std::move(batched_unshifted), std::move(batched_shifted) };
}

void MultiMegaProver::execute_pcs()
{
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;

    auto& ck = prover_instance->commitment_key;
    if (!ck.initialized()) {
        // For interleaved commitments, we need 4x the polynomial size for the SRS
        ck = CommitmentKey(prover_instance->dyadic_size() * Flavor::INTERLEAVING_BATCH_SIZE);
    }

    // For interleaved polynomials, the shift is by INTERLEAVING_BATCH_SIZE (4) instead of 1
    constexpr size_t SHIFT_EXPONENT = Flavor::INTERLEAVING_BATCH_SIZE;

    // For interleaved polynomials with k=2, we need to prepend 2 challenges to the sumcheck challenge.
    // The full challenge vector is (u_0, u_1, u_2, ..., u_{log_n+1}) where:
    //   - u_0, u_1 are the Lagrange basis challenges for interleaving
    //   - u_2, ..., u_{log_n+1} are the sumcheck challenges
    //
    // CRITICAL: The order of challenge derivation must match the verifier:
    // 1. Interleaving challenges (after sumcheck)
    // 2. Gemini's "rho" challenge (inside Shplemini)
    FF u0 = transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_0");
    FF u1 = transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_1");

    // Get rho challenge for batching - use same label as Gemini so it gets cached
    const FF rho = transcript->template get_challenge<FF>("rho");

    // Compute the interleaved batched polynomials using rho
    auto [batched_unshifted, batched_shifted] = compute_interleaved_batched_polynomials(rho);

    // Set up the polynomial batcher with precomputed batched polynomials
    const size_t interleaved_size = prover_instance->dyadic_size() * Flavor::INTERLEAVING_BATCH_SIZE;
    PolynomialBatcher polynomial_batcher(interleaved_size);
    polynomial_batcher.set_precomputed_batched(std::move(batched_unshifted), std::move(batched_shifted));

    // Build the full challenge vector: prepend interleaving challenges to sumcheck challenges
    std::vector<FF> full_challenge;
    full_challenge.reserve(2 + sumcheck_output.challenge.size());
    full_challenge.push_back(u0);
    full_challenge.push_back(u1);
    full_challenge.insert(full_challenge.end(), sumcheck_output.challenge.begin(), sumcheck_output.challenge.end());

    OpeningClaim prover_opening_claim;
    // Note: Gemini will call transcript->get_challenge("rho") internally, but it will get
    // the cached value we already derived above.
    prover_opening_claim = ShpleminiProver_<Curve>::prove(interleaved_size,
                                                          polynomial_batcher,
                                                          full_challenge,
                                                          ck,
                                                          transcript,
                                                          {} /* libra_polynomials */,
                                                          {} /* sumcheck_round_univariates */,
                                                          {} /* sumcheck_round_evaluations */,
                                                          SHIFT_EXPONENT);

    vinfo("executed multivariate-to-univariate reduction");
    PCS::compute_opening_proof(ck, prover_opening_claim, transcript);
    vinfo("computed opening proof");
}

} // namespace bb
