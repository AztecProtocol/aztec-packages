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
    std::vector<FF> folded_public_inputs;
    VerificationKey folded_verification_key;
    FoldingParameters parameters;
};

/**
 * @brief The aggregated result from the prover and verifier after a round of folding, used to create a new Instance.
 *
 * @tparam Flavor
 */
template <UltraFlavor Flavor> struct FoldingResult {
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using VerificationKey = typename Flavor::VerificationKey;
    using FoldingParameters = typename Flavor::FoldingParameters;
    ProverPolynomials folded_prover_polynomials;
    std::vector<FF> folded_public_inputs;
    std::shared_ptr<VerificationKey> verification_key;
    FoldingParameters params;
};
} // namespace proof_system::honk