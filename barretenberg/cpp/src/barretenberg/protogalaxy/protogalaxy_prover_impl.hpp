#pragma once
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover_internal.hpp"
#include "barretenberg/protogalaxy/prover_verifier_shared.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "protogalaxy_prover.hpp"

namespace bb {
template <class DeciderProvingKeys>
void ProtogalaxyProver_<DeciderProvingKeys>::run_oink_prover_on_one_incomplete_key(std::shared_ptr<DeciderPK> keys,
                                                                                   const std::string& domain_separator)
{

#ifdef TRACY_MEMORY
    ZoneScopedN("ProtogalaxyProver::run_oink_prover_on_one_incomplete_key");
#endif
    OinkProver<Flavor> oink_prover(keys, transcript, domain_separator + '_');
    oink_prover.prove();
}

template <class DeciderProvingKeys>
void ProtogalaxyProver_<DeciderProvingKeys>::run_oink_prover_on_each_incomplete_key()
{
    BB_OP_COUNT_TIME_NAME("ProtogalaxyProver_::run_oink_prover_on_each_incomplete_key");
    size_t idx = 0;
    auto& key = keys_to_fold[0];
    auto domain_separator = std::to_string(idx);

    if (!key->is_accumulator) {
        run_oink_prover_on_one_incomplete_key(key, domain_separator);
        key->target_sum = 0;
        key->gate_challenges = std::vector<FF>(CONST_PG_LOG_N, 0);
    }

    idx++;

    for (auto it = keys_to_fold.begin() + 1; it != keys_to_fold.end(); it++, idx++) {
        auto key = *it;
        auto domain_separator = std::to_string(idx);
        run_oink_prover_on_one_incomplete_key(key, domain_separator);
    }

    accumulator = keys_to_fold[0];
};

template <class DeciderProvingKeys>
std::tuple<std::vector<typename DeciderProvingKeys::Flavor::FF>, Polynomial<typename DeciderProvingKeys::Flavor::FF>>
ProtogalaxyProver_<DeciderProvingKeys>::perturbator_round(
    const std::shared_ptr<const typename DeciderProvingKeys::DeciderPK>& accumulator)
{
    BB_OP_COUNT_TIME_NAME("ProtogalaxyProver_::perturbator_round");

    using Fun = ProtogalaxyProverInternal<DeciderProvingKeys>;

    const FF delta = transcript->template get_challenge<FF>("delta");
    const std::vector<FF> deltas = compute_round_challenge_pows(CONST_PG_LOG_N, delta);
    // An honest prover with valid initial key computes that the perturbator is 0 in the first round
    const Polynomial<FF> perturbator = accumulator->is_accumulator ? Fun::compute_perturbator(accumulator, deltas)
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

template <class DeciderProvingKeys>
std::tuple<std::vector<typename DeciderProvingKeys::Flavor::FF>,
           typename ProtogalaxyProver_<DeciderProvingKeys>::UnivariateRelationSeparator,
           typename ProtogalaxyProver_<DeciderProvingKeys>::UnivariateRelationParameters,
           typename DeciderProvingKeys::Flavor::FF,
           typename ProtogalaxyProver_<DeciderProvingKeys>::CombinerQuotient>
ProtogalaxyProver_<DeciderProvingKeys>::combiner_quotient_round(const std::vector<FF>& gate_challenges,
                                                                const std::vector<FF>& deltas,
                                                                const DeciderProvingKeys& keys)
{
    BB_OP_COUNT_TIME_NAME("ProtogalaxyProver_::combiner_quotient_round");

    using Fun = ProtogalaxyProverInternal<DeciderProvingKeys>;

    const FF perturbator_challenge = transcript->template get_challenge<FF>("perturbator_challenge");

    const std::vector<FF> updated_gate_challenges =
        update_gate_challenges(perturbator_challenge, gate_challenges, deltas);
    const UnivariateRelationSeparator alphas = Fun::compute_and_extend_alphas(keys);
    const GateSeparatorPolynomial<FF> gate_separators{ updated_gate_challenges, CONST_PG_LOG_N };
    const UnivariateRelationParameters relation_parameters =
        Fun::template compute_extended_relation_parameters<UnivariateRelationParameters>(keys);

    TupleOfTuplesOfUnivariates accumulators;
    auto combiner = Fun::compute_combiner(keys, gate_separators, relation_parameters, alphas, accumulators);

    const FF perturbator_evaluation = perturbator.evaluate(perturbator_challenge);
    const CombinerQuotient combiner_quotient = Fun::compute_combiner_quotient(perturbator_evaluation, combiner);

    for (size_t idx = DeciderProvingKeys::NUM; idx < DeciderProvingKeys::BATCHED_EXTENDED_LENGTH; idx++) {
        transcript->send_to_verifier("combiner_quotient_" + std::to_string(idx), combiner_quotient.value_at(idx));
    }

    return std::make_tuple(
        updated_gate_challenges, alphas, relation_parameters, perturbator_evaluation, combiner_quotient);
}

/**
 * @brief Given the challenge \gamma, compute Z(\gamma) and {L_0(\gamma),L_1(\gamma)}
 * TODO(https://github.com/AztecProtocol/barretenberg/issues/764): Generalize the vanishing polynomial formula
 * and the computation of Lagrange basis for k decider proving keys.
 */
template <class DeciderProvingKeys>
FoldingResult<typename DeciderProvingKeys::Flavor> ProtogalaxyProver_<DeciderProvingKeys>::update_target_sum_and_fold(
    const DeciderProvingKeys& keys,
    const CombinerQuotient& combiner_quotient,
    const UnivariateRelationSeparator& alphas,
    const UnivariateRelationParameters& univariate_relation_parameters,
    const FF& perturbator_evaluation)
{
    BB_OP_COUNT_TIME_NAME("ProtogalaxyProver_::update_target_sum_and_fold");
    using Fun = ProtogalaxyProverInternal<DeciderProvingKeys>;

    const FF combiner_challenge = transcript->template get_challenge<FF>("combiner_quotient_challenge");

    FoldingResult<Flavor> result{ .accumulator = keys[0], .proof = std::move(transcript->proof_data) };
    result.accumulator->is_accumulator = true;

    // Compute the next target sum (for its own use; verifier must compute its own values)
    auto [vanishing_polynomial_at_challenge, lagranges] =
        Fun::compute_vanishing_polynomial_and_lagranges(combiner_challenge);
    result.accumulator->target_sum = perturbator_evaluation * lagranges[0] +
                                     vanishing_polynomial_at_challenge * combiner_quotient.evaluate(combiner_challenge);

    // Fold the proving key polynomials
    for (auto& poly : result.accumulator->proving_key.polynomials.get_unshifted()) {
        poly *= lagranges[0];
    }
    for (size_t key_idx = 1; key_idx < DeciderProvingKeys::NUM; key_idx++) {
        for (auto [acc_poly, key_poly] : zip_view(result.accumulator->proving_key.polynomials.get_unshifted(),
                                                  keys[key_idx]->proving_key.polynomials.get_unshifted())) {
            acc_poly.add_scaled(key_poly, lagranges[key_idx]);
        }
    }

    // Evaluate the combined batching  α_i univariate at challenge to obtain next α_i and send it to the
    // verifier, where i ∈ {0,...,NUM_SUBRELATIONS - 1}
    for (auto [folded_alpha, key_alpha] : zip_view(result.accumulator->alphas, alphas)) {
        folded_alpha = key_alpha.evaluate(combiner_challenge);
    }

    // Evaluate each relation parameter univariate at challenge to obtain the folded relation parameters.
    for (auto [univariate, value] : zip_view(univariate_relation_parameters.get_to_fold(),
                                             result.accumulator->relation_parameters.get_to_fold())) {
        value = univariate.evaluate(combiner_challenge);
    }

    return result;
}

template <class DeciderProvingKeys>
FoldingResult<typename DeciderProvingKeys::Flavor> ProtogalaxyProver_<DeciderProvingKeys>::prove()
{

#ifdef TRACY_MEMORY
    ZoneScopedN("ProtogalaxyProver::prove");
#endif
    BB_OP_COUNT_TIME_NAME("ProtogalaxyProver::prove");
    // Ensure keys are all of the same size
    for (size_t idx = 0; idx < DeciderProvingKeys::NUM - 1; ++idx) {
        if (keys_to_fold[idx]->proving_key.circuit_size != keys_to_fold[idx + 1]->proving_key.circuit_size) {
            info("ProtogalaxyProver: circuit size mismatch!");
            info("DeciderPK ", idx, " size = ", keys_to_fold[idx]->proving_key.circuit_size);
            info("DeciderPK ", idx + 1, " size = ", keys_to_fold[idx + 1]->proving_key.circuit_size);
            ASSERT(false);
        }
    }
    run_oink_prover_on_each_incomplete_key();

    std::tie(deltas, perturbator) = perturbator_round(accumulator);

    std::tie(accumulator->gate_challenges, alphas, relation_parameters, perturbator_evaluation, combiner_quotient) =
        combiner_quotient_round(accumulator->gate_challenges, deltas, keys_to_fold);

    const FoldingResult<Flavor> result = update_target_sum_and_fold(
        keys_to_fold, combiner_quotient, alphas, relation_parameters, perturbator_evaluation);

    return result;
}
} // namespace bb