#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <cstddef>
#include <cstdint>

namespace {
template <typename F, size_t N> void check_products(const uint8_t* data, size_t size)
{
    bb::Univariate<F, N> a, b;
    for (size_t i = 0; i < 2 * N; ++i) {
        bb::numeric::uint256_t raw = 0;
        for (size_t byte = 0; byte < 32; ++byte) {
            raw.data[byte / 8] |= static_cast<uint64_t>(data[(i * 32 + byte) % size]) << (8 * (byte % 8));
        }
        raw %= F::modulus + F::modulus;
        (i < N ? a.evaluations[i] : b.evaluations[i - N]) = F{ raw.data[0], raw.data[1], raw.data[2], raw.data[3] };
    }
    auto product = a;
    product *= b;
    auto square = a;
    square.self_sqr();
    auto alias = a;
    alias *= alias;
    auto scaled = a;
    scaled *= b.evaluations[0];
    for (size_t i = 0; i < N; ++i) {
        BB_ASSERT_EQ(product.evaluations[i], a.evaluations[i].montgomery_mul(b.evaluations[i]));
        BB_ASSERT_EQ(square.evaluations[i], a.evaluations[i].montgomery_square());
        BB_ASSERT_EQ(alias.evaluations[i], a.evaluations[i].montgomery_square());
        BB_ASSERT_EQ(scaled.evaluations[i], a.evaluations[i].montgomery_mul(b.evaluations[0]));
    }
}
template <typename F> void dispatch(const uint8_t* data, size_t size)
{
    switch (data[0] % 7) {
    case 0:
        check_products<F, 3>(data, size);
        break;
    case 1:
        check_products<F, 4>(data, size);
        break;
    case 2:
        check_products<F, 5>(data, size);
        break;
    case 3:
        check_products<F, 6>(data, size);
        break;
    case 4:
        check_products<F, 7>(data, size);
        break;
    case 5:
        check_products<F, 8>(data, size);
        break;
    case 6:
        check_products<F, 9>(data, size);
        break;
    }
}
} // namespace
extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    if (size != 0) {
        if (data[0] & 8) {
            dispatch<bb::fr>(data, size);
        } else {
            dispatch<bb::fq>(data, size);
        }
    }
    return 0;
}
