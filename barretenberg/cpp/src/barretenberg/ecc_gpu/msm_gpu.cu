// CUDA MSM backend for BN254 G1 built on sppark (Apache-2.0, supranational).
// This is the only CUDA TU in the tree; it is compiled by nvcc, so it must not include
// any barretenberg headers (see msm_gpu.hpp for the POD boundary rationale).
#include "msm_gpu.hpp"

#include <cstring>
#include <cuda_runtime.h>

// sppark instantiation recipe, mirroring sppark/poc/msm-cuda/cuda/pippenger_inf.cu.
// FEATURE_BN254 makes ff/alt_bn128.hpp export alt_bn128 (== BN254) types unqualified.
#define FEATURE_BN254
#include <ff/alt_bn128.hpp>

#include <ec/jacobian_t.hpp>
#include <ec/xyzz_t.hpp>

typedef jacobian_t<fp_t> point_t;
typedef xyzz_t<fp_t> bucket_t;
// Plain Affine_t {X, Y}: 64 bytes, layout-compatible with bb's g1::affine_element.
// NOT affine_inf_t, whose extra `bool inf` member changes the host-side stride.
typedef bucket_t::affine_t affine_t;
typedef fr_t scalar_t;

#define SPPARK_DONT_INSTANTIATE_TEMPLATES
#include <msm/pippenger.cuh>

// gpu_t device pool (select_gpu, ngpus, ...). sppark ships this as a separate TU; we
// fold it into this single TU to keep the CUDA build to one compilation unit.
#include <util/all_gpus.cpp>

namespace bb::scalar_multiplication::gpu {

static_assert(sizeof(AffinePointRaw) == sizeof(affine_t), "affine layout mismatch vs sppark");
static_assert(sizeof(JacobianPointRaw) == sizeof(point_t), "jacobian layout mismatch vs sppark");
static_assert(sizeof(scalar_t) == 4 * sizeof(uint64_t), "scalar layout mismatch vs sppark");

bool available() noexcept
{
    // select_gpu aborts if the pool is empty, so probe before ever touching it.
    int count = 0;
    if (cudaGetDeviceCount(&count) != cudaSuccess || count == 0) {
        return false;
    }
    return ngpus() > 0;
}

namespace {
int consume_error(RustError&& err) noexcept
{
    if (err.message != nullptr) {
        free(err.message);
    }
    return err.code;
}
} // namespace

int msm_oneshot_bn254(JacobianPointRaw& out,
                      const AffinePointRaw* points,
                      const uint64_t* scalars,
                      size_t npoints) noexcept
{
    if (!available()) {
        return -1;
    }
    point_t result;
    RustError err = mult_pippenger<bucket_t>(&result,
                                             reinterpret_cast<const affine_t*>(points),
                                             npoints,
                                             reinterpret_cast<const scalar_t*>(scalars),
                                             /*mont=*/false,
                                             sizeof(affine_t));
    std::memcpy(&out, &result, sizeof(out));
    return consume_error(std::move(err));
}

using msm_impl_t = msm_t<bucket_t, point_t, affine_t, scalar_t>;

MsmContextBn254::MsmContextBn254(const AffinePointRaw* points, size_t np)
{
    if (!available() || np == 0) {
        return;
    }
    try {
        impl = new msm_impl_t(reinterpret_cast<const affine_t*>(points), np, sizeof(affine_t));
        npoints = np;
    } catch (...) {
        impl = nullptr;
    }
}

MsmContextBn254::~MsmContextBn254()
{
    delete static_cast<msm_impl_t*>(impl);
}

MsmContextBn254::MsmContextBn254(MsmContextBn254&& other) noexcept
    : impl(other.impl)
    , npoints(other.npoints)
{
    other.impl = nullptr;
    other.npoints = 0;
}

int MsmContextBn254::msm(JacobianPointRaw& out, const uint64_t* scalars, size_t n) noexcept
{
    if (!valid() || n > npoints) {
        return -1;
    }
    point_t result;
    RustError err = static_cast<msm_impl_t*>(impl)->invoke(result,
                                                           /*points=*/static_cast<const affine_t*>(nullptr),
                                                           n,
                                                           reinterpret_cast<const scalar_t*>(scalars),
                                                           /*mont=*/false,
                                                           sizeof(affine_t));
    std::memcpy(&out, &result, sizeof(out));
    return consume_error(std::move(err));
}

} // namespace bb::scalar_multiplication::gpu
