#include "barretenberg/ecc/fields/ifma_field.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>

#ifdef BB_FIELD_IFMA
namespace {
template <typename F, size_t N> void check_products(const uint8_t* data, size_t size)
{
    using bb::numeric::uint256_t;
    std::array<F, N> a, b;
    std::array<uint64_t, 4 * N> packed_a, packed_b;
    for (size_t i = 0; i < 2 * N; ++i) {
        uint256_t raw = 0;
        for (size_t byte = 0; byte < 32; ++byte) {
            raw.data[byte / 8] |= static_cast<uint64_t>(data[(i * 32 + byte) % size]) << (8 * (byte % 8));
        }
        raw %= F::modulus + F::modulus;
        const F value{ raw.data[0], raw.data[1], raw.data[2], raw.data[3] };
        (i < N ? a[i] : b[i - N]) = value;
        std::copy_n(value.data, 4, (i < N ? packed_a.data() + 4 * i : packed_b.data() + 4 * (i - N)));
    }
    const auto original = packed_a;
    auto check = [&](const auto& expected) {
        for (size_t i = 0; i < N; ++i) {
            const auto* l = packed_a.data() + 4 * i;
            const F got{ l[0], l[1], l[2], l[3] };
            BB_ASSERT_EQ(got, expected(i));
            BB_ASSERT_LT(uint256_t(l[0], l[1], l[2], l[3]), F::modulus + F::modulus);
        }
    };
    bb::field_ifma::mul_assign_n<typename F::Params, N>(packed_a.data(), packed_b.data());
    check([&](size_t i) { return a[i].montgomery_mul(b[i]); });
    packed_a = original;
    bb::field_ifma::sqr_assign_n<typename F::Params, N>(packed_a.data());
    check([&](size_t i) { return a[i].montgomery_square(); });
    packed_a = original;
    bb::field_ifma::mul_assign_n<typename F::Params, N>(packed_a.data(), packed_a.data());
    check([&](size_t i) { return a[i].montgomery_square(); });
    packed_a = original;
    bb::field_ifma::mul_assign_scalar_n<typename F::Params, N>(packed_a.data(), packed_b.data());
    check([&](size_t i) { return a[i].montgomery_mul(b[0]); });
}
template <typename F> void dispatch(const uint8_t* data, size_t size)
{
    switch (data[0] % 8) {
    case 0:
        check_products<F, 1>(data, size);
        break;
    case 1:
        check_products<F, 2>(data, size);
        break;
    case 2:
        check_products<F, 3>(data, size);
        break;
    case 3:
        check_products<F, 4>(data, size);
        break;
    case 4:
        check_products<F, 5>(data, size);
        break;
    case 5:
        check_products<F, 6>(data, size);
        break;
    case 6:
        check_products<F, 7>(data, size);
        break;
    case 7:
        check_products<F, 8>(data, size);
        break;
    }
}
} // namespace
#endif
extern "C" int LLVMFuzzerInitialize(int*, char***)
{
#ifdef BB_FIELD_IFMA
    if (bb::field_ifma::available()) {
        return 0;
    }
#endif
    throw_or_abort("IFMA field fuzzing requires an enabled IFMA build and an IFMA-capable CPU and OS");
}
extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
#ifdef BB_FIELD_IFMA
    if (size != 0) {
        if (data[0] & 8) {
            dispatch<bb::fr>(data, size);
        } else {
            dispatch<bb::fq>(data, size);
        }
    }
#else
    (void)data;
    (void)size;
#endif
    return 0;
}
