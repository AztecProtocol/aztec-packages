#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication_fast.hpp"
#include <array>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace {
template <typename Curve> void check_msm(const uint8_t* data, size_t size)
{
    using F = typename Curve::ScalarField;
    using Affine = typename Curve::AffineElement;
    using Element = typename Curve::Element;
    static constexpr std::array<size_t, 14> sizes{ 0, 1, 23, 24, 25, 63, 64, 65, 255, 256, 257, 1023, 1024, 1025 };
    static const auto points = [] {
        std::vector<Affine> result;
        for (size_t i = 0; i < sizes.back(); ++i) {
            result.push_back(
                Affine::hash_to_curve({ 0x53, 0x4d, static_cast<uint8_t>(i), static_cast<uint8_t>(i >> 8) }));
        }
        return result;
    }();
    const size_t n = sizes[data[1] % sizes.size()];
    std::vector<F> scalars(n);
    Element expected;
    expected.self_set_infinity();
    for (size_t i = 0; i < n; ++i) {
        bb::numeric::uint256_t raw = 0;
        for (size_t byte = 0; byte < 32; ++byte) {
            raw.data[byte / 8] |= static_cast<uint64_t>(data[2 + (i * 32 + byte) % (size - 2)]) << (8 * (byte % 8));
        }
        if (data[0] & 2) {
            raw &= 3;
        }
        scalars[i] = F(raw);
        expected += points[i] * scalars[i];
    }
    const auto actual = bb::scalar_multiplication::pippenger_round_parallel<Curve>(
        bb::PolynomialSpan<const F>{ 0, scalars }, std::span<const Affine>{ points.data(), n }, 0, {}, {}, 1);
    BB_ASSERT_EQ(Affine(actual), Affine(expected));
}
} // namespace

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    if (size < 3) {
        return 0;
    }
    if (data[0] & 1) {
        check_msm<bb::curve::BN254>(data, size);
    } else {
        check_msm<bb::curve::Grumpkin>(data, size);
    }
    return 0;
}
