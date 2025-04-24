// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
namespace bb {
/**
 * @brief The result of running the Protogalaxy prover containing a new accumulator as well as the proof data to
 * instantiate the verifier transcript.
 */
template <class Flavor> struct FoldingResult {
  public:
    std::shared_ptr<DeciderProvingKey_<Flavor>> accumulator;
    std::vector<typename Flavor::FF> proof;
};
} // namespace bb
