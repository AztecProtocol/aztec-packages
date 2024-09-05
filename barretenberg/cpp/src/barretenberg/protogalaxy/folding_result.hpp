#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/instance/prover_instance.hpp"
namespace bb {
/**
 * @brief The result of running the Protogalaxy prover containing a new accumulator as well as the proof data to
 * instantiate the verifier transcript.
 */
template <class Flavor> struct FoldingResult {
  public:
    std::shared_ptr<DeciderProvingKey_<Flavor>> accumulator;
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/656): turn folding data into a struct
    std::vector<typename Flavor::FF> proof;
};
} // namespace bb