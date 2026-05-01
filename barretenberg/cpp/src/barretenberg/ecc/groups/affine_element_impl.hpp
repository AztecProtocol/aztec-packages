// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "./element.hpp"
#include "barretenberg/crypto/blake3s/blake3s.hpp"
#include "barretenberg/crypto/keccak/keccak.hpp"

namespace bb::group_elements {
template <class Fq, class Fr, class T>
constexpr affine_element<Fq, Fr, T>::affine_element(const Fq& x, const Fq& y) noexcept
    : x(x)
    , y(y)
{}

template <class Fq, class Fr, class T>
template <typename BaseField, typename CompileTimeEnabled>
constexpr affine_element<Fq, Fr, T> affine_element<Fq, Fr, T>::from_compressed(const uint256_t& compressed) noexcept
{
    uint256_t x_coordinate = compressed;
    x_coordinate.data[3] = x_coordinate.data[3] & (~UINT256_TOP_LIMB_MSB);
    bool y_bit = compressed.get_bit(255);

    // Reject non-canonical encodings: the lower 255 bits encode x. If x_coordinate >= Fq::modulus,
    // Fq(x_coordinate) silently reduces mod p, so two distinct compressed bytestrings differing by
    // a multiple of p would decompress to the same point (encoding malleability).
    if (x_coordinate >= Fq::modulus) {
        return affine_element(Fq::zero(), Fq::zero());
    }

    Fq x = Fq(x_coordinate);
    Fq y2 = (x.sqr() * x + T::b);
    if constexpr (T::has_a) {
        y2 += (x * T::a);
    }
    auto [is_quadratic_remainder, y] = y2.sqrt();
    if (!is_quadratic_remainder) {
        return affine_element(Fq::zero(), Fq::zero());
    }
    if (uint256_t(y).get_bit(0) != y_bit) {
        y = -y;
    }

    return affine_element<Fq, Fr, T>(x, y);
}

template <class Fq, class Fr, class T>
template <typename BaseField, typename CompileTimeEnabled>
constexpr std::array<affine_element<Fq, Fr, T>, 2> affine_element<Fq, Fr, T>::from_compressed_unsafe(
    const uint256_t& compressed) noexcept
{
    // Try x as a recovery candidate: check it is in [0, p), compute y² = x³ + ax + b,
    // and return the point if y exists. Fq(x) reduces silently, so ensuring x is in [0, p) is necessary to prevent
    // returning an incorrect pair (x mod q, y).
    auto try_candidate = [](const uint256_t& x_coordinate) -> affine_element<Fq, Fr, T> {
        if (x_coordinate >= Fq::modulus) {
            return { Fq::zero(), Fq::zero() };
        }
        Fq x = Fq(x_coordinate);
        Fq y2 = ((x.sqr() * x) + T::b);
        if constexpr (T::has_a) {
            y2 += (x * T::a);
        }
        auto [is_qr, y] = y2.sqrt();
        return is_qr ? affine_element<Fq, Fr, T>(x, y) : affine_element<Fq, Fr, T>(Fq::zero(), Fq::zero());
    };

    return { try_candidate(compressed), try_candidate(compressed + Fr::modulus) };
}

template <class Fq, class Fr, class T>
constexpr affine_element<Fq, Fr, T> affine_element<Fq, Fr, T>::operator+(
    const affine_element<Fq, Fr, T>& other) const noexcept
{
    return affine_element(element<Fq, Fr, T>(*this) + element<Fq, Fr, T>(other));
}

template <class Fq, class Fr, class T>
constexpr affine_element<Fq, Fr, T> affine_element<Fq, Fr, T>::operator*(const Fr& exponent) const noexcept
{
    return bb::group_elements::element(*this) * exponent;
}

template <class Fq, class Fr, class T> constexpr affine_element<Fq, Fr, T> affine_element<Fq, Fr, T>::infinity()
{
    affine_element e{};
    e.self_set_infinity();
    return e;
}

template <class Fq, class Fr, class T>
constexpr affine_element<Fq, Fr, T> affine_element<Fq, Fr, T>::set_infinity() const noexcept
{
    affine_element result(*this);
    result.self_set_infinity();
    return result;
}

template <class Fq, class Fr, class T> constexpr void affine_element<Fq, Fr, T>::self_set_infinity() noexcept
{
    if constexpr (Fq::modulus.data[3] >= MODULUS_TOP_LIMB_LARGE_THRESHOLD) {
        // We set the value of x equal to modulus to represent inifinty
        x.data[0] = Fq::modulus.data[0];
        x.data[1] = Fq::modulus.data[1];
        x.data[2] = Fq::modulus.data[2];
        x.data[3] = Fq::modulus.data[3];

        // Clear y for memory hygiene
        y = Fq::zero();
    } else {
        (*this).x = Fq::zero();
        (*this).y = Fq::zero();
        x.self_set_msb();
    }
}

template <class Fq, class Fr, class T> constexpr bool affine_element<Fq, Fr, T>::is_point_at_infinity() const noexcept
{
    if constexpr (Fq::modulus.data[3] >= MODULUS_TOP_LIMB_LARGE_THRESHOLD) {
        // We check if the value of x is equal to modulus to represent inifinty
        return ((x.data[0] ^ Fq::modulus.data[0]) | (x.data[1] ^ Fq::modulus.data[1]) |
                (x.data[2] ^ Fq::modulus.data[2]) | (x.data[3] ^ Fq::modulus.data[3])) == 0;

    } else {
        return (x.is_msb_set());
    }
}

template <class Fq, class Fr, class T> constexpr bool affine_element<Fq, Fr, T>::on_curve() const noexcept
{
    if (is_point_at_infinity()) {
        return true;
    }
    Fq xxx = x.sqr() * x + T::b;
    Fq yy = y.sqr();
    if constexpr (T::has_a) {
        xxx += (x * T::a);
    }
    return (xxx == yy);
}

template <class Fq, class Fr, class T> bool affine_element<Fq, Fr, T>::is_in_prime_subgroup() const noexcept
{
    if (is_point_at_infinity()) {
        return true;
    }
    // Weierstrass group law is unsound for off-curve coordinates, so the [r]·P trick can
    // give a false positive on points that satisfy y² = x³ + b' for some b' ≠ b. Reject
    // those up front.
    if (!on_curve()) {
        return false;
    }
    using Element = element<Fq, Fr, T>;

    // To compute r * P, we convert modulus r to u256 and perform a left-to-right double-and-add.
    constexpr uint256_t r = Fr::modulus;
    const uint64_t r_msb = r.get_msb();

    // Left-to-right double-and-add over the bits of r below the MSB. The MSB itself is consumed by
    // initializing `acc` with `*this`. Loop terminates via unsigned underflow (i wraps past 0).
    Element acc(*this);
    for (uint64_t i = r_msb - 1; i < r_msb; --i) {
        acc.self_dbl();
        if (r.get_bit(i)) {
            acc += *this;
        }
    }
    return acc.is_point_at_infinity();
}

template <class Fq, class Fr, class T>
constexpr bool affine_element<Fq, Fr, T>::operator==(const affine_element& other) const noexcept
{
    bool this_is_infinity = is_point_at_infinity();
    bool other_is_infinity = other.is_point_at_infinity();
    bool both_infinity = this_is_infinity && other_is_infinity;
    bool only_one_is_infinity = this_is_infinity != other_is_infinity;
    return !only_one_is_infinity && (both_infinity || ((x == other.x) && (y == other.y)));
}

template <class Fq, class Fr, class T>
constexpr bool affine_element<Fq, Fr, T>::operator>(const affine_element& other) const noexcept
{
    if (is_point_at_infinity()) {
        return false;
    }
    if (other.is_point_at_infinity()) {
        return true;
    }

    if (x > other.x) {
        return true;
    }
    if (x == other.x && y > other.y) {
        return true;
    }
    return false;
}

template <class Fq, class Fr, class T>
constexpr std::optional<affine_element<Fq, Fr, T>> affine_element<Fq, Fr, T>::derive_from_x_coordinate(
    const Fq& x, bool sign_bit) noexcept
{
    auto yy = x.sqr() * x + T::b;
    if constexpr (T::has_a) {
        yy += (x * T::a);
    }
    auto [found_root, y] = yy.sqrt();

    if (found_root) {
        if (uint256_t(y).get_bit(0) != sign_bit) {
            y = -y;
        }
        return affine_element(x, y);
    }
    return std::nullopt;
}

/**
 * @brief Hash a seed buffer into a point
 *
 * @details ALGORITHM DESCRIPTION:
 *          1. Initialize unsigned integer `attempt_count = 0`
 *          2. Copy seed into a buffer whose size is 2 bytes greater than `seed` (initialized to 0)
 *          3. Interpret `attempt_count` as a byte and write into buffer at [buffer.size() - 2]
 *          4. Compute Blake3s hash of buffer
 *          5. Set the end byte of the buffer to `1`
 *          6. Compute Blake3s hash of buffer
 *          7. Interpret the two hash outputs as the high / low 256 bits of a 512-bit integer (big-endian)
 *          8. Derive x-coordinate of point by reducing the 512-bit integer modulo the curve's field modulus (Fq)
 *          9. Compute y^2 from the curve formula y^2 = x^3 + ax + b (a, b are curve params. for BN254, a = 0, b = 3)
 *          10. IF y^2 IS NOT A QUADRATIC RESIDUE
 *              10a. increment `attempt_count` by 1 and go to step 2
 *          11. IF y^2 IS A QUADRATIC RESIDUE
 *              11a. derive y coordinate via y = sqrt(y)
 *              11b. Interpret most significant bit of 512-bit integer as a 'parity' bit
 *              11c. If parity bit is set AND y's most significant bit is not set, invert y
 *              11d. If parity bit is not set AND y's most significant bit is set, invert y
 *              N.B. last 2 steps are because the sqrt() algorithm can return 2 values,
 *                   we need to a way to canonically distinguish between these 2 values and select a "preferred" one
 *              11e. return (x, y)
 *
 * @note This algorihm is constexpr: we can hash-to-curve (and derive generators) at compile-time!
 * @tparam Fq
 * @tparam Fr
 * @tparam T
 * @param seed Bytes that uniquely define the point being generated
 * @param attempt_count
 * @return constexpr affine_element<Fq, Fr, T>
 */
template <class Fq, class Fr, class T>
affine_element<Fq, Fr, T> affine_element<Fq, Fr, T>::hash_to_curve(const std::vector<uint8_t>& seed,
                                                                   uint8_t attempt_count) noexcept
    requires SupportsHashToCurve<T>
{
    std::vector<uint8_t> target_seed(seed);
    // expand by 2 bytes to cover incremental hash attempts
    const size_t seed_size = seed.size();
    for (size_t i = 0; i < 2; ++i) {
        target_seed.push_back(0);
    }
    target_seed[seed_size] = attempt_count;
    target_seed[seed_size + 1] = 0;
    const auto hash_hi = blake3::blake3s_constexpr(&target_seed[0], target_seed.size());
    target_seed[seed_size + 1] = 1;
    const auto hash_lo = blake3::blake3s_constexpr(&target_seed[0], target_seed.size());
    // custom serialize methods as common/serialize.hpp is not constexpr!
    const auto read_uint256 = [](const uint8_t* in) {
        const auto read_limb = [](const uint8_t* in, uint64_t& out) {
            for (size_t i = 0; i < 8; ++i) {
                out += static_cast<uint64_t>(in[i]) << ((7 - i) * 8);
            }
        };
        uint256_t out = 0;
        read_limb(&in[0], out.data[3]);
        read_limb(&in[8], out.data[2]);
        read_limb(&in[16], out.data[1]);
        read_limb(&in[24], out.data[0]);
        return out;
    };
    // interpret 64 byte hash output as a uint512_t, reduce to Fq element
    //(512 bits of entropy ensures result is not biased as 512 >> Fq::modulus.get_msb())
    Fq x(uint512_t(read_uint256(&hash_lo[0]), read_uint256(&hash_hi[0])));
    bool sign_bit = hash_hi[0] > 127;
    std::optional<affine_element> result = derive_from_x_coordinate(x, sign_bit);
    if (result.has_value()) {
        return result.value();
    }
    return hash_to_curve(seed, attempt_count + 1);
}

template <typename Fq, typename Fr, typename T>
affine_element<Fq, Fr, T> affine_element<Fq, Fr, T>::random_element(numeric::RNG* engine) noexcept
{
    if (engine == nullptr) {
        engine = &numeric::get_randomness();
    }

    Fq x;
    Fq y;
    while (true) {
        // Sample a random x-coordinate and check if it satisfies curve equation.
        x = Fq::random_element(engine);
        // Negate the y-coordinate based on a randomly sampled bit.
        bool sign_bit = (engine->get_random_uint8() & 1) != 0;

        std::optional<affine_element> result = derive_from_x_coordinate(x, sign_bit);

        if (result.has_value()) {
            return result.value();
        }
    }
    throw_or_abort("affine_element::random_element error");
    return affine_element<Fq, Fr, T>(x, y);
}

} // namespace bb::group_elements
