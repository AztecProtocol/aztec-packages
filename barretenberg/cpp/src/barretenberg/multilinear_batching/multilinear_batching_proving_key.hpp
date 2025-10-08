// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include <utility>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
namespace bb {
// TODO(https://github.com/AztecProtocol/barretenberg/issues/1317)
class MultilinearBatchingProvingKey {
  public:
    using Flavor = MultilinearBatchingFlavor;
    using FF = typename Flavor::FF;
    using ProvingKey = typename Flavor::ProvingKey;
    using Polynomial = typename Flavor::Polynomial;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using CommitmentKey = typename Flavor::CommitmentKey;

    std::shared_ptr<ProvingKey> proving_key;
    size_t circuit_size;

    MultilinearBatchingProvingKey() = default;

    MultilinearBatchingProvingKey(ProverPolynomials& polynomials,
                                  std::vector<FF> accumulator_challenge,
                                  std::vector<FF> instance_challenge,
                                  std::vector<FF> accumulator_evaluations,
                                  std::vector<FF> instance_evaluations)
    {
        BB_BENCH_NAME("MultilinearBatchingProvingKey(ProverPolynomials&)");

        proving_key = std::make_shared<ProvingKey>(std::move(polynomials),
                                                   std::move(accumulator_challenge),
                                                   std::move(instance_challenge),
                                                   std::move(accumulator_evaluations),
                                                   std::move(instance_evaluations));
        circuit_size = polynomials.get_polynomial_size();
    };
};
} // namespace bb
