// Standalone sppark BN254 MSM reproducer (spike diagnostic; not part of any cmake
// target). Computes 40454*P0 + 18938*P1 — a combination that returns a wrong result in
// our build — and checks it against the known-good answer (verified independently by
// barretenberg CPU naive/Pippenger and arkworks). No barretenberg dependencies, and the
// TU mirrors upstream's poc/msm-cuda/cuda/pippenger_inf.cu, so it can be compiled with
// any flag/blst combination to bisect which build ingredient flips the result:
//
//   nvcc <FLAGS> -I<sppark> -I<blst>/src -I<blst>/bindings \
//       quad_repro.cu <libblst.a> -o quad_repro && ./quad_repro
#include <cstdio>
#include <cstring>
#include <cuda.h>

#define FEATURE_BN254
#include <ff/alt_bn128.hpp>

#include <ec/jacobian_t.hpp>
#include <ec/xyzz_t.hpp>

typedef jacobian_t<fp_t> point_t;
typedef xyzz_t<fp_t> bucket_t;
typedef bucket_t::affine_inf_t affine_t;
typedef fr_t scalar_t;

#define SPPARK_DONT_INSTANTIATE_TEMPLATES
#include <msm/pippenger.cuh>

#include <util/all_gpus.cpp>

struct Staged {
    uint64_t x[4];
    uint64_t y[4];
    uint32_t inf;
    uint32_t pad;
};
static_assert(sizeof(Staged) == 72, "ark-style affine record");

// Host-only projective comparison (X == ex*Z^2, Y == ey*Z^3). Preprocessor-guarded:
// nvcc's device pass parses this TU with the device fp_t, which lacks host operators.
static bool jacobian_equals_affine(const uint64_t raw[12], const uint64_t expected_x[4], const uint64_t expected_y[4])
{
#ifdef __CUDA_ARCH__
    (void)raw;
    (void)expected_x;
    (void)expected_y;
    return false;
#else
    fp_t X, Y, Z, ex, ey;
    std::memcpy(&X, &raw[0], 32);
    std::memcpy(&Y, &raw[4], 32);
    std::memcpy(&Z, &raw[8], 32);
    std::memcpy(&ex, expected_x, 32);
    std::memcpy(&ey, expected_y, 32);
    if (Z.is_zero()) {
        return false;
    }
    fp_t zz = Z * Z;
    fp_t zzz = zz * Z;
    return (X == ex * zz) && (Y == ey * zzz);
#endif
}

int main()
{
    // All field values are BN254 Fq/Fr Montgomery-form (R = 2^256) little-endian limbs.
    const Staged points[2] = {
        { { 0x8e84116c0ba4643cUL, 0x7c5c34ed27b87bf2UL, 0xf75d4f096108887cUL, 0x01575ba8abf0f246UL },
          { 0xf86a3de0dc1a541eUL, 0xddfd22c5734757b4UL, 0x755014582d70ec12UL, 0x26361ea028f5a844UL },
          0,
          0 },
        { { 0x658d9b264a76a942UL, 0x23a3f911916a2356UL, 0x958e51309e28b33aUL, 0x355994a7c1a62cc4UL },
          { 0x1ecb10d82510fe2bUL, 0x7ffe5942e86a3b03UL, 0xa31aa38f9ccd48d9UL, 0x1f6b1202b0975b20UL },
          0,
          0 },
    };
    const uint64_t scalars[2][4] = { { 0x9e06, 0, 0, 0 }, { 0x49fa, 0, 0, 0 } }; // canonical

    const uint64_t expected_x[4] = { 0x46f783f74e5e38d8UL, 0x2ec420654339d892UL, 0x2b5969f65d7a9b89UL,
                                     0x222f9d190f114213UL };
    const uint64_t expected_y[4] = { 0x9ee743ec9992f97aUL, 0x3288a73c40d7bfa7UL, 0xe04351318fa0e6adUL,
                                     0x2d74ab000f5a4acfUL };

    int fails = 0;
    for (int rep = 0; rep < 5; rep++) {
        point_t out;
        RustError err = mult_pippenger<bucket_t>(&out,
                                                 reinterpret_cast<const affine_t*>(points),
                                                 2,
                                                 reinterpret_cast<const scalar_t*>(scalars),
                                                 /*mont=*/false,
                                                 sizeof(Staged));
        if (err.code != 0) {
            std::printf("rep%d GPU error %d\n", rep, err.code);
            return 2;
        }
        uint64_t raw[12];
        std::memcpy(raw, &out, sizeof(raw));
        bool ok = jacobian_equals_affine(raw, expected_x, expected_y);
        std::printf("rep%d %s\n", rep, ok ? "ok" : "MISMATCH");
        fails += ok ? 0 : 1;
    }
    return fails == 0 ? 0 : 1;
}
