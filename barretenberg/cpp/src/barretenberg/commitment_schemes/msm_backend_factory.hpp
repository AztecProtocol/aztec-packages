#pragma once

#include "barretenberg/commitment_schemes/msm_backend.hpp"

#include <memory>

namespace bb {

/**
 * @brief The MSM backend a prover should build its commitment key with.
 *
 * @details The CPU Pippenger, or, in a build configured with `GPU_MSM=ON`, the CUDA backend. The choice is made
 * when the library is built, never at run time. A GPU build asserts at construction that a CUDA device is
 * present and fails loudly if a device call later fails; it never falls back to the CPU.
 */
template <class Curve> std::shared_ptr<const MsmBackend<Curve>> make_msm_backend();

extern template std::shared_ptr<const MsmBackend<curve::BN254>> make_msm_backend<curve::BN254>();
extern template std::shared_ptr<const MsmBackend<curve::Grumpkin>> make_msm_backend<curve::Grumpkin>();

} // namespace bb
