#pragma once
#include "barretenberg/flavor/goblin_ultra.hpp"
#include "barretenberg/flavor/ultra.hpp"
#include "barretenberg/sumcheck/instance/prover_instance.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

template <IsUltraFlavor Flavor>
void execute_preamble_round_(const std::shared_ptr<ProverInstance_<Flavor>>& instance,
                             const std::shared_ptr<typename Flavor::Transcript>& transcript,
                             const std::string& domain_separator = "");

template <IsUltraFlavor Flavor>
void execute_wire_commitments_round_(const std::shared_ptr<ProverInstance_<Flavor>>& instance,
                                     const std::shared_ptr<typename Flavor::CommitmentKey>& commitment_key,
                                     const std::shared_ptr<typename Flavor::Transcript>& transcript,
                                     const std::string& domain_separator = "");

template <IsUltraFlavor Flavor>
void execute_sorted_list_accumulator_round_(const std::shared_ptr<ProverInstance_<Flavor>>& instance,
                                            const std::shared_ptr<typename Flavor::CommitmentKey>& commitment_key,
                                            const std::shared_ptr<typename Flavor::Transcript>& transcript,
                                            const std::string& domain_separator = "");

template <IsUltraFlavor Flavor>
void execute_log_derivative_inverse_round_(const std::shared_ptr<ProverInstance_<Flavor>>& instance,
                                           const std::shared_ptr<typename Flavor::CommitmentKey>& commitment_key,
                                           const std::shared_ptr<typename Flavor::Transcript>& transcript,
                                           const std::string& domain_separator = "");

template <IsUltraFlavor Flavor>
void execute_grand_product_computation_round_(const std::shared_ptr<ProverInstance_<Flavor>>& instance,
                                              const std::shared_ptr<typename Flavor::CommitmentKey>& commitment_key,
                                              const std::shared_ptr<typename Flavor::Transcript>& transcript,
                                              const std::string& domain_separator = "");
template <IsUltraFlavor Flavor>
void prover_setup_(const std::shared_ptr<ProverInstance_<Flavor>>& instance,
                   const std::shared_ptr<typename Flavor::CommitmentKey>& commitment_key,
                   const std::shared_ptr<typename Flavor::Transcript>& transcript,
                   const std::string& domain_separator = "");
} // namespace bb