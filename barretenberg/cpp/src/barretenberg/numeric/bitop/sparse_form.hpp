// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke], commit: dd03c4a23ab067274b4964cacb36d1545f73fb14}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <array>
#include <cstddef>
#include <cstdint>
#include <vector>

#include "../uint256/uint256.hpp"

namespace bb::numeric {

/**
 * @brief Decompose a uint256_t into digits in the given base (least-significant digit first).
 * If num_slices > 0, returns exactly that many digits. If num_slices == 0, returns as many as needed.
 */
inline std::vector<uint64_t> slice_input(const uint256_t& input, const uint64_t base, const size_t num_slices)
{
    BB_ASSERT(base > 0);
    uint256_t target = input;
    std::vector<uint64_t> slices;
    if (num_slices > 0) {
        slices.reserve(num_slices);
        for (size_t i = 0; i < num_slices; ++i) {
            slices.push_back((target % base).data[0]);
            target /= base;
        }
    } else {
        while (target > 0) {
            slices.push_back((target % base).data[0]);
            target /= base;
        }
    }
    return slices;
}

/**
 * @brief Decompose a uint256_t using a different base for each digit position (least-significant first).
 * Throws if the input is too large to be fully represented by the given bases.
 */
inline std::vector<uint64_t> slice_input_using_variable_bases(const uint256_t& input,
                                                              const std::vector<uint64_t>& bases)
{
    uint256_t target = input;
    std::vector<uint64_t> slices;
    slices.reserve(bases.size());
    for (size_t i = 0; i < bases.size(); ++i) {
        BB_ASSERT(bases[i] > 0);
        if (target >= bases[i] && i == bases.size() - 1) {
            throw_or_abort(format("Last key slice greater than ", bases[i]));
        }
        slices.push_back((target % bases[i]).data[0]);
        target /= bases[i];
    }
    return slices;
}

/**
 * @brief Compute [1, base, base^2, ..., base^(num_slices-1)] as uint256_t values.
 */
template <uint64_t base, uint64_t num_slices> constexpr std::array<uint256_t, num_slices> get_base_powers()
{
    std::array<uint256_t, num_slices> output{};
    output[0] = 1;
    for (size_t i = 1; i < num_slices; ++i) {
        output[i] = output[i - 1] * base;
    }
    return output;
}

/**
 * @brief Encode a 32-bit value into sparse form: each binary bit of input becomes a digit in the given base.
 * E.g. with base=3, binary 0b101 becomes 1*3^2 + 0*3^1 + 1*3^0 = 10.
 * Used by plookup tables (SHA256, Keccak, AES, Blake2s) to encode XOR/AND via lookup-friendly representations.
 */
template <uint64_t base> constexpr uint256_t map_into_sparse_form(const uint64_t input)
{
    uint256_t out = 0UL;
    auto converted = input;

    constexpr auto base_powers = get_base_powers<base, 32>();
    for (size_t i = 0; i < 32; ++i) {
        uint64_t sparse_bit = ((converted >> i) & 1U);
        if (sparse_bit) {
            out += base_powers[i];
        }
    }
    return out;
}

/**
 * @brief Decode a sparse-form uint256_t back to a 32-bit value.
 * Extracts the base-adic digits from most-significant to least-significant, and recovers the original
 * binary value by reading the low bit of each digit.
 */
template <uint64_t base> constexpr uint64_t map_from_sparse_form(const uint256_t& input)
{
    uint256_t target = input;
    uint64_t output = 0;

    constexpr auto bases = get_base_powers<base, 32>();

    for (uint64_t i = 0; i < 32; ++i) {
        const auto& base_power = bases[static_cast<size_t>(31 - i)];
        uint256_t prev_threshold = 0;
        for (uint64_t j = 1; j < base + 1; ++j) {
            const auto threshold = prev_threshold + base_power;
            if (target < threshold) {
                bool bit = ((j - 1) & 1);
                if (bit) {
                    output += (1ULL << (31ULL - i));
                }
                if (j > 1) {
                    target -= (prev_threshold);
                }
                break;
            }
            prev_threshold = threshold;
        }
    }

    return output;
}

/**
 * @brief Integer type that stores each bit as a separate digit in the given base.
 * Supports addition with single-pass carry propagation. Used to build plookup tables
 * for bitwise operations (XOR, AND) where two sparse_ints are added and the resulting
 * per-digit values encode the operation's truth table.
 */
template <uint64_t base, size_t num_bits> class sparse_int {
  public:
    sparse_int(const uint64_t input = 0)
        : value(input)
    {
        for (size_t i = 0; i < num_bits; ++i) {
            const uint64_t bit = (input >> i) & 1U;
            limbs[i] = bit;
        }
    }
    sparse_int(const sparse_int& other) noexcept = default;
    sparse_int(sparse_int&& other) noexcept = default;
    sparse_int& operator=(const sparse_int& other) noexcept = default;
    sparse_int& operator=(sparse_int&& other) noexcept = default;
    ~sparse_int() noexcept = default;

    // Single-pass carry propagation: correct when all input limbs are < base, which is guaranteed
    // by the constructor (limbs are 0 or 1) and maintained by this operator (carry produces values < base).
    sparse_int operator+(const sparse_int& other) const
    {
        sparse_int result(*this);
        for (size_t i = 0; i < num_bits - 1; ++i) {
            result.limbs[i] += other.limbs[i];
            if (result.limbs[i] >= base) {
                result.limbs[i] -= base;
                ++result.limbs[i + 1];
                // After carry: result.limbs[i] < base (since both inputs were < base, sum < 2*base,
                // so subtracting base gives a value < base). The carry of 1 into limbs[i+1] cannot
                // cascade because limbs[i+1] hasn't been added to other.limbs[i+1] yet.
            }
        }
        result.limbs[num_bits - 1] += other.limbs[num_bits - 1];
        result.limbs[num_bits - 1] %= base;
        result.value += other.value;
        return result;
    };

    sparse_int operator+=(const sparse_int& other)
    {
        *this = *this + other;
        return *this;
    }

    [[nodiscard]] uint64_t get_value() const { return value; }

    [[nodiscard]] uint64_t get_sparse_value() const
    {
        uint64_t result = 0;
        for (size_t i = num_bits - 1; i < num_bits; --i) {
            result *= base;
            result += limbs[i];
        }
        return result;
    }

    const std::array<uint64_t, num_bits>& get_limbs() const { return limbs; }

  private:
    std::array<uint64_t, num_bits> limbs;
    uint64_t value;
};

} // namespace bb::numeric
