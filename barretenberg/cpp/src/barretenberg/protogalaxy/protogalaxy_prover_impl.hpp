// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/honk/relation_checker.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover_internal.hpp"
#include "barretenberg/protogalaxy/prover_verifier_shared.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "protogalaxy_prover.hpp"

namespace bb {
template <IsUltraOrMegaHonk Flavor>
void ProtogalaxyProver_<Flavor>::run_oink_prover_on_one_incomplete_instance(std::shared_ptr<ProverInstance> key,
                                                                            std::shared_ptr<VerifierInstance> vk,
                                                                            const std::string& domain_separator)
{

    BB_BENCH_NAME("ProtogalaxyProver::run_oink_prover_on_one_incomplete_instance");
    OinkProver<Flavor> oink_prover(key, vk->vk, transcript, domain_separator + '_');
    oink_prover.prove();
}

template <IsUltraOrMegaHonk Flavor> void ProtogalaxyProver_<Flavor>::run_oink_prover_on_each_incomplete_instance()
{
    size_t idx = 0;
    auto& key = prover_insts_to_fold[0];
    auto domain_separator = std::to_string(idx);
    auto& verifier_accum = verifier_insts_to_fold[0];
    if (!key->is_complete) {
        run_oink_prover_on_one_incomplete_instance(key, verifier_accum, domain_separator);
        // Get the gate challenges for sumcheck/combiner computation
        key->gate_challenges =
            transcript->template get_powers_of_challenge<FF>(domain_separator + "_gate_challenge", CONST_PG_LOG_N);
    }

    idx++;

    for (auto it = prover_insts_to_fold.begin() + 1; it != prover_insts_to_fold.end(); it++, idx++) {
        auto key = *it;
        auto domain_separator = std::to_string(idx);
        run_oink_prover_on_one_incomplete_instance(key, verifier_insts_to_fold[idx], domain_separator);
    }

    accumulator = prover_insts_to_fold[0];
};

template <IsUltraOrMegaHonk Flavor>
std::tuple<std::vector<typename Flavor::FF>, Polynomial<typename Flavor::FF>> ProtogalaxyProver_<
    Flavor>::perturbator_round(const std::shared_ptr<const ProverInstance>& accumulator)
{
    BB_BENCH_NAME("ProtogalaxyProver_::perturbator_round");

    const std::vector<FF> deltas = transcript->template get_powers_of_challenge<FF>("delta", CONST_PG_LOG_N);
    // An honest prover with valid initial key computes that the perturbator is 0 in the first round
    const Polynomial<FF> perturbator = accumulator->from_first_instance
                                           ? pg_internal.compute_perturbator(accumulator, deltas)
                                           : Polynomial<FF>(CONST_PG_LOG_N + 1);
    // Prover doesn't send the constant coefficient of F because this is supposed to be equal to the target sum of
    // the accumulator which the folding verifier has from the previous iteration.
    for (size_t idx = 1; idx <= CONST_PG_LOG_N; idx++) {
        transcript->send_to_verifier("perturbator_" + std::to_string(idx), perturbator[idx]);
    }

    return std::make_tuple(deltas, perturbator);
};

template <IsUltraOrMegaHonk Flavor>
std::tuple<std::vector<typename Flavor::FF>,
           typename ProtogalaxyProver_<Flavor>::UnivariateSubrelationSeparators,
           typename ProtogalaxyProver_<Flavor>::UnivariateRelationParameters,
           typename Flavor::FF,
           typename ProtogalaxyProver_<Flavor>::CombinerQuotient>
ProtogalaxyProver_<Flavor>::combiner_quotient_round(const std::vector<FF>& gate_challenges,
                                                    const std::vector<FF>& deltas,
                                                    const ProverInstances& instances)
{
    BB_BENCH_NAME("ProtogalaxyProver_::combiner_quotient_round");

    const FF perturbator_challenge = transcript->template get_challenge<FF>("perturbator_challenge");

    const std::vector<FF> updated_gate_challenges =
        update_gate_challenges(perturbator_challenge, gate_challenges, deltas);
    const UnivariateSubrelationSeparators alphas = PGInternal::compute_and_extend_alphas(instances);
    const GateSeparatorPolynomial<FF> gate_separators{ updated_gate_challenges,
                                                       numeric::get_msb(get_max_dyadic_size()) };
    const UnivariateRelationParameters relation_parameters =
        PGInternal::template compute_extended_relation_parameters<UnivariateRelationParameters>(instances);

    // Note: {} is required to initialize the tuple contents. Otherwise the univariates contain garbage.
    TupleOfTuplesOfUnivariates accumulators{};
    auto combiner = pg_internal.compute_combiner(instances, gate_separators, relation_parameters, alphas, accumulators);

    const FF perturbator_evaluation = perturbator.evaluate(perturbator_challenge);
    const CombinerQuotient combiner_quotient = PGInternal::compute_combiner_quotient(perturbator_evaluation, combiner);

    for (size_t idx = NUM_INSTANCES; idx < BATCHED_EXTENDED_LENGTH; idx++) {
        transcript->send_to_verifier("combiner_quotient_" + std::to_string(idx), combiner_quotient.value_at(idx));
    }

    return std::make_tuple(
        updated_gate_challenges, alphas, relation_parameters, perturbator_evaluation, combiner_quotient);
}

/**
 * @brief Given the challenge \gamma, compute Z(\gamma) and {L_0(\gamma),L_1(\gamma)}
 */
template <IsUltraOrMegaHonk Flavor>
void ProtogalaxyProver_<Flavor>::update_target_sum_and_fold(
    const ProverInstances& instances,
    const CombinerQuotient& combiner_quotient,
    const UnivariateSubrelationSeparators& alphas,
    const UnivariateRelationParameters& univariate_relation_parameters,
    const FF& perturbator_evaluation)
{
    BB_BENCH_NAME("ProtogalaxyProver_::update_target_sum_and_fold");

    std::shared_ptr<ProverInstance> accumulator = instances[0];
    std::shared_ptr<ProverInstance> incoming = instances[1];
    accumulator->from_first_instance = true;

    // At this point the virtual sizes of the polynomials should already agree
    BB_ASSERT_EQ(accumulator->polynomials.w_l.virtual_size(), incoming->polynomials.w_l.virtual_size());

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
    bool swap_polys = incoming->get_overflow_size() > accumulator->get_overflow_size();
    if (swap_polys) {
        std::swap(accumulator->polynomials, incoming->polynomials); // swap the polys
        std::swap(lagranges[0], lagranges[1]);                 // swap the lagrange coefficients so the sum is unchanged
        accumulator->set_dyadic_size(incoming->dyadic_size()); // update dyadic size of accumulator
        accumulator->set_overflow_size(incoming->get_overflow_size()); // swap overflow size
    }

    // Fold the prover polynomials

    // Convert the polynomials into spans to remove boundary checks and if checks that normally apply when calling
    // getter/setters in Polynomial (see SharedShiftedVirtualZeroesArray::get)
    auto accumulator_polys = accumulator->polynomials.get_unshifted();
    auto key_polys = incoming->polynomials.get_unshifted();
    const size_t num_polys = key_polys.size();

    std::vector<PolynomialSpan<FF>> acc_spans;
    std::vector<PolynomialSpan<FF>> key_spans;
    acc_spans.reserve(num_polys);
    key_spans.reserve(num_polys);
    for (size_t i = 0; i < num_polys; ++i) {
        acc_spans.emplace_back(static_cast<PolynomialSpan<FF>>(accumulator_polys[i]));
        key_spans.emplace_back(static_cast<PolynomialSpan<FF>>(key_polys[i]));
    }

    parallel_for([&acc_spans, &key_spans, &lagranges, &combiner_challenge, &swap_polys](const ThreadChunk& chunk) {
        for (auto [acc_poly, key_poly] : zip_view(acc_spans, key_spans)) {
            size_t offset = acc_poly.start_index;
            for (size_t idx : chunk.range(acc_poly.size(), offset)) {
                if ((idx < key_poly.start_index) || (idx >= key_poly.end_index())) {
                    acc_poly[idx] *= lagranges[0];
                } else {
                    // acc * lagranges[0] + key * lagranges[1] =
                    // acc + (key - acc) * combiner_challenge (if !swap_polys)
                    // key + (acc - key) * combiner_challenge (if swap_polys)
                    if (swap_polys) {
                        acc_poly[idx] = key_poly[idx] + (acc_poly[idx] - key_poly[idx]) * combiner_challenge;
                    } else {
                        acc_poly[idx] = acc_poly[idx] + (key_poly[idx] - acc_poly[idx]) * combiner_challenge;
                    }
                }
            }
        }
    });

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

template <IsUltraOrMegaHonk Flavor> FoldingResult<Flavor> ProtogalaxyProver_<Flavor>::prove()
{
    BB_BENCH_NAME("ProtogalaxyProver::prove");

    // Ensure instances are all of the same size
    size_t max_circuit_size = 0;
    for (size_t idx = 0; idx < NUM_INSTANCES; ++idx) {
        max_circuit_size = std::max(max_circuit_size, prover_insts_to_fold[idx]->dyadic_size());
    }
    for (size_t idx = 0; idx < NUM_INSTANCES; ++idx) {
        if (prover_insts_to_fold[idx]->dyadic_size() != max_circuit_size) {
            info("ProtogalaxyProver: circuit size mismatch - increasing virtual size of key ",
                 idx,
                 " from ",
                 prover_insts_to_fold[idx]->dyadic_size(),
                 " to ",
                 max_circuit_size);
            prover_insts_to_fold[idx]->polynomials.increase_polynomials_virtual_size(max_circuit_size);
        }
    }

    run_oink_prover_on_each_incomplete_instance();
    vinfo("oink prover on each incomplete key");

    std::tie(deltas, perturbator) = perturbator_round(accumulator);
    vinfo("perturbator round");

    std::tie(accumulator->gate_challenges, alphas, relation_parameters, perturbator_evaluation, combiner_quotient) =
        combiner_quotient_round(accumulator->gate_challenges, deltas, prover_insts_to_fold);
    vinfo("combiner quotient round");

    update_target_sum_and_fold(
        prover_insts_to_fold, combiner_quotient, alphas, relation_parameters, perturbator_evaluation);
    vinfo("folded");

    return FoldingResult<Flavor>{ .accumulator = prover_insts_to_fold[0], .proof = transcript->export_proof() };
}
} // namespace bb
