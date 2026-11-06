#pragma once
// Interface of the GPU MSM core.
//
// The CUDA code is built by nvcc, separately from the rest of barretenberg. To keep it that way, this header uses
// small plain structs (U256, AffinePoint) instead of barretenberg's field and point types, so the CUDA files never
// include barretenberg's field or group headers.
//
// The structs hold the same bits as barretenberg's types. Point coordinates are barretenberg's stored Montgomery
// limbs, so converting a point is a copy. The adapter in commitment_schemes/gpu_msm_adapter.hpp does the copying in
// both directions.
#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>

namespace bb::gpu_msm {

// 256-bit integer, four little-endian 64-bit limbs, canonical form (not Montgomery).
struct U256 {
    uint64_t limb[4];
};

// The curves the core supports: short Weierstrass with a = 0, over a 254-bit base field. Points are
// G1 of BN254 (y^2 = x^3 + 3) or Grumpkin (y^2 = x^3 - 17). Scalars are canonical integers below the
// order of the selected curve's group.
enum class Curve : uint32_t { Bn254 = 0, Grumpkin = 1 };

// Point in affine coordinates. x and y are Montgomery residues of the base field (R = 2^256, reduced to
// [0, p)), the form barretenberg stores field elements in, so a caller copies limbs with no arithmetic.
// Results are returned in the same form. `infinity` set means the point at infinity and x, y are ignored.
// Scalars, by contrast, are canonical integers.
struct AffinePoint {
    U256 x;
    U256 y;
    bool infinity;
};

// One MSM of a batch: result = sum_{j < size} scalars[j] * points[start + j]. Scalars are canonical and < r.
struct Column {
    const U256* scalars;
    uint64_t start;
    uint64_t size;
};

struct CoreConfig {
    Curve curve = Curve::Bn254;
    uint32_t window_bits = 0; // 0 selects automatically
    // Windows are independent, so several can run at once. 0 sizes the group of concurrent windows from
    // window_memory_bytes; a non-zero value forces that group size (1 reproduces one window at a time).
    uint32_t window_group = 0;
    uint64_t window_memory_bytes = 4ULL << 30; // device memory one group of windows may use when window_group == 0
    // Column groups whose host preparation overlaps the previous group's device work: 0 picks the count from the
    // batch size, 1 turns the overlap off, n forces n groups (capped at the column count).
    uint32_t host_pipeline = 0;
    // Merge the points of identical wide scalars within a column before bucketing, so a value repeated
    // many times is accumulated once instead of once per window.
    bool dedup_scalars = true;
};

// Batched MSM over the curve selected by `config.curve`, executed by the CUDA kernels. Requires
// start + size <= points.size() for every column. Handles zero scalars, infinity points, repeated points and
// opposite points. Returns one result per column, in order; an empty column yields infinity. Defined in msm_cuda.cu,
// which is only built with a CUDA toolchain. cuda_available() reports whether a usable device exists at run time.
bool cuda_available();
std::vector<AffinePoint> msm_batch_cuda(std::span<const AffinePoint> points,
                                        std::span<const Column> columns,
                                        const CoreConfig& config = {});

} // namespace bb::gpu_msm
