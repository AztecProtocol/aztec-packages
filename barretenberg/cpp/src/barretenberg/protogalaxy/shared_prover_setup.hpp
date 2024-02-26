#pragma once
#include <utility>

#include "barretenberg/flavor/goblin_ultra.hpp"
#include "barretenberg/flavor/ultra.hpp"
#include "barretenberg/sumcheck/instance/prover_instance.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

template <IsUltraFlavor Flavor> class PreSumcheckProver {
    using CommitmentKey = typename Flavor::CommitmentKey;
    using Instance = ProverInstance_<Flavor>;
    using Transcript = typename Flavor::Transcript;

  public:
    PreSumcheckProver(const std::shared_ptr<ProverInstance_<Flavor>>& inst,
                      const std::shared_ptr<typename Flavor::CommitmentKey>& commitment_key,
                      const std::shared_ptr<typename Flavor::Transcript>& transcript,
                      std::string domain_separator = "")
        : instance(inst)
        , transcript(transcript)
        , commitment_key(commitment_key)
        , domain_separator(std::move(domain_separator))
    {
        instance->initialize_prover_polynomials();
    }

    void execute_preamble_round();

    void execute_wire_commitments_round();

    void execute_sorted_list_accumulator_round();

    void execute_log_derivative_inverse_round();

    void execute_grand_product_computation_round();

    std::shared_ptr<Instance> instance;
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<CommitmentKey> commitment_key;
    std::string domain_separator;
};

template <IsUltraFlavor Flavor>
void prover_setup_(const std::shared_ptr<ProverInstance_<Flavor>>& instance,
                   const std::shared_ptr<typename Flavor::CommitmentKey>& commitment_key,
                   const std::shared_ptr<typename Flavor::Transcript>& transcript,
                   const std::string& domain_separator = "");
} // namespace bb