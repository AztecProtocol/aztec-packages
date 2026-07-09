#pragma once

#include <cstddef>
#include <cstdint>

// POD boundary to the CUDA MSM backend (implemented in msm_gpu.cu, compiled by nvcc).
// Deliberately free of barretenberg and CUDA includes: the CUDA TU is compiled by a
// different toolchain than the rest of the tree, so only raw limb structs, pointers and
// sizes cross this interface. All values are 4x64-bit little-endian Montgomery-form
// limbs (R = 2^256), matching both barretenberg's and sppark/blst's representation.

namespace bb::scalar_multiplication::gpu {

struct AffinePointRaw {
    uint64_t x[4];
    uint64_t y[4];
};

struct JacobianPointRaw {
    uint64_t x[4];
    uint64_t y[4];
    uint64_t z[4]; // z == 0 encodes the point at infinity
};

// True if a usable CUDA device (Volta+) is present.
bool available() noexcept;

// One-shot BN254 G1 MSM including host->device point transfer:
// out = sum_i scalars[i] * points[i].
// Scalars are canonical (< r) standard-form (non-Montgomery) fr limbs, 4 uint64 each.
// Returns 0 on success, a CUDA/sppark error code otherwise.
int msm_oneshot_bn254(JacobianPointRaw& out,
                      const AffinePointRaw* points,
                      const uint64_t* scalars,
                      size_t npoints) noexcept;

// Resident-points context: uploads the (fixed, e.g. SRS) points to device memory once
// and reuses them across msm() calls, so only scalars cross PCIe per MSM.
class MsmContextBn254 {
  public:
    MsmContextBn254(const AffinePointRaw* points, size_t npoints);
    ~MsmContextBn254();
    MsmContextBn254(const MsmContextBn254&) = delete;
    MsmContextBn254& operator=(const MsmContextBn254&) = delete;
    MsmContextBn254(MsmContextBn254&& other) noexcept;
    MsmContextBn254& operator=(MsmContextBn254&&) = delete;

    // False if construction failed (no device, allocation failure, ...).
    bool valid() const noexcept { return impl != nullptr; }
    size_t size() const noexcept { return npoints; }

    // out = sum_{i<n} scalars[i] * points[i] over the first n <= size() resident points.
    // Returns 0 on success.
    int msm(JacobianPointRaw& out, const uint64_t* scalars, size_t n) noexcept;

  private:
    void* impl = nullptr;
    size_t npoints = 0;
};

} // namespace bb::scalar_multiplication::gpu
