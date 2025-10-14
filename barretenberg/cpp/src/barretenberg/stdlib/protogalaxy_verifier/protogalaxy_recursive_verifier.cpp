// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "protogalaxy_recursive_verifier.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/protogalaxy/prover_verifier_shared.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"

namespace bb::stdlib::recursion::honk {

template <class VerifierInstance>
void ProtogalaxyRecursiveVerifier_<VerifierInstance>::run_oink_verifier_on_each_incomplete_instance(
    const std::vector<FF>& proof)
{
    transcript->load_proof(proof);
    auto key = insts_to_fold[0];
    auto domain_separator = std::to_string(0);

    // If the first instance to be folded in pure we need to complete it and generate the gate challenges
    if (!key->is_complete) {
        bb::OinkVerifier<Flavor> oink_verifier{ key, transcript, domain_separator + '_' };
        oink_verifier.verify();
        key->target_sum = FF::from_witness_index(builder, builder->zero_idx());
        // Get the gate challenges for sumcheck/combiner computation
        key->gate_challenges =
            transcript->template get_powers_of_challenge<FF>(domain_separator + "_gate_challenge", CONST_PG_LOG_N);
    }

    // Complete the second instance (Step 1 of the paper)
    key = insts_to_fold[1];
    domain_separator = std::to_string(1);
    bb::OinkVerifier<Flavor> oink_verifier{ key, transcript, domain_separator + '_' };
    oink_verifier.verify();
}

template <class VerifierInstance>
std::shared_ptr<VerifierInstance> ProtogalaxyRecursiveVerifier_<VerifierInstance>::verify_folding_proof(
    const stdlib::Proof<Builder>& proof)
{
    // The degree of the combiner quotient (K in the paper) is equal to deg(G) - deg(Z), where Z is the  vanishing
    // polynomial of the domain 0, .., NUM_INSTANCES-1. Hence, deg(K) = deg(G) - NUM_INSTANCES and we need
    // deg(G) + 1 - NUM_INSTANCES = BATCHED_EXTENDED_LENGTH - NUM_INSTANCES evaluations to represent it
    static constexpr size_t COMBINER_QUOTIENT_LENGTH = BATCHED_EXTENDED_LENGTH - NUM_INSTANCES;

    // Step 1
    run_oink_verifier_on_each_incomplete_instance(proof);

    const std::shared_ptr<VerifierInstance>& accumulator = insts_to_fold[0];

    // Step 2 - 3
    const std::vector<FF> deltas = transcript->template get_powers_of_challenge<FF>("delta", CONST_PG_LOG_N);

    // Step 5 - Receive non-constant coefficients of the perturbator
    // As n = 2^CONST_PG_LOG_N, the perturbator has degree equal to log(n) = CONST_PG_LOG_N
    std::vector<FF> perturbator_coeffs(CONST_PG_LOG_N + 1, 0);
    perturbator_coeffs[0] = accumulator->target_sum;
    for (size_t idx = 1; idx <= CONST_PG_LOG_N; idx++) {
        perturbator_coeffs[idx] = transcript->template receive_from_prover<FF>("perturbator_" + std::to_string(idx));
    }

    // Step 6 - Compute perturbator challenge
    const FF perturbator_challenge = transcript->template get_challenge<FF>("perturbator_challenge");

    // Step 7 - Compute evaluation of the perturbator
    const FF perturbator_evaluation = evaluate_perturbator(perturbator_coeffs, perturbator_challenge);

    // Step 11 - Receive evaluations of the combiner quotient
    std::array<FF, COMBINER_QUOTIENT_LENGTH> combiner_quotient_evals;
    for (size_t idx = 0; idx < COMBINER_QUOTIENT_LENGTH; idx++) {
        combiner_quotient_evals[idx] =
            transcript->template receive_from_prover<FF>("combiner_quotient_" + std::to_string(idx + NUM_INSTANCES));
    }

    // Step 12 - Compute combiner quotient challenge \gamma (used to generate folding output)
    const FF combiner_challenge = transcript->template get_challenge<FF>("combiner_quotient_challenge");

    // Folding
    // A VerifierInstance is made up of three components: the commitments to the prover polynomials, the relation
    // parameters, and the batching challenges. We have to fold each of these components. The commitments require an
    // MSM, relation parameters and batching challenges require only field operations.

    // Compute K(\gamma)
    const Univariate<FF, BATCHED_EXTENDED_LENGTH, NUM_INSTANCES> combiner_quotient(combiner_quotient_evals);
    const FF combiner_quotient_at_challenge = combiner_quotient.evaluate(combiner_challenge);

    // Compute Z(\gamma)
    const FF vanishing_polynomial_at_challenge = combiner_challenge * (combiner_challenge - FF(1));

    // Compute L_0(\gamma) and L_1(\gamma)
    const std::vector<FF> lagranges = { FF(1) - combiner_challenge, combiner_challenge };

    /**
     * The verifier must compute \phi^{\ast} = L0(\gamma) \phi_0 + L_1(\gamma) \phi_1 = \phi_0 + \gamma * (\phi_1 -
     * \phi_0). This amounts to compute, for each commitment contained in \phi_i, a scalar mul of size 1 and an
     * addition.
     *
     * The ECCVM handles a size k MSM with scalars of size at most 128 bits in 33 * roundup(k / 4) + 31 rows. Hence, if
     * N is the number of commitments contained in a committed instance \phi_i, performing all the scalar
     * multiplications requires N * (33 + 31) = 64 * N rows.
     *
     * To optimize the calculation, we make the circuit prover (do not confuse it with the Protogalaxy prover) supply
     * the purported folded commitment, and make the verifier validate those commitments. Write [P_{i,j}] for the
     * commitments contained in \phi_i, and [Q_j] for the commitments supplied by the circuit prover. Then, the
     * Protogalaxy verifier samples random challenges c_1, .., c_N, computes:
     *  [A] = \sum_j c_j [P_{0,j}]
     *  [B] = \sum_j c_j [P_{1,j}]
     *  [C] = \sum_j c_j [Q_j]
     * and then verifies:
     *  [C] = (1 - gamma) * [A] + gamma * [B]
     *
     * The cost of this verification is 3 size N MSMs with short scalars and 1 size 2 MSM with full scalars, amounting
     * to 3 * (33 * roundup(N/4) + 31) + 64 = 99 * roundup(N/4) + 157 ~ 25 * N + 157 rows (here we use that an MSM of
     * size k with full scalars accounts for 33 * roundup(N/2) + 31 rows, which for k = 2 equals 64 rows)
     *
     * Note: there are more efficient ways to evaluate this relationship if one solely wants to reduce number of
     * scalar muls, however we must also consider the number of ECCVM operations being executed, as each operation
     * incurs a cost in the translator circuit.
     */

    // New transcript for challenge generation
    Transcript batch_mul_transcript = transcript->branch_transcript();

    // Prepare accumulator and instance commitments for MSM calculation
    std::vector<Commitment> accumulator_commitments;
    std::vector<Commitment> instance_commitments;
    for (const auto& precomputed : get_data_to_fold<FOLDING_DATA::PRECOMPUTED_COMMITMENTS>()) {
        accumulator_commitments.emplace_back(precomputed[0]);
        instance_commitments.emplace_back(precomputed[1]);
    }
    for (const auto& witness : get_data_to_fold<FOLDING_DATA::WITNESS_COMMITMENTS>()) {
        accumulator_commitments.emplace_back(witness[0]);
        instance_commitments.emplace_back(witness[1]);
    }

    // Construct witnesses holding the purported values of the folding
    std::vector<Commitment> output_commitments;
    for (size_t i = 0; i < accumulator_commitments.size(); ++i) {
        // Out-of-circuit calculation to populate the witness values
        const auto lhs_scalar = lagranges[0].get_value();        // L_0(\gamma)
        const auto rhs_scalar = lagranges[1].get_value();        // L_1(\gamma)
        const auto lhs = accumulator_commitments[i].get_value(); // [P_{0,i}]
        const auto rhs = instance_commitments[i].get_value();    // [P_{1,i}]
        const auto output =
            lhs * lhs_scalar + rhs * rhs_scalar; // [Q_i] := L_0(\gamma) * [P_{0,i}] + L_1(\gamma) * [P_{1,i}]
        // Add a new witness whose underlying value for an honest prover is [Q_i]
        output_commitments.emplace_back(Commitment::from_witness(builder, output));
        // Add the output commitment to the transcript to ensure they can't be spoofed
        batch_mul_transcript.add_to_hash_buffer("new_accumulator_commitment_" + std::to_string(i),
                                                output_commitments[i]);
    }

    // Generate the challenges c_i
    std::array<std::string, Flavor::NUM_FOLDED_ENTITIES> args;
    for (size_t idx = 0; idx < Flavor::NUM_FOLDED_ENTITIES; ++idx) {
        args[idx] = "accumulator_combination_challenges_" + std::to_string(idx);
    }
    std::array<FF, Flavor::NUM_FOLDED_ENTITIES> folding_challenges =
        batch_mul_transcript.template get_challenges<FF>(args);
    std::vector<FF> scalars(folding_challenges.begin(), folding_challenges.end());

    // MSMs: note that edge cases are handled in the MSM only when the builder is Ultra. When the builder is mega, edge
    // cases are handled by the ECCVM

    // Compute [A] = \sum_i c_i [P_{0,i}]
    Commitment accumulator_sum = Commitment::batch_mul(accumulator_commitments,
                                                       scalars,
                                                       /*max_num_bits=*/0,
                                                       /*handle_edge_cases=*/IsUltraBuilder<Builder>);

    // Compute [B] = \sum_i c_i [P_{1,i}]
    Commitment instance_sum = Commitment::batch_mul(instance_commitments,
                                                    scalars,
                                                    /*max_num_bits=*/0,
                                                    /*handle_edge_cases=*/IsUltraBuilder<Builder>);

    // Compute [C] = \sum_i c_i [Q_i]
    Commitment output_sum = Commitment::batch_mul(output_commitments,
                                                  scalars,
                                                  /*max_num_bits=*/0,
                                                  /*handle_edge_cases=*/IsUltraBuilder<Builder>);
    // Compute (1 - gamma) * [A] + gamma * [B]
    Commitment folded_sum = Commitment::batch_mul({ accumulator_sum, instance_sum },
                                                  lagranges,
                                                  /*max_num_bits=*/0,
                                                  /*handle_edge_cases=*/IsUltraBuilder<Builder>);

    // Enforce [C] = (1 - gamma) * [A] + gamma * [B]
    output_sum.incomplete_assert_equal(folded_sum);

    // Step 13. Update the target sum: e^{\ast} = F(\alpha) * L_0(\gamma) + Z(\gamma) * K(\gamma)
    accumulator->target_sum =
        perturbator_evaluation * lagranges[0] + vanishing_polynomial_at_challenge * combiner_quotient_at_challenge;

    // Step 8. Update gate challenges: beta^{\ast} = \beta + \alpha * \deltas
    accumulator->gate_challenges = update_gate_challenges(perturbator_challenge, accumulator->gate_challenges, deltas);

    // Define a constant virtual log circuit size for the accumulator
    // This is just a placeholder: the decider verifier (PG decider) uses a constant value as the maximum dyadic size of
    // the circuits that have been folded using PG. The constant is Flavor::VIRTUAL_LOG_N, which is always bigger or
    // equal than CONST_PG_LOG_N. See also https://github.com/AztecProtocol/barretenberg/issues/1545 for more details.
    FF virtual_log_n = FF::from_witness(builder, CONST_PG_LOG_N);
    virtual_log_n.fix_witness();
    accumulator->vk_and_hash->vk->log_circuit_size = virtual_log_n;

    // Fold the batching challenges (alphas)
    for (auto [combination, to_combine] : zip_view(accumulator->alphas, get_data_to_fold<FOLDING_DATA::ALPHAS>())) {
        combination = to_combine[0] + combiner_challenge * (to_combine[1] - to_combine[0]);
    }

    // Fold the relation parameters
    for (auto [combination, to_combine] : zip_view(accumulator->relation_parameters.get_to_fold(),
                                                   get_data_to_fold<FOLDING_DATA::RELATION_PARAMETERS>())) {
        combination = to_combine[0] + combiner_challenge * (to_combine[1] - to_combine[0]);
    }

    // Update the precomputed commitments of the accumulator
    auto accumulator_vkey = accumulator->vk_and_hash->vk->get_all();
    for (size_t i = 0; i < Flavor::NUM_PRECOMPUTED_ENTITIES; ++i) {
        accumulator_vkey[i] = output_commitments[i];
    }

    // Update the witness commitments of the accumulator
    auto accumulator_witnesses = accumulator->witness_commitments.get_all();
    for (size_t i = 0; i < Flavor::NUM_WITNESS_ENTITIES; ++i) {
        accumulator_witnesses[i] = output_commitments[i + accumulator_vkey.size()];
    }

    return accumulator;
}

// Instantiate the template with specific flavors and builders
template class ProtogalaxyRecursiveVerifier_<RecursiveVerifierInstance_<MegaRecursiveFlavor_<MegaCircuitBuilder>>>;
template class ProtogalaxyRecursiveVerifier_<RecursiveVerifierInstance_<MegaRecursiveFlavor_<UltraCircuitBuilder>>>;

} // namespace bb::stdlib::recursion::honk
