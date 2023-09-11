#pragma once
#include "barretenberg/proof_system/flavor/flavor.hpp"
namespace proof_system::honk {
template <UltraFlavor Flavor> struct ProverFoldingResult {
  public:
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using FoldingParameters = typename Flavor::FoldingParameters;
    ProverPolynomials folded_prover_polynomials;
    std::vector<uint8_t> folding_data;
    FoldingParameters params;
};

template <UltraFlavor Flavor> struct VerifierFoldingResult {
    using FF = typename Flavor::FF;
    using VerificationKey = typename Flavor::VerificationKey;
    using FoldingParameters = typename Flavor::FoldingParameters;
    // TODO: what happens to the public input offsets
    std::vector<FF> folded_public_inputs;
    VerificationKey verification_key;
    FoldingParameters params;
};
} // namespace proof_system::honk