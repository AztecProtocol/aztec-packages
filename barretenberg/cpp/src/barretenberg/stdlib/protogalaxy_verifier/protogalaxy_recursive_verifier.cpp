// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "protogalaxy_recursive_verifier.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/protogalaxy/prover_verifier_shared.hpp"
#include "barretenberg/stdlib/honk_verifier/oink_recursive_verifier.hpp"
#include "barretenberg/ultra_honk/decider_keys.hpp"

namespace bb::stdlib::recursion::honk {

template <class DeciderVerificationKeys>
void ProtogalaxyRecursiveVerifier_<DeciderVerificationKeys>::run_oink_verifier_on_one_incomplete_key(
    const std::shared_ptr<DeciderVK>& key, std::string& domain_separator)
{
    OinkRecursiveVerifier_<Flavor> oink_verifier{ builder, key, transcript, domain_separator + '_' };
    oink_verifier.verify();
}

template <class DeciderVerificationKeys>
void ProtogalaxyRecursiveVerifier_<DeciderVerificationKeys>::run_oink_verifier_on_each_incomplete_key(
    const std::vector<FF>& proof)
{
    transcript->load_proof(proof);
    size_t index = 0;
    auto key = keys_to_fold[0];
    auto domain_separator = std::to_string(index);
    if (!key->is_accumulator) {
        run_oink_verifier_on_one_incomplete_key(key, domain_separator);
        key->target_sum = 0;
        key->gate_challenges = std::vector<FF>(CONST_PG_LOG_N, 0);
    }
    index++;

    for (auto it = keys_to_fold.begin() + 1; it != keys_to_fold.end(); it++, index++) {
        auto key = *it;
        auto domain_separator = std::to_string(index);
        run_oink_verifier_on_one_incomplete_key(key, domain_separator);
    }
}

template <class DeciderVerificationKeys>
std::shared_ptr<typename DeciderVerificationKeys::DeciderVK> ProtogalaxyRecursiveVerifier_<
    DeciderVerificationKeys>::verify_folding_proof(const StdlibProof<Builder>& proof)
{
    static constexpr size_t BATCHED_EXTENDED_LENGTH = DeciderVerificationKeys::BATCHED_EXTENDED_LENGTH;
    static constexpr size_t NUM_KEYS = DeciderVerificationKeys::NUM;
    static constexpr size_t COMBINER_LENGTH = BATCHED_EXTENDED_LENGTH - NUM_KEYS;

    run_oink_verifier_on_each_incomplete_key(proof);

    std::shared_ptr<DeciderVK> accumulator = keys_to_fold[0];

    // Perturbator round
    const FF delta = transcript->template get_challenge<FF>("delta");
    const std::vector<FF> deltas = compute_round_challenge_pows(CONST_PG_LOG_N, delta);
    std::vector<FF> perturbator_coeffs(CONST_PG_LOG_N + 1, 0);
    for (size_t idx = 1; idx <= CONST_PG_LOG_N; idx++) {
        perturbator_coeffs[idx] = transcript->template receive_from_prover<FF>("perturbator_" + std::to_string(idx));
    }
    const FF perturbator_challenge = transcript->template get_challenge<FF>("perturbator_challenge");

    // Combiner quotient round
    perturbator_coeffs[0] = accumulator->target_sum;
    const FF perturbator_evaluation = evaluate_perturbator(perturbator_coeffs, perturbator_challenge);

    std::array<FF, COMBINER_LENGTH>
        combiner_quotient_evals; // The degree of the combiner quotient (K in the paper) is dk - k - 1 = k(d - 1) - 1.
                                 // Hence we need  k(d - 1) evaluations to represent it.
    for (size_t idx = 0; idx < COMBINER_LENGTH; idx++) {
        combiner_quotient_evals[idx] =
            transcript->template receive_from_prover<FF>("combiner_quotient_" + std::to_string(idx + NUM_KEYS));
    }

    // Folding
    const FF combiner_challenge = transcript->template get_challenge<FF>("combiner_quotient_challenge");
    const Univariate<FF, BATCHED_EXTENDED_LENGTH, NUM_KEYS> combiner_quotient(combiner_quotient_evals);
    const FF combiner_quotient_at_challenge = combiner_quotient.evaluate(combiner_challenge);

    const FF vanishing_polynomial_at_challenge = combiner_challenge * (combiner_challenge - FF(1));
    const std::vector<FF> lagranges = { FF(1) - combiner_challenge, combiner_challenge };

    /*
        Fold the commitments
        Note: we use additional challenges to reduce the amount of elliptic curve work performed by the ECCVM

        For an accumulator commitment [P'] and an instance commitment [P] , we compute folded commitment [P''] where
        [P''] = L0(combiner_challenge).[P'] + L1(combiner_challenge).[P]
        For the size-2 case this becomes:
        P'' = (1 - combiner_challenge).[P'] + combiner_challenge.[P] = combiner_challenge.[P - P'] + [P']

        This requires a large number of size-1 scalar muls (about 53)
        The ECCVM can perform a size-k MSM in 32 + roundup((k/4)) rows, if each scalar multiplier is <128 bits
        i.e. number of ECCVM rows = 53 * 64 = painful

        To optimize, we generate challenges `c_i` for each commitment and evaluate the relation:

        [A] = \sum c_i.[P_i]
        [B] = \sum c_i.[P'_i]
        [C] = \sum c_i.[P''_i]
        and validate
        (1 - combiner_challenge).[A] + combiner_challenge.[B] == [C]


        This reduces the relation to 3 large MSMs where each commitment requires 3 size-128bit scalar multiplications
        For a flavor with 53 instance/witness commitments, this is 53 * 24 rows

        Note: there are more efficient ways to evaluate this relationship if one solely wants to reduce number of scalar
       muls, however we must also consider the number of ECCVM operations being executed, as each operation incurs a
       cost in the translator circuit Each ECCVM opcode produces 5 rows in the translator circuit, which is approx.
       equivalent to 9 ECCVM rows. Something to pay attention to
    */

    // New transcript for challenge generation
    Transcript batch_mul_transcript = transcript->branch_transcript();

    std::vector<Commitment> accumulator_commitments;
    std::vector<Commitment> instance_commitments;
    for (const auto& precomputed : keys_to_fold.get_precomputed_commitments()) {
        ASSERT(precomputed.size() == 2);
        accumulator_commitments.emplace_back(precomputed[0]);
        instance_commitments.emplace_back(precomputed[1]);
    }
    for (const auto& witness : keys_to_fold.get_witness_commitments()) {
        ASSERT(witness.size() == 2);
        accumulator_commitments.emplace_back(witness[0]);
        instance_commitments.emplace_back(witness[1]);
    }

    // derive output commitment witnesses
    std::vector<Commitment> output_commitments;
    for (size_t i = 0; i < accumulator_commitments.size(); ++i) {
        const auto lhs_scalar = (FF(1) - combiner_challenge).get_value();
        const auto rhs_scalar = combiner_challenge.get_value();

        const auto lhs = accumulator_commitments[i].get_value();

        const auto rhs = instance_commitments[i].get_value();
        const auto output = lhs * lhs_scalar + rhs * rhs_scalar;
        output_commitments.emplace_back(Commitment::from_witness(builder, output));
        // Add the output commitment to the transcript to ensure the they can't be spoofed
        batch_mul_transcript.add_to_hash_buffer("new_accumulator_commitment_" + std::to_string(i),
                                                output_commitments[i]);
    }

    std::array<std::string, Flavor::NUM_FOLDED_ENTITIES> args;
    for (size_t idx = 0; idx < Flavor::NUM_FOLDED_ENTITIES; ++idx) {
        args[idx] = "accumulator_combination_challenges" + std::to_string(idx);
    }
    std::array<FF, Flavor::NUM_FOLDED_ENTITIES> folding_challenges =
        batch_mul_transcript.template get_challenges<FF>(args);
    std::vector<FF> scalars(folding_challenges.begin(), folding_challenges.end());

    Commitment accumulator_sum = Commitment::batch_mul(accumulator_commitments,
                                                       scalars,
                                                       /*max_num_bits=*/0,
                                                       /*handle_edge_cases=*/IsUltraBuilder<Builder>);

    Commitment instance_sum = Commitment::batch_mul(instance_commitments,
                                                    scalars,
                                                    /*max_num_bits=*/0,
                                                    /*handle_edge_cases=*/IsUltraBuilder<Builder>);

    Commitment output_sum = Commitment::batch_mul(output_commitments,
                                                  scalars,
                                                  /*max_num_bits=*/0,
                                                  /*handle_edge_cases=*/IsUltraBuilder<Builder>);

    Commitment folded_sum = Commitment::batch_mul({ accumulator_sum, instance_sum },
                                                  lagranges,
                                                  /*max_num_bits=*/0,
                                                  /*handle_edge_cases=*/IsUltraBuilder<Builder>);

    output_sum.x.assert_equal(folded_sum.x);
    output_sum.y.assert_equal(folded_sum.y);

    // Compute next folding parameters
    accumulator->is_accumulator = true;
    accumulator->target_sum =
        perturbator_evaluation * lagranges[0] + vanishing_polynomial_at_challenge * combiner_quotient_at_challenge;

    accumulator->gate_challenges = update_gate_challenges(perturbator_challenge, accumulator->gate_challenges, deltas);

    // Set the accumulator circuit size data based on the max of the keys being accumulated
    auto [accumulator_circuit_size, accumulator_log_circuit_size] = keys_to_fold.get_max_circuit_size_and_log_size();
    accumulator->verification_key->log_circuit_size = accumulator_log_circuit_size;
    accumulator->verification_key->circuit_size = accumulator_circuit_size;

    // Fold the relation parameters
    for (auto [combination, to_combine] : zip_view(accumulator->alphas, keys_to_fold.get_alphas())) {
        combination = linear_combination(to_combine, lagranges);
    }

    for (auto [combination, to_combine] :
         zip_view(accumulator->relation_parameters.get_to_fold(), keys_to_fold.get_relation_parameters())) {
        combination = linear_combination(to_combine, lagranges);
    }

    auto accumulator_vkey = accumulator->verification_key->get_all();
    for (size_t i = 0; i < Flavor::NUM_PRECOMPUTED_ENTITIES; ++i) {
        accumulator_vkey[i] = output_commitments[i];
    }

    auto accumulator_witnesses = accumulator->witness_commitments.get_all();
    for (size_t i = 0; i < Flavor::NUM_WITNESS_ENTITIES; ++i) {
        accumulator_witnesses[i] = output_commitments[i + accumulator_vkey.size()];
    }

    return accumulator;
}

// Instantiate the template with specific flavors and builders
template class ProtogalaxyRecursiveVerifier_<
    RecursiveDeciderVerificationKeys_<MegaRecursiveFlavor_<MegaCircuitBuilder>, 2>>;
template class ProtogalaxyRecursiveVerifier_<
    RecursiveDeciderVerificationKeys_<MegaRecursiveFlavor_<UltraCircuitBuilder>, 2>>;

} // namespace bb::stdlib::recursion::honk
