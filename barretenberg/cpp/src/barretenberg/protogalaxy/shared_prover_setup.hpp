#pragma once
#include "barretenberg/flavor/goblin_ultra.hpp"
#include "barretenberg/flavor/ultra.hpp"
#include "barretenberg/sumcheck/instance/prover_instance.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

template <IsUltraFlavor Flavor>
void prover_setup(const std::shared_ptr<ProverInstance_<Flavor>>& instance,
                  const std::shared_ptr<typename Flavor::CommitmentKey>& commitment_key,
                  const std::shared_ptr<typename Flavor::Transcript>& transcript,
                  const std::string& domain_separator = "");
}