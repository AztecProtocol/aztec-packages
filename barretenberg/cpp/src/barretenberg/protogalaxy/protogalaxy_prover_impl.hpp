// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/honk/relation_checker.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover_internal.hpp"
#include "barretenberg/protogalaxy/prover_verifier_shared.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "protogalaxy_prover.hpp"

namespace bb {
template <IsUltraOrMegaHonk Flavor, size_t NUM_KEYS>
void ProtogalaxyProver_<Flavor, NUM_KEYS>::run_oink_prover_on_one_incomplete_key(std::shared_ptr<DeciderPK> key,
                                                                                 std::shared_ptr<DeciderVK> vk,
                                                                                 const std::string& domain_separator)
{

    PROFILE_THIS_NAME("ProtogalaxyProver::run_oink_prover_on_one_incomplete_key");
    OinkProver<typename DeciderProvingKeys::Flavor> oink_prover(key, vk->vk, transcript, domain_separator + '_');
    oink_prover.prove();
}

template <IsUltraOrMegaHonk Flavor, size_t NUM_KEYS>
void ProtogalaxyProver_<Flavor, NUM_KEYS>::run_oink_prover_on_each_incomplete_key()
{
    PROFILE_THIS_NAME("ProtogalaxyProver_::run_oink_prover_on_each_incomplete_key");
    size_t idx = 0;
    auto& key = keys_to_fold[0];
    auto domain_separator = std::to_string(idx);
    auto& vk = vks_to_fold[0];
    if (!key->is_accumulator) {
        run_oink_prover_on_one_incomplete_key(key, vk, domain_separator);
        key->target_sum = 0;
        key->gate_challenges = std::vector<FF>(CONST_PG_LOG_N, 0);
    }

    idx++;

    for (auto it = keys_to_fold.begin() + 1; it != keys_to_fold.end(); it++, idx++) {
        auto key = *it;
        auto domain_separator = std::to_string(idx);
        run_oink_prover_on_one_incomplete_key(key, vks_to_fold[idx], domain_separator);
    }

    accumulator = keys_to_fold[0];
};

template <IsUltraOrMegaHonk Flavor, size_t NUM_KEYS>
std::tuple<std::vector<typename Flavor::FF>, Polynomial<typename Flavor::FF>> ProtogalaxyProver_<Flavor, NUM_KEYS>::
    perturbator_round(const std::shared_ptr<const DeciderPK>& accumulator)
{
    PROFILE_THIS_NAME("ProtogalaxyProver_::perturbator_round");

    const FF delta = transcript->template get_challenge<FF>("delta");
    const std::vector<FF> deltas = compute_round_challenge_pows(CONST_PG_LOG_N, delta);
    // An honest prover with valid initial key computes that the perturbator is 0 in the first round
    const Polynomial<FF> perturbator = accumulator->is_accumulator
                                           ? pg_internal.compute_perturbator(accumulator, deltas)
                                           : Polynomial<FF>(CONST_PG_LOG_N + 1);
    // Prover doesn't send the constant coefficient of F because this is supposed to be equal to the target sum of
    // the accumulator which the folding verifier has from the previous iteration.
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1087): Verifier circuit for first IVC step is
    // different
    for (size_t idx = 1; idx <= CONST_PG_LOG_N; idx++) {
        transcript->send_to_verifier("perturbator_" + std::to_string(idx), perturbator[idx]);
    }

    return std::make_tuple(deltas, perturbator);
};

template <IsUltraOrMegaHonk Flavor, size_t NUM_KEYS>
std::tuple<std::vector<typename Flavor::FF>,
           typename ProtogalaxyProver_<Flavor, NUM_KEYS>::UnivariateRelationSeparator,
           typename ProtogalaxyProver_<Flavor, NUM_KEYS>::UnivariateRelationParameters,
           typename Flavor::FF,
           typename ProtogalaxyProver_<Flavor, NUM_KEYS>::CombinerQuotient>
ProtogalaxyProver_<Flavor, NUM_KEYS>::combiner_quotient_round(const std::vector<FF>& gate_challenges,
                                                              const std::vector<FF>& deltas,
                                                              const DeciderProvingKeys& keys)
{
    PROFILE_THIS_NAME("ProtogalaxyProver_::combiner_quotient_round");

    const FF perturbator_challenge = transcript->template get_challenge<FF>("perturbator_challenge");

    const std::vector<FF> updated_gate_challenges =
        update_gate_challenges(perturbator_challenge, gate_challenges, deltas);
    const UnivariateRelationSeparator alphas = PGInternal::compute_and_extend_alphas(keys);
    const GateSeparatorPolynomial<FF> gate_separators{ updated_gate_challenges, CONST_PG_LOG_N };
    const UnivariateRelationParameters relation_parameters =
        PGInternal::template compute_extended_relation_parameters<UnivariateRelationParameters>(keys);

    TupleOfTuplesOfUnivariates accumulators;
    auto combiner = pg_internal.compute_combiner(keys, gate_separators, relation_parameters, alphas, accumulators);

    const FF perturbator_evaluation = perturbator.evaluate(perturbator_challenge);
    const CombinerQuotient combiner_quotient = PGInternal::compute_combiner_quotient(perturbator_evaluation, combiner);

    for (size_t idx = NUM_KEYS; idx < DeciderProvingKeys::BATCHED_EXTENDED_LENGTH; idx++) {
        transcript->send_to_verifier("combiner_quotient_" + std::to_string(idx), combiner_quotient.value_at(idx));
    }

    return std::make_tuple(
        updated_gate_challenges, alphas, relation_parameters, perturbator_evaluation, combiner_quotient);
}

/**
 * @brief Given the challenge \gamma, compute Z(\gamma) and {L_0(\gamma),L_1(\gamma)}
 */
template <IsUltraOrMegaHonk Flavor, size_t NUM_KEYS>
void ProtogalaxyProver_<Flavor, NUM_KEYS>::update_target_sum_and_fold(
    const DeciderProvingKeys& keys,
    const CombinerQuotient& combiner_quotient,
    const UnivariateRelationSeparator& alphas,
    const UnivariateRelationParameters& univariate_relation_parameters,
    const FF& perturbator_evaluation)
{
    PROFILE_THIS_NAME("ProtogalaxyProver_::update_target_sum_and_fold");

    std::shared_ptr<DeciderPK> accumulator = keys[0];
    std::shared_ptr<DeciderPK> incoming = keys[1];
    accumulator->is_accumulator = true;

    // At this point the virtual sizes of the polynomials should already agree
    BB_ASSERT_EQ(accumulator->proving_key.polynomials.w_l.virtual_size(),
                 incoming->proving_key.polynomials.w_l.virtual_size());

    const FF combiner_challenge = transcript->template get_challenge<FF>("combiner_quotient_challenge");

    // Compute the next target sum (for its own use; verifier must compute its own values)
    auto [vanishing_polynomial_at_challenge, lagranges] =
        PGInternal::compute_vanishing_polynomial_and_lagranges(combiner_challenge);
    accumulator->target_sum = perturbator_evaluation * lagranges[0] +
                              vanishing_polynomial_at_challenge * combiner_quotient.evaluate(combiner_challenge);

    // Check whether the incoming key has a larger trace overflow than the accumulator. If so, the memory structure of
    // the accumulator polynomials will not be sufficient to contain the contribution from the incoming polynomials. The
    // solution is to simply reverse the order or the terms in the linear combination by swapping the polynomials and
    // the lagrange coefficients between the accumulator and the incoming key.
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1417): make this swapping logic more robust.
    if (incoming->overflow_size > accumulator->overflow_size) {
        std::swap(accumulator->proving_key.polynomials, incoming->proving_key.polynomials);   // swap the polys
        std::swap(accumulator->proving_key.circuit_size, incoming->proving_key.circuit_size); // swap circuit size
        std::swap(accumulator->proving_key.log_circuit_size, incoming->proving_key.log_circuit_size);
        std::swap(lagranges[0], lagranges[1]); // swap the lagrange coefficients so the sum is unchanged
        std::swap(accumulator->overflow_size, incoming->overflow_size);             // swap overflow size
        std::swap(accumulator->dyadic_circuit_size, incoming->dyadic_circuit_size); // swap dyadic size
    }

    // Fold the proving key polynomials
    for (auto& poly : accumulator->proving_key.polynomials.get_unshifted()) {
        poly *= lagranges[0];
    }
    for (auto [acc_poly, key_poly] : zip_view(accumulator->proving_key.polynomials.get_unshifted(),
                                              incoming->proving_key.polynomials.get_unshifted())) {
        acc_poly.add_scaled(key_poly, lagranges[1]);
    }

    // Evaluate the combined batching  α_i univariate at challenge to obtain next α_i and send it to the
    // verifier, where i ∈ {0,...,NUM_SUBRELATIONS - 1}
    for (auto [folded_alpha, key_alpha] : zip_view(accumulator->alphas, alphas)) {
        folded_alpha = key_alpha.evaluate(combiner_challenge);
    }

    // Evaluate each relation parameter univariate at challenge to obtain the folded relation parameters.
    for (auto [univariate, value] :
         zip_view(univariate_relation_parameters.get_to_fold(), accumulator->relation_parameters.get_to_fold())) {
        value = univariate.evaluate(combiner_challenge);
    }
}

template <IsUltraOrMegaHonk Flavor, size_t NUM_KEYS> FoldingResult<Flavor> ProtogalaxyProver_<Flavor, NUM_KEYS>::prove()
{

    PROFILE_THIS_NAME("ProtogalaxyProver::prove");

    // Ensure keys are all of the same size
    size_t max_circuit_size = 0;
    for (size_t idx = 0; idx < NUM_KEYS; ++idx) {
        max_circuit_size = std::max(max_circuit_size, keys_to_fold[idx]->proving_key.circuit_size);
    }
    for (size_t idx = 0; idx < NUM_KEYS; ++idx) {
        if (keys_to_fold[idx]->proving_key.circuit_size != max_circuit_size) {
            info("ProtogalaxyProver: circuit size mismatch - increasing virtual size of key ",
                 idx,
                 " from ",
                 keys_to_fold[idx]->proving_key.circuit_size,
                 " to ",
                 max_circuit_size);
            keys_to_fold[idx]->proving_key.polynomials.increase_polynomials_virtual_size(max_circuit_size);
        }
    }

    run_oink_prover_on_each_incomplete_key();
    vinfo("oink prover on each incomplete key");

    std::tie(deltas, perturbator) = perturbator_round(accumulator);
    vinfo("perturbator round");

    std::tie(accumulator->gate_challenges, alphas, relation_parameters, perturbator_evaluation, combiner_quotient) =
        combiner_quotient_round(accumulator->gate_challenges, deltas, keys_to_fold);
    vinfo("combiner quotient round");

    update_target_sum_and_fold(keys_to_fold, combiner_quotient, alphas, relation_parameters, perturbator_evaluation);
    vinfo("folded");

    return FoldingResult<Flavor>{ .accumulator = keys_to_fold[0], .proof = transcript->export_proof() };
}
} // namespace bb
