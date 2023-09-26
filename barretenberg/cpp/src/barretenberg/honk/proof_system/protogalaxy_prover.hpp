#pragma once
#include "barretenberg/honk/flavor/goblin_ultra.hpp"
#include "barretenberg/honk/flavor/ultra.hpp"
#include "barretenberg/honk/flavor/ultra_grumpkin.hpp"
#include "barretenberg/honk/instance/instances.hpp"
#include "barretenberg/honk/proof_system/folding_result.hpp"
#include "barretenberg/proof_system/flavor/flavor.hpp"
namespace proof_system::honk {
template <class ProverInstances> class ProtoGalaxyProver_ {
  public:
    using Flavor = typename ProverInstances::Flavor;
    using Instance = typename ProverInstances::Instance;
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;

    ProverInstances instances;
    ProverTranscript<FF> transcript;

    ProtoGalaxyProver_(ProverInstances insts)
        : instances(insts){};
    ~ProtoGalaxyProver_() = default;

    void prepare_for_folding();

    std::vector<FF> compute_round_challenge_pows(size_t instance_size, FF round_challenge)
    {
        std::vector<FF> pows(instance_size);
        pows[0] = round_challenge;
        for (size_t i = 1; i < instance_size; i++) {
            pows[i] = pows[i - 1].sqr();
        }
        return pows;
    }

    // degree of G can be found at compile time but that is not the case for degree of F
    // need a function that returns me all the f_i(prover polynomials of inst i)
    // I guess in perturbator we just take stuff from the first instance which would make the most sense
    // and then \vec{beta} is part of instance?
    // retur
    std::vector<FF> compute_perturbator([[maybe_unused]] std::vector<FF> round_challenge_pows)
    {
        auto accumulator = instances[0];
        // all the prover polynomials should have the same length
        auto instance_size = accumulator.prover_polynomials[0].size();
        auto log_instance_size = static_cast<size_t>(numeric::get_msb(instance_size));
        std::vector<FF> perturbator_univariate(log_instance_size);
        for (size_t idx = 0; idx < instance_size; idx++) {

            // AccumulatorAndViews because all relations are extended to the highest degree but there's no need for
            // it(?)
            // f_i(w) cant be only one value, it's actually a vector ???
        }
    };

    ProverFoldingResult<Flavor> fold_instances();
};

extern template class ProtoGalaxyProver_<ProverInstances_<honk::flavor::Ultra, 2>>;
extern template class ProtoGalaxyProver_<ProverInstances_<honk::flavor::UltraGrumpkin, 2>>;
extern template class ProtoGalaxyProver_<ProverInstances_<honk::flavor::GoblinUltra, 2>>;
} // namespace proof_system::honk