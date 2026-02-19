// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/hypernova/hypernova_batching_challenges.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_prover.hpp"

namespace bb {

template <size_t N>
HypernovaFoldingProver::Commitment HypernovaFoldingProver::batch_mul(const RefArray<Commitment, N>& _points,
                                                                     const std::vector<FF>& scalars)
{
    std::vector<Commitment> points(N);
    for (size_t idx = 0; idx < N; ++idx) {
        points[idx] = _points[idx];
    }
    return Commitment::batch_mul(points, scalars);
}

/**
 * @brief Construct an interleaved polynomial from a group of individual polynomials.
 * @details For group (p0, p1, ..., p_{k-1}), constructs F where F[BATCH_SIZE*i + j] = p_j[i].
 *          Null pointers in the group are treated as zero polynomials.
 *          If shiftable=true, constructs a polynomial shiftable by BATCH_SIZE (first BATCH_SIZE entries are zero).
 */
Polynomial<HypernovaFoldingProver::FF> HypernovaFoldingProver::construct_interleaved_polynomial(
    const std::vector<Polynomial<FF> const*>& group, size_t individual_poly_size, bool shiftable)
{
    const size_t interleaved_size = individual_poly_size * BATCH_SIZE;
    Polynomial<FF> interleaved = shiftable ? Polynomial<FF>::shiftable(interleaved_size, interleaved_size, BATCH_SIZE)
                                           : Polynomial<FF>(interleaved_size);
    // For shiftable polynomials, start from i=1 (i=0 row is implicitly zero)
    const size_t start_row = shiftable ? 1 : 0;
    for (size_t i = start_row; i < individual_poly_size; ++i) {
        for (size_t j = 0; j < BATCH_SIZE; ++j) {
            if (j < group.size() && group[j] != nullptr) {
                interleaved.at(BATCH_SIZE * i + j) = (*group[j])[i];
            }
        }
    }
    return interleaved;
}

HypernovaFoldingProver::Accumulator HypernovaFoldingProver::sumcheck_output_to_accumulator(
    HypernovaFoldingProver::MegaSumcheckOutput& sumcheck_output,
    const std::shared_ptr<typename HypernovaFoldingProver::ProverInstance>& instance,
    const MegaOinkProver& oink_prover)
{
    BB_BENCH_NAME("HypernovaFoldingProver::sumcheck_output_to_accumulator");

    const size_t individual_poly_size = instance->dyadic_size();
    const size_t interleaved_size = individual_poly_size * BATCH_SIZE;

    // Generate interleaving challenges (same transcript labels as MultiMega verifier)
    FF u0 = transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_0");
    FF u1 = transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_1");
    auto lagrange_basis = MultiMegaFlavor::compute_lagrange_basis(u0, u1);

    // Generate Hypernova batching challenges for interleaved groups (17 unshifted, 3 shifted)
    auto [unshifted_challenges, shifted_challenges] =
        get_hypernova_batching_challenges<FF>(transcript, NUM_UNSHIFTED_ENTITIES, NUM_SHIFTED_ENTITIES);

    // --- Construct and batch interleaved polynomials ---

    // Get polynomial groups from the instance
    auto unshifted_groups = Flavor::get_unshifted_groups(instance->polynomials);
    auto to_be_shifted_groups = Flavor::get_to_be_shifted_groups(instance->polynomials);

    // Batch interleaved unshifted polynomials: Σ_i challenge_i * interleave(group_i)
    Polynomial<FF> batched_unshifted(interleaved_size);
    for (size_t i = 0; i < NUM_UNSHIFTED_ENTITIES; i++) {
        auto interleaved =
            construct_interleaved_polynomial(unshifted_groups[i], individual_poly_size, /*shiftable=*/false);
        if (i == 0) {
            batched_unshifted = std::move(interleaved);
            batched_unshifted *= unshifted_challenges[0];
        } else {
            batched_unshifted.add_scaled(interleaved, unshifted_challenges[i]);
        }
    }

    // Batch interleaved shifted polynomials (pre-shift form, shiftable by BATCH_SIZE)
    Polynomial<FF> batched_shifted = Polynomial<FF>::shiftable(interleaved_size, interleaved_size, BATCH_SIZE);
    for (size_t i = 0; i < NUM_SHIFTED_ENTITIES; i++) {
        auto interleaved =
            construct_interleaved_polynomial(to_be_shifted_groups[i], individual_poly_size, /*shiftable=*/true);
        batched_shifted.add_scaled(interleaved, shifted_challenges[i]);
    }

    // --- Batch interleaved commitments ---

    // Collect all interleaved commitments: VK precomputed (8) + witness interleaved (9) = 17
    std::vector<Commitment> all_unshifted_comms;
    all_unshifted_comms.reserve(NUM_UNSHIFTED_ENTITIES);
    for (const auto& c : oink_prover.honk_vk->get_all()) {
        all_unshifted_comms.push_back(c);
    }
    for (const auto& c : oink_prover.interleaved_commitments.get_all()) {
        all_unshifted_comms.push_back(c);
    }

    std::vector<Commitment> shiftable_comms;
    shiftable_comms.reserve(NUM_SHIFTED_ENTITIES);
    for (const auto& c : oink_prover.interleaved_commitments.get_shiftable()) {
        shiftable_comms.push_back(c);
    }

    Commitment batched_unshifted_commitment = Commitment::batch_mul(all_unshifted_comms, unshifted_challenges);
    Commitment batched_shifted_commitment = Commitment::batch_mul(shiftable_comms, shifted_challenges);

    // --- Compute batched evaluations from individual evaluations via Lagrange basis ---

    // Helper to compute interleaved evaluation from a group of individual evaluations
    auto compute_group_eval = [&lagrange_basis](const std::vector<FF const*>& group) -> FF {
        FF result(0);
        for (size_t j = 0; j < 4; ++j) {
            FF val = (j < group.size() && group[j] != nullptr) ? *group[j] : FF(0);
            result += val * lagrange_basis[j];
        }
        return result;
    };

    auto unshifted_eval_groups = Flavor::get_unshifted_groups(sumcheck_output.claimed_evaluations);
    auto shifted_eval_groups = Flavor::get_shifted_groups(sumcheck_output.claimed_evaluations);

    FF batched_unshifted_evaluation(0);
    for (size_t i = 0; i < NUM_UNSHIFTED_ENTITIES; i++) {
        batched_unshifted_evaluation += compute_group_eval(unshifted_eval_groups[i]) * unshifted_challenges[i];
    }

    FF batched_shifted_evaluation(0);
    for (size_t i = 0; i < NUM_SHIFTED_ENTITIES; i++) {
        batched_shifted_evaluation += compute_group_eval(shifted_eval_groups[i]) * shifted_challenges[i];
    }

    // --- Build full challenge vector: prepend interleaving challenges to sumcheck challenges ---
    std::vector<FF> full_challenge;
    full_challenge.reserve(Flavor::INTERLEAVING_LOG_K + sumcheck_output.challenge.size());
    full_challenge.push_back(u0);
    full_challenge.push_back(u1);
    full_challenge.insert(full_challenge.end(), sumcheck_output.challenge.begin(), sumcheck_output.challenge.end());

    return Accumulator{
        .challenge = std::move(full_challenge),
        .non_shifted_evaluation = batched_unshifted_evaluation,
        .shifted_evaluation = batched_shifted_evaluation,
        .non_shifted_polynomial = std::move(batched_unshifted),
        .shifted_polynomial = std::move(batched_shifted),
        .non_shifted_commitment = batched_unshifted_commitment,
        .shifted_commitment = batched_shifted_commitment,
        .dyadic_size = interleaved_size,
    };
};

HypernovaFoldingProver::Accumulator HypernovaFoldingProver::instance_to_accumulator(
    const std::shared_ptr<typename HypernovaFoldingProver::ProverInstance>& instance,
    const std::shared_ptr<VerificationKey>& honk_vk)
{
    BB_BENCH_NAME("HypernovaFoldingProver::instance_to_accumulator");

    vinfo("HypernovaFoldingProver: converting instance to accumulator...");

    // Complete the incoming instance
    auto precomputed_vk = honk_vk ? honk_vk : std::make_shared<VerificationKey>(instance->get_precomputed());
    MegaOinkProver oink_prover{ instance, precomputed_vk, transcript };
    oink_prover.prove();

    instance->gate_challenges = transcript->template get_dyadic_powers_of_challenge<FF>(
        "HypernovaFoldingProver:gate_challenge", Flavor::VIRTUAL_LOG_N);

    // Run Sumcheck with padding
    MegaSumcheckProver sumcheck(instance->dyadic_size(),
                                instance->polynomials,
                                transcript,
                                instance->alpha,
                                instance->gate_challenges,
                                instance->relation_parameters,
                                Flavor::VIRTUAL_LOG_N);
    auto sumcheck_output = sumcheck.prove();

    Accumulator accumulator = sumcheck_output_to_accumulator(sumcheck_output, instance, oink_prover);

    vinfo("HypernovaFoldingProver: accumulator constructed.");

    return accumulator;
}

std::pair<HonkProof, HypernovaFoldingProver::Accumulator> HypernovaFoldingProver::fold(
    Accumulator&& accumulator,
    const std::shared_ptr<ProverInstance>& instance,
    const std::shared_ptr<VerificationKey>& honk_vk)
{
    Accumulator incoming_accumulator = instance_to_accumulator(instance, honk_vk);

    // Sumcheck
    MultilinearBatchingProver batching_prover(std::move(accumulator), std::move(incoming_accumulator), transcript);

    HonkProof proof = batching_prover.construct_proof();

    return { proof, batching_prover.compute_new_claim() };
}
} // namespace bb
