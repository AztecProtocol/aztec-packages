#include "barretenberg/commitment_schemes/msm_backend_factory.hpp"

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

#ifdef BB_GPU_MSM
#include "barretenberg/commitment_schemes/gpu_msm_backend.hpp"
#include "barretenberg/common/assert.hpp"
#endif

namespace bb {

template <class Curve> std::shared_ptr<const MsmBackend<Curve>> make_msm_backend()
{
#ifdef BB_GPU_MSM
    BB_ASSERT(gpu_msm::cuda_available(), "this build uses the CUDA MSM backend but no CUDA device is available");
    return std::make_shared<GpuMsmBackend<Curve>>(&gpu_msm::msm_batch_cuda, /*serialize_runs=*/true);
#else
    return std::make_shared<CpuMsmBackend<Curve>>();
#endif
}

template std::shared_ptr<const MsmBackend<curve::BN254>> make_msm_backend<curve::BN254>();
template std::shared_ptr<const MsmBackend<curve::Grumpkin>> make_msm_backend<curve::Grumpkin>();

} // namespace bb
