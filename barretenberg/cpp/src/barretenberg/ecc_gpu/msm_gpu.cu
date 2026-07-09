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
// affine_inf_t {X, Y, bool inf} — the instantiation every upstream sppark consumer
// (arkworks FFI, poc tests) uses. The plain Affine_t instantiation produced wrong MSM
// results on sm_89 while affine_inf_t matches upstream's tested path. Host points are
// staged into 72-byte records with an explicit zero inf flag (mirroring the arkworks
// layout); sppark's strided HtoD leaves the device-side inf words uninitialized for
// any narrower stride.
typedef bucket_t::affine_inf_t affine_t;
typedef fr_t scalar_t;

#define SPPARK_DONT_INSTANTIATE_TEMPLATES
#include <msm/pippenger.cuh>

// gpu_t device pool (select_gpu, ngpus, ...). sppark ships this as a separate TU; we
// fold it into this single TU to keep the CUDA build to one compilation unit.
#include <util/all_gpus.cpp>

namespace bb::scalar_multiplication::gpu {

static_assert(sizeof(JacobianPointRaw) == sizeof(point_t), "jacobian layout mismatch vs sppark");
static_assert(sizeof(scalar_t) == 4 * sizeof(uint64_t), "scalar layout mismatch vs sppark");

namespace {
// 72-byte host record for affine_inf_t: 64 bytes of coordinates + explicit zero inf
// word (bb points are never infinity; the SRS has none).
struct StagedAffine {
    uint64_t x[4];
    uint64_t y[4];
    uint32_t inf;
    uint32_t pad;
};
// The stride is passed as ffi_affine_sz; the device copies min(sizeof(mem_t), stride)
// bytes per record, so only the first 68 bytes (X, Y, inf word) need to line up.
static_assert(sizeof(StagedAffine) == 72, "staged affine record must be coordinate data + inf word");

std::vector<StagedAffine> stage_points(const AffinePointRaw* points, size_t n)
{
    std::vector<StagedAffine> staged(n);
    for (size_t i = 0; i < n; i++) {
        std::memcpy(staged[i].x, points[i].x, sizeof(points[i].x));
        std::memcpy(staged[i].y, points[i].y, sizeof(points[i].y));
        staged[i].inf = 0;
        staged[i].pad = 0;
    }
    return staged;
}
} // namespace

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
    std::vector<StagedAffine> staged = stage_points(points, npoints);
    point_t result;
    RustError err = mult_pippenger<bucket_t>(&result,
                                             reinterpret_cast<const affine_t*>(staged.data()),
                                             npoints,
                                             reinterpret_cast<const scalar_t*>(scalars),
                                             /*mont=*/false,
                                             sizeof(StagedAffine));
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
        std::vector<StagedAffine> staged = stage_points(points, np);
        impl = new msm_impl_t(reinterpret_cast<const affine_t*>(staged.data()), np, sizeof(StagedAffine));
        // The constructor's point upload is async; the staged buffer must outlive it.
        cudaDeviceSynchronize();
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
                                                           sizeof(StagedAffine));
    std::memcpy(&out, &result, sizeof(out));
    return consume_error(std::move(err));
}

} // namespace bb::scalar_multiplication::gpu
