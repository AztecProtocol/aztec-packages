#pragma once
#include "barretenberg/honk/flavor/goblin_ultra.hpp"
#include "barretenberg/honk/flavor/ultra.hpp"
#include "barretenberg/honk/flavor/ultra_grumpkin.hpp"
#include "barretenberg/honk/instance/instances.hpp"
#include "barretenberg/honk/proof_system/folding_result.hpp"
#include "barretenberg/proof_system/flavor/flavor.hpp"
#include "barretenberg/proof_system/relations/utils.hpp"
namespace proof_system::honk {
template <class ProverInstances> class ProtoGalaxyProver_ {
  public:
    using Flavor = typename ProverInstances::Flavor;
    using Instance = typename ProverInstances::Instance;
    using Utils = barretenberg::RelationUtils<Flavor>;
    using RowEvaluations = typename Flavor::ProverPolynomialsEvaluations;
    using RelationEvaluations = typename Flavor::RelationValues;
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;

    ProverInstances instances;
    ProverTranscript<FF> transcript;

    ProtoGalaxyProver_(ProverInstances insts)
        : instances(insts){};
    ~ProtoGalaxyProver_() = default;

    void prepare_for_folding();

    // compute the deltas in the paper
    std::vector<FF> compute_round_challenge_pows(size_t size, FF round_challenge)
    {
        std::vector<FF> pows(size);
        pows[0] = round_challenge;
        for (size_t i = 1; i < size; i++) {
            pows[i] = pows[i - 1].sqr();
        }
        return pows;
    }

    RowEvaluations get_row(std::shared_ptr<Instance> accumulator, size_t row)
    {
        RowEvaluations row_evals;
        size_t idx = 0;
        for (auto& poly : accumulator->prover_polynomials) {
            row_evals[idx] = poly[row];
            idx++;
        }
        return row_evals;
    }

    std::shared_ptr<Instance> get_accumulator() { return instances[0]; }

    // the pow in sumcheck will be replaced with the pow in protogalaxy!!!!!!!!
    // here we don't have the pow polynomial extra parameter because the gate separation challenge is a polynomial for
    // perturbator and it's going to be added later
    FF compute_full_honk_relation_row_value(RowEvaluations row_evaluations,
                                            FF alpha,
                                            const proof_system::RelationParameters<FF>& relation_parameters)
    {
        RelationEvaluations relation_evaluations;
        Utils::zero_elements(relation_evaluations);

        // TODO: we add the gate separation challenge as a univariate later
        // We will have to change the power polynomial in sumcheck to respect the structure of PG rather than what we
        // currently have
        Utils::template accumulate_relation_evaluations<>(
            row_evaluations, relation_evaluations, relation_parameters, FF(1));

        // Not sure what this running challenge is we have to investigate
        auto running_challenge = FF(1);
        auto output = FF(0);
        Utils::scale_and_batch_elements(relation_evaluations, alpha, running_challenge, output);
        return output;
    }

    // We return the evaluate of perturbator at 0,..,log(n) where n is the circuit size
    std::vector<FF> compute_perturbator(std::shared_ptr<Instance> accumulator, std::vector<FF> deltas, FF alpha)
    {
        // all the prover polynomials should have the same length
        auto instance_size = accumulator->prover_polynomials[0].size();
        auto log_instance_size = static_cast<size_t>(numeric::get_msb(instance_size));
        std::vector<FF> perturbator_univariate(log_instance_size);
        std::vector<FF> full_honk_evaluations(instance_size);
        for (size_t idx = 0; idx < instance_size; idx++) {

            auto row_evaluations = get_row(accumulator, idx);
            auto full_honk_at_row =
                compute_full_honk_relation_row_value(row_evaluations, alpha, accumulator->relation_parameters);
            // this is f_i(w) where idx=i
            full_honk_evaluations[idx] = full_honk_at_row;
        }

        auto betas = accumulator->folding_params.gate_separation_challenges;

        // note: the tree technique can probably/maybe be done with apply tuples sth, check later
        for (size_t point = 1; point <= log_instance_size; point++) {
            std::vector<FF> labels(log_instance_size, 0);
            for (size_t idx = 0; idx < log_instance_size; idx++) {
                labels[idx] = betas[idx] + FF(point) * deltas[idx];
            }
            auto eval_at_point = FF(0);
            for (size_t idx = 0; idx < instance_size; idx++) {
                auto res = full_honk_evaluations[idx];
                auto j = idx;
                size_t iter = 0;
                while (j > 0) {
                    if ((j & 1) == 1) {
                        res *= labels[iter];
                        iter++;
                        j >>= 1;
                    }
                }
                eval_at_point += res;
            }
            perturbator_univariate[point] = eval_at_point;
            transcript.send_to_verifier("perturbator_eval_" + std::to_string(point), eval_at_point);
        }
        return perturbator_univariate;
    };

    ProverFoldingResult<Flavor> fold_instances();
};

extern template class ProtoGalaxyProver_<ProverInstances_<honk::flavor::Ultra, 2>>;
extern template class ProtoGalaxyProver_<ProverInstances_<honk::flavor::UltraGrumpkin, 2>>;
extern template class ProtoGalaxyProver_<ProverInstances_<honk::flavor::GoblinUltra, 2>>;
} // namespace proof_system::honk