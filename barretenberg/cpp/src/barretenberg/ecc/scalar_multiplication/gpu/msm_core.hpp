#pragma once
// Frozen interface of the GPU MSM core: plain data only, no barretenberg types, so that the same
// kernel source can be compiled for the CPU emulation path and for CUDA. The prover-facing adapter
// lives elsewhere and converts barretenberg types to and from these.
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

// Point in affine coordinates, canonical field elements. `infinity` set means the point at infinity
// and x, y are ignored.
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
    uint32_t window_bits = 0;           // 0 selects automatically
    uint32_t emulated_block_size = 128; // threads per emulated block
    // CUDA only. Windows are independent, so several can run at once. 0 sizes the group of concurrent windows from
    // window_memory_bytes; a non-zero value forces that group size (1 reproduces one window at a time).
    uint32_t window_group = 0;
    uint64_t window_memory_bytes = 4ULL << 30; // device memory one group of windows may use when window_group == 0
    // Column groups whose host preparation overlaps the previous group's device work: 0 picks the count from the
    // batch size, 1 turns the overlap off, n forces n groups (capped at the column count).
    uint32_t host_pipeline = 0;
    // CUDA only. Merge the points of identical wide scalars within a column before bucketing, so a value repeated
    // many times is accumulated once instead of once per window.
    bool dedup_scalars = true;
};

// Batched MSM over the curve selected by `config.curve`, executed by the CPU emulation of the device kernels. Requires
// start + size <= points.size() for every column. Must handle zero scalars, infinity points, repeated
// points and opposite points. Returns one result per column, in order; an empty column yields infinity.
std::vector<AffinePoint> msm_batch_emul(std::span<const AffinePoint> points,
                                        std::span<const Column> columns,
                                        const CoreConfig& config = {});

// The same batched MSM executed by the CUDA kernels. Defined in msm_cuda.cu, which is only built with a
// CUDA toolchain. cuda_available() reports whether a usable device exists at run time.
bool cuda_available();
std::vector<AffinePoint> msm_batch_cuda(std::span<const AffinePoint> points,
                                        std::span<const Column> columns,
                                        const CoreConfig& config = {});

} // namespace bb::gpu_msm
