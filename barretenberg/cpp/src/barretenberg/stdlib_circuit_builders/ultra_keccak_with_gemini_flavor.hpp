#pragma once
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_keccak_flavor.hpp"
namespace bb {

class UltraKeccakWithGeminiFlavor : public bb::UltraKeccakFlavor {
  public:
    using Curve = bb::UltraKeccakFlavor::Curve;
    using BatchedMultilinearEvaluationScheme = Shplemini_<Curve>;
};
} // namespace bb