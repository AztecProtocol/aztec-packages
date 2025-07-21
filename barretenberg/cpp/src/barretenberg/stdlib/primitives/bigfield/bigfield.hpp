// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "../byte_array/byte_array.hpp"
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../field/field.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/numeric/uintx/uintx.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"

namespace bb::stdlib {

template <typename Builder, typename T> class bigfield {

  public:
    using View = bigfield;
    using CoefficientAccumulator = bigfield;
    using TParams = T;
    using native = bb::field<T>;
    using field_ct = field_t<Builder>;

    // Number of bb::fr field elements used to represent a bigfield element in the public inputs
    static constexpr size_t PUBLIC_INPUTS_SIZE = 4;

    struct Basis {
        uint512_t modulus;
        size_t num_bits;
    };

    /**
     * @brief Represents a single limb of a bigfield element, with its value and maximum value.

     * @details The default maximum value of a new limb is set to 2^L - 1.
     *
     */
    struct Limb {
        Limb() = default;
        Limb(const field_t<Builder>& input, const uint256_t& max = DEFAULT_MAXIMUM_LIMB)
            : element(input)
        {
            if (input.is_constant()) {
                maximum_value = uint256_t(input.additive_constant);
                BB_ASSERT_LTE(maximum_value, max);
            } else {
                maximum_value = max;
            }
        }
        friend std::ostream& operator<<(std::ostream& os, const Limb& a)
        {
            os << "{ " << a.element << " < " << a.maximum_value << " }";
            return os;
        }
        Limb(const Limb& other) = default;
        Limb(Limb&& other) noexcept = default;
        Limb& operator=(const Limb& other) = default;
        Limb& operator=(Limb&& other) noexcept = default;
        ~Limb() = default;

        field_t<Builder> element;
        uint256_t maximum_value;
    };

    // Number of limbs used to represent a bigfield element in the binary basis
    static constexpr size_t NUM_LIMBS = 4;

    Builder* context;

    /**
     * @brief Represents a bigfield element in the binary basis. A bigfield element is represented as a combination of 4
     * binary basis limbs: a = a[0] + a[1] * 2^L + a[2] * 2^2L + a[3] * 2^3L.
     */
    mutable std::array<Limb, NUM_LIMBS> binary_basis_limbs;

    /**
     * @brief Represents a bigfield element in the prime basis: (a mod n) where n is the native modulus.
     */
    mutable field_t<Builder> prime_basis_limb;

    /**
     * @brief Constructs a new bigfield object from two field elements representing the low and high bits.
     *
     * @param low_bits The field element representing the low 2L bits of the bigfield.
     * @param high_bits The field element representing the high 2L bits of the bigfield.
     * @param can_overflow Whether the bigfield can overflow the modulus.
     * @param maximum_bitlength The maximum bitlength of the bigfield. If 0, it defaults to |p| (target modulus
     * bitlength).
     */
    bigfield(const field_t<Builder>& low_bits,
             const field_t<Builder>& high_bits,
             const bool can_overflow = false,
             const size_t maximum_bitlength = 0);

    /**
     * @brief Constructs a zero bigfield object: all limbs are set to zero.
     *
     * @details This constructor is used to create a bigfield element without any context. It is useful for creating
     * bigfield elements that will be later assigned to a context.
     */
    bigfield(Builder* parent_context = nullptr);

    /**
     * @brief Constructs a new bigfield object from a uint256_t value.
     *
     * @param parent_context The circuit context in which the bigfield element will be created.
     * @param value The uint256_t value to be converted to a bigfield element.
     */
    bigfield(Builder* parent_context, const uint256_t& value);

    explicit bigfield(const uint256_t& value)
        : bigfield(nullptr, uint256_t(value))
    {}

    /**
     * @brief Constructs a new bigfield object from an int value. We first need to to construct a field element from the
     * value to avoid bugs that have to do with the value being negative.
     *
     */
    bigfield(const int value)
        : bigfield(nullptr, uint256_t(native(value)))
    {}

    // NOLINTNEXTLINE(google-runtime-int) intended behavior
    bigfield(const unsigned long value)
        : bigfield(nullptr, value)
    {}

    // NOLINTNEXTLINE(google-runtime-int) intended behavior
    bigfield(const unsigned long long value)
        : bigfield(nullptr, value)
    {}

    /**
     * @brief Construct a new bigfield object from bb::fq. We first convert to uint256_t as field elements are in
     * Montgomery form internally.
     *
     * @param value
     */
    bigfield(const native value)
        : bigfield(nullptr, uint256_t(value))
    {}

    /**
     * @brief Construct a bigfield element from binary limbs that are already reduced
     *
     * @details This API should only be used by bigfield and other stdlib members for efficiency and with extreme care.
     * We need it in cases where we precompute and reduce the elements, for example, and then put them in a table
     *
     */
    static bigfield unsafe_construct_from_limbs(const field_t<Builder>& a,
                                                const field_t<Builder>& b,
                                                const field_t<Builder>& c,
                                                const field_t<Builder>& d,
                                                const bool can_overflow = false)
    {
        BB_ASSERT_EQ(a.is_constant(), b.is_constant());
        BB_ASSERT_EQ(b.is_constant(), c.is_constant());
        BB_ASSERT_EQ(c.is_constant(), d.is_constant());
        bigfield result;
        result.context = a.context;
        result.binary_basis_limbs[0] = Limb(field_t(a));
        result.binary_basis_limbs[1] = Limb(field_t(b));
        result.binary_basis_limbs[2] = Limb(field_t(c));
        result.binary_basis_limbs[3] =
            Limb(field_t(d), can_overflow ? DEFAULT_MAXIMUM_LIMB : DEFAULT_MAXIMUM_MOST_SIGNIFICANT_LIMB);
        result.prime_basis_limb = (result.binary_basis_limbs[3].element * shift_3)
                                      .add_two(result.binary_basis_limbs[2].element * shift_2,
                                               result.binary_basis_limbs[1].element * shift_1);
        result.prime_basis_limb += (result.binary_basis_limbs[0].element);
        return result;
    };

    /**
     * @brief Construct a bigfield element from binary limbs that are already reduced and ensure they are range
     * constrained
     *
     */
    static bigfield construct_from_limbs(const field_t<Builder>& a,
                                         const field_t<Builder>& b,
                                         const field_t<Builder>& c,
                                         const field_t<Builder>& d,
                                         const bool can_overflow = false)
    {
        BB_ASSERT_EQ(a.is_constant(), b.is_constant());
        BB_ASSERT_EQ(b.is_constant(), c.is_constant());
        BB_ASSERT_EQ(c.is_constant(), d.is_constant());
        bigfield result;
        auto ctx = a.context;
        result.context = a.context;
        result.binary_basis_limbs[0] = Limb(field_t(a));
        result.binary_basis_limbs[1] = Limb(field_t(b));
        result.binary_basis_limbs[2] = Limb(field_t(c));
        result.binary_basis_limbs[3] =
            Limb(field_t(d), can_overflow ? DEFAULT_MAXIMUM_LIMB : DEFAULT_MAXIMUM_MOST_SIGNIFICANT_LIMB);
        result.prime_basis_limb = (result.binary_basis_limbs[3].element * shift_3)
                                      .add_two(result.binary_basis_limbs[2].element * shift_2,
                                               result.binary_basis_limbs[1].element * shift_1);
        result.prime_basis_limb += (result.binary_basis_limbs[0].element);

        // Range contrain the first two limbs each to NUM_LIMB_BITS
        ctx->range_constrain_two_limbs(result.binary_basis_limbs[0].element.get_normalized_witness_index(),
                                       result.binary_basis_limbs[1].element.get_normalized_witness_index(),
                                       static_cast<size_t>(NUM_LIMB_BITS),
                                       static_cast<size_t>(NUM_LIMB_BITS));

        // Range constrain the last two limbs to NUM_LIMB_BITS and NUM_LAST_LIMB_BITS
        const size_t num_last_limb_bits = (can_overflow) ? NUM_LIMB_BITS : NUM_LAST_LIMB_BITS;
        ctx->range_constrain_two_limbs(result.binary_basis_limbs[2].element.get_normalized_witness_index(),
                                       result.binary_basis_limbs[3].element.get_normalized_witness_index(),
                                       static_cast<size_t>(NUM_LIMB_BITS),
                                       static_cast<size_t>(num_last_limb_bits));

        return result;
    };

    /**
     * @brief Construct a bigfield element from binary limbs and a prime basis limb that are already reduced
     *
     * @details This API should only be used by bigfield and other stdlib members for efficiency and with extreme care.
     * We need it in cases where we precompute and reduce the elements, for example, and then put them in a table
     *
     */
    static bigfield unsafe_construct_from_limbs(const field_t<Builder>& a,
                                                const field_t<Builder>& b,
                                                const field_t<Builder>& c,
                                                const field_t<Builder>& d,
                                                const field_t<Builder>& prime_limb,
                                                const bool can_overflow = false)
    {
        BB_ASSERT_EQ(a.is_constant(), b.is_constant());
        BB_ASSERT_EQ(b.is_constant(), c.is_constant());
        BB_ASSERT_EQ(c.is_constant(), d.is_constant());
        BB_ASSERT_EQ(d.is_constant(), prime_limb.is_constant());
        bigfield result;
        result.context = a.context;
        result.binary_basis_limbs[0] = Limb(field_t(a));
        result.binary_basis_limbs[1] = Limb(field_t(b));
        result.binary_basis_limbs[2] = Limb(field_t(c));
        result.binary_basis_limbs[3] =
            Limb(field_t(d), can_overflow ? DEFAULT_MAXIMUM_LIMB : DEFAULT_MAXIMUM_MOST_SIGNIFICANT_LIMB);
        result.prime_basis_limb = prime_limb;
        return result;
    };

    /**
     * @brief Constructs a bigfield element from a 256-bit byte array.
     *
     * This constructor interprets the input byte array as a 256-bit little-endian integer,
     * and decomposes it into 4 limbs as follows:
     *
     * - Limb 0: 68 bits — bytes b24 to b31 and the high 4 bits of b23
     * - Limb 1: 68 bits — bytes b14 to b22, and the low 4 bits of b23
     * - Limb 2: 68 bits — bytes b7 to b14 and the high 4 bits of b6
     * - Limb 3: 52 bits — bytes b0 to b5 and the low 4 bits of b6
     *
     * @param bytes The 32-byte input representing the 256-bit integer (little-endian).
     */
    bigfield(const byte_array<Builder>& bytes);

    // Copy constructor
    bigfield(const bigfield& other);

    // Move constructor
    bigfield(bigfield&& other) noexcept;

    // Destructor
    ~bigfield() = default;

    /**
     * @brief Creates a bigfield element from a uint512_t.
     * Bigfield element is constructed as a witness and not a circuit constant
     *
     * @param ctx
     * @param value
     * @param can_overflow Can the input value have more than log2(modulus) bits?
     * @param maximum_bitlength Provide the explicit maximum bitlength if known. Otherwise bigfield max value will be
     * either log2(modulus) bits iff can_overflow = false, or (4 * NUM_LIMB_BITS) iff can_overflow = true
     * @return bigfield<Builder, T>
     *
     * @details This method is 1 gate more efficient than constructing from 2 field_ct elements.
     */
    static bigfield create_from_u512_as_witness(Builder* ctx,
                                                const uint512_t& value,
                                                const bool can_overflow = false,
                                                const size_t maximum_bitlength = 0);

    static bigfield from_witness(Builder* ctx, const bb::field<T>& input)
    {
        uint256_t input_u256(input);
        field_t<Builder> low(witness_t<Builder>(ctx, bb::fr(input_u256.slice(0, NUM_LIMB_BITS * 2))));
        field_t<Builder> hi(witness_t<Builder>(ctx, bb::fr(input_u256.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 4))));
        auto result = bigfield(low, hi);
        result.set_free_witness_tag();
        return result;
    }

    bigfield& operator=(const bigfield& other);
    bigfield& operator=(bigfield&& other) noexcept;

    // Code assumes modulus is at most 256 bits so good to define it via a uint256_t
    static constexpr uint256_t modulus = (uint256_t(T::modulus_0, T::modulus_1, T::modulus_2, T::modulus_3));
    static constexpr uint512_t modulus_u512 = static_cast<uint512_t>(modulus);
    static constexpr uint64_t NUM_LIMB_BITS = NUM_LIMB_BITS_IN_FIELD_SIMULATION;
    static constexpr uint64_t NUM_LAST_LIMB_BITS = modulus_u512.get_msb() + 1 - (NUM_LIMB_BITS * 3);

    // The quotient reduction checks currently only support >=250 bit moduli and moduli >256 have never been tested
    // (Check zkSecurity audit report issue #12 for explanation)
    static_assert(modulus_u512.get_msb() + 1 >= 250 && modulus_u512.get_msb() + 1 <= 256);

    inline static const uint1024_t DEFAULT_MAXIMUM_REMAINDER =
        (uint1024_t(1) << (NUM_LIMB_BITS * 3 + NUM_LAST_LIMB_BITS)) - uint1024_t(1);
    static constexpr uint256_t DEFAULT_MAXIMUM_LIMB = (uint256_t(1) << NUM_LIMB_BITS) - uint256_t(1);
    static constexpr uint256_t DEFAULT_MAXIMUM_MOST_SIGNIFICANT_LIMB =
        (uint256_t(1) << NUM_LAST_LIMB_BITS) - uint256_t(1);
    static constexpr uint64_t LOG2_BINARY_MODULUS = NUM_LIMB_BITS * NUM_LIMBS;
    static constexpr bool is_composite = true; // false only when fr is native

    // This limits the size of all vectors that are being used to 16 (we don't really need more)
    static constexpr size_t MAXIMUM_SUMMAND_COUNT_LOG = 4;
    static constexpr size_t MAXIMUM_SUMMAND_COUNT = 1 << MAXIMUM_SUMMAND_COUNT_LOG;

    static constexpr uint256_t prime_basis_maximum_limb =
        modulus_u512.slice(NUM_LIMB_BITS * (NUM_LIMBS - 1), NUM_LIMB_BITS* NUM_LIMBS).lo;
    static constexpr Basis prime_basis{ uint512_t(bb::fr::modulus), bb::fr::modulus.get_msb() + 1 };
    static constexpr Basis binary_basis{ uint512_t(1) << LOG2_BINARY_MODULUS, LOG2_BINARY_MODULUS };
    static constexpr Basis target_basis{ modulus_u512, static_cast<size_t>(modulus_u512.get_msb() + 1) };
    static constexpr bb::fr shift_1 = bb::fr(uint256_t(1) << NUM_LIMB_BITS);
    static constexpr bb::fr shift_2 = bb::fr(uint256_t(1) << (NUM_LIMB_BITS * 2));
    static constexpr bb::fr shift_3 = bb::fr(uint256_t(1) << (NUM_LIMB_BITS * 3));
    static constexpr bb::fr shift_right_1 = bb::fr(1) / shift_1;
    static constexpr bb::fr shift_right_2 = bb::fr(1) / shift_2;
    static constexpr bb::fr negative_prime_modulus_mod_binary_basis = -bb::fr(uint256_t(modulus_u512));
    static constexpr uint512_t negative_prime_modulus = binary_basis.modulus - target_basis.modulus;
    static constexpr std::array<uint256_t, NUM_LIMBS> neg_modulus_limbs_u256{
        negative_prime_modulus.slice(0, NUM_LIMB_BITS).lo,
        negative_prime_modulus.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2).lo,
        negative_prime_modulus.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3).lo,
        negative_prime_modulus.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4).lo,
    };
    static constexpr std::array<bb::fr, NUM_LIMBS> neg_modulus_limbs{
        bb::fr(negative_prime_modulus.slice(0, NUM_LIMB_BITS).lo),
        bb::fr(negative_prime_modulus.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2).lo),
        bb::fr(negative_prime_modulus.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3).lo),
        bb::fr(negative_prime_modulus.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4).lo),
    };

    /**
     * @brief Convert the bigfield element to a byte array. Concatenates byte arrays of the high (2L bits) and low (2L
     * bits) parts of the bigfield element.
     *
     * @details Assumes that 2L is divisible by 8, i.e. (NUM_LIMB_BITS * 2) % 8 == 0. Also we check that the bigfield
     * element is in the target field.
     *
     * @return byte_array<Builder>
     */
    byte_array<Builder> to_byte_array() const
    {
        byte_array<Builder> result(get_context());
        // Prevents aliases
        assert_is_in_field();
        field_t<Builder> lo = binary_basis_limbs[0].element + (binary_basis_limbs[1].element * shift_1);
        field_t<Builder> hi = binary_basis_limbs[2].element + (binary_basis_limbs[3].element * shift_1);
        // n.b. this only works if NUM_LIMB_BITS * 2 is divisible by 8
        //
        // We are packing two bigfield limbs each into the field elements `lo` and `hi`.
        // Thus, each of `lo` and `hi` will contain (NUM_LIMB_BITS * 2) bits. We then convert
        // `lo` and `hi` to `byte_array` each containing ((NUM_LIMB_BITS * 2) / 8) bytes.
        // Therefore, it is necessary for (NUM_LIMB_BITS * 2) to be divisible by 8 for correctly
        // converting `lo` and `hi` to `byte_array`s.
        BB_ASSERT_EQ((NUM_LIMB_BITS * 2 / 8) * 8, NUM_LIMB_BITS * 2);
        result.write(byte_array<Builder>(hi, 32 - (NUM_LIMB_BITS / 4)));
        result.write(byte_array<Builder>(lo, (NUM_LIMB_BITS / 4)));
        return result;
    }

    // Gets the integer (uint512_t) value of the bigfield element by combining the binary basis limbs.
    uint512_t get_value() const;

    // Gets the maximum value of the bigfield element by combining the maximum values of the binary basis limbs.
    uint512_t get_maximum_value() const;

    /**
     * @brief Add a field element to the lower limb. CAUTION (the element has to be constrained before using this
     * function)
     *
     * @details Sometimes we need to add a small constrained value to a bigfield element (for example, a boolean value),
     * but we don't want to construct a full bigfield element for that as it would take too many gates. If the maximum
     * value of the field element being added is small enough, we can simply add it to the lowest limb and increase its
     * maximum value. That will create 2 additional constraints instead of 5/3 needed to add 2 bigfield elements and
     * several needed to construct a bigfield element.
     *
     * @tparam Builder Builder
     * @tparam T Field Parameters
     * @param other Field element that will be added to the lower
     * @param other_maximum_value The maximum value of other
     * @return bigfield<Builder, T> Result
     */
    bigfield add_to_lower_limb(const field_t<Builder>& other, const uint256_t& other_maximum_value) const;

    /**
     * @brief Adds two bigfield elements. Inputs are reduced to the modulus if necessary. Requires 4 gates if both
     * elements are witnesses.
     *
     * @details Naive addition of two bigfield elements would require 5 gates: 4 gates to add the binary basis limbs and
     * 1 gate to add the prime basis limbs. However, if both elements are witnesses, we can use an optimised addition
     * trick that uses 4 gates instead of 5. In this case, we add the prime basis limbs and one of the binary basis
     * limbs in a single gate.
     *
     * @tparam Builder
     * @tparam T
     * @param other
     * @return bigfield<Builder, T>
     */
    bigfield operator+(const bigfield& other) const;

    /**
     * @brief Create constraints for summing three bigfield elements efficiently
     *
     * @tparam Builder
     * @tparam T
     * @param add_a
     * @param add_b
     * @return The sum of three terms
     *
     * @details Uses five gates (one for each limb) to add three bigfield elements.
     */
    bigfield add_two(const bigfield& add_a, const bigfield& add_b) const;

    /**
     * @brief Subtraction operator.
     *
     * @param other
     * @return bigfield
     *
     * @details Uses lazy reduction techniques (similar to operator+) to save on field reductions. Instead of computing
     * `*this - other`, we compute a constant `X = s * p` and compute: `*this + X - other` to ensure we do not
     * underflow. Note that NOT enough to ensure that the integer value of `*this + X - other` does not underflow. We
     * must ALSO ensure that each LIMB of the result does not underflow. Based on this condition, we compute the minimum
     * value of `s` such that, for each limb `i`, the following result is positive:
     * `*this.limb[i] + X.limb[i] - other.limb[i] ≥ 0`.
     */
    bigfield operator-(const bigfield& other) const;

    /**
     * @brief Evaluate a non-native field multiplication: (a * b = c mod p) where p == target_basis.modulus
     *
     * @param other
     * @return bigfield
     *
     * @details We compute quotient term `q` and remainder `c` and evaluate that:
     * a * b - q * p - c = 0 mod modulus_u512 (binary basis modulus, currently 2**272)
     * a * b - q * p - c = 0 mod circuit modulus
     * We also check that:
     * a * b < M  and  q * p - c < M, where M = (2^t * n) is CRT modulus.
     *
     */
    bigfield operator*(const bigfield& other) const;

    /**
     * Division operator: a / b. Creates constraints for division in the circuit and checks b != 0.
     * If you need a variant without the zero check, use `div_without_denominator_check`.
     *
     * @param other The denominator.
     * @return The result of the division c = (a / b) mod p.
     *
     * @details To evaluate (a / b = c mod p), we instead evaluate (c * b = a mod p), where p is the target modulus.
     * We also check that b != 0.
     */
    bigfield operator/(const bigfield& other) const;

    /**
     * @brief Negation operator, works by subtracting `this` from zero.
     *
     * @return bigfield
     */
    bigfield operator-() const { return bigfield(get_context(), uint256_t(0)) - *this; }

    bigfield operator+=(const bigfield& other)
    {
        *this = operator+(other);
        return *this;
    }
    bigfield operator-=(const bigfield& other)
    {
        *this = operator-(other);
        return *this;
    }
    bigfield operator*=(const bigfield& other)
    {
        *this = operator*(other);
        return *this;
    }
    bigfield operator/=(const bigfield& other)
    {
        *this = operator/(other);
        return *this;
    }

    /**
     * @brief Square operator, computes a * a = c mod p.
     *
     * @return bigfield
     *
     * @details Costs the same as operator* as it just sets a = b.
     * NOTE(https://github.com/AztecProtocol/aztec-packages/issues/15089): Can optimise this further to save a gate.
     */
    bigfield sqr() const;

    /**
     * @brief Square and add operator, computes a * a + ...to_add = c mod p.
     *
     * @param to_add The bigfield element to add to the square.
     * @return bigfield
     *
     * @details We can chain multiple additions to a square/multiply with a single quotient/remainder. Chaining the
     * additions here is cheaper than calling operator+ because we can combine some gates in `evaluate_multiply_add`
     */
    bigfield sqradd(const std::vector<bigfield>& to_add) const;

    /**
     * @brief Raise the bigfield element to the power of (out-of-circuit) exponent.
     *
     * @param exponent The exponent to raise the bigfield element to.
     * @return this ** (exponent)
     *
     * @details Uses the square-and-multiply algorithm to compute a^exponent mod p.
     *
     * NOTE(https://github.com/AztecProtocol/barretenberg/issues/1014) Improve the efficiency of this function using
     * sliding window method.
     */
    bigfield pow(const uint32_t exponent) const;

    /**
     * @brief Compute a * b + ...to_add = c mod p
     *
     * @param to_mul Bigfield element to multiply by
     * @param to_add Vector of elements to add
     *
     * @return New bigfield element c
     **/
    bigfield madd(const bigfield& to_mul, const std::vector<bigfield>& to_add) const;

    static void perform_reductions_for_mult_madd(std::vector<bigfield>& mul_left,
                                                 std::vector<bigfield>& mul_right,
                                                 const std::vector<bigfield>& to_add);

    static bigfield mult_madd(const std::vector<bigfield>& mul_left,
                              const std::vector<bigfield>& mul_right,
                              const std::vector<bigfield>& to_add,
                              bool fix_remainder_to_zero = false);

    static bigfield dual_madd(const bigfield& left_a,
                              const bigfield& right_a,
                              const bigfield& left_b,
                              const bigfield& right_b,
                              const std::vector<bigfield>& to_add);

    // compute -(mul_left * mul_right + ...to_sub) / (divisor)
    // We can evaluate this relationship with only one set of quotient/remainder range checks
    static bigfield msub_div(const std::vector<bigfield>& mul_left,
                             const std::vector<bigfield>& mul_right,
                             const bigfield& divisor,
                             const std::vector<bigfield>& to_sub,
                             bool enable_divisor_nz_check = false);

    static bigfield sum(const std::vector<bigfield>& terms);
    static bigfield internal_div(const std::vector<bigfield>& numerators,
                                 const bigfield& denominator,
                                 bool check_for_zero);

    static bigfield div_without_denominator_check(const std::vector<bigfield>& numerators, const bigfield& denominator);
    bigfield div_without_denominator_check(const bigfield& denominator);
    static bigfield div_check_denominator_nonzero(const std::vector<bigfield>& numerators, const bigfield& denominator);

    bigfield conditional_negate(const bool_t<Builder>& predicate) const;

    /**
     * @brief Create an element which is equal to either this or other based on the predicate
     *
     * @tparam Builder
     * @tparam T
     * @param other The other bigfield element
     * @param predicate Predicate controlling the result (0 for this, 1 for the other)
     * @return Resulting element
     */
    bigfield conditional_select(const bigfield& other, const bool_t<Builder>& predicate) const;
    static bigfield conditional_assign(const bool_t<Builder>& predicate, const bigfield& lhs, const bigfield& rhs)
    {
        return rhs.conditional_select(lhs, predicate);
    }

    bool_t<Builder> operator==(const bigfield& other) const;

    void assert_is_in_field() const;
    void assert_less_than(const uint256_t& upper_limit) const;
    void assert_equal(const bigfield& other) const;
    void assert_is_not_equal(const bigfield& other) const;

    void self_reduce() const;

    /**
     * @brief Check if the bigfield is constant, i.e. its prime limb is constant.
     *
     * @return true if the bigfield is constant, false otherwise.
     *
     * @details We use assertions to ensure that all limbs are consistent in their constant status.
     */
    bool is_constant() const
    {
        bool is_limb_0_constant = binary_basis_limbs[0].element.is_constant();
        bool is_limb_1_constant = binary_basis_limbs[1].element.is_constant();
        bool is_limb_2_constant = binary_basis_limbs[2].element.is_constant();
        bool is_limb_3_constant = binary_basis_limbs[3].element.is_constant();
        bool is_prime_limb_constant = prime_basis_limb.is_constant();
        BB_ASSERT_EQ(is_limb_0_constant, is_limb_1_constant);
        BB_ASSERT_EQ(is_limb_1_constant, is_limb_2_constant);
        BB_ASSERT_EQ(is_limb_2_constant, is_limb_3_constant);
        BB_ASSERT_EQ(is_limb_3_constant, is_prime_limb_constant);
        return is_prime_limb_constant;
    }

    /**
     * @brief Inverting function with the assumption that the bigfield element we are calling invert on is not zero.
     *
     * @return bigfield
     */
    bigfield invert() const { return (bigfield(1) / bigfield(*this)); }

    /**
     * Create a public one constant
     * */
    static bigfield one()
    {
        bigfield result(nullptr, uint256_t(1));
        return result;
    }

    /**
     * Create a public zero constant
     * */
    static bigfield zero()
    {
        bigfield result(nullptr, uint256_t(0));
        return result;
    }

    /**
     * @brief Create an unreduced 0 ~ p*k, where p*k is the minimal multiple of modulus that should be reduced
     *
     * @details We need it for division. If we always add this element during division, then we never run into the
     * formula-breaking situation
     */
    static constexpr bigfield unreduced_zero()
    {
        uint512_t multiple_of_modulus = ((get_maximum_unreduced_value() / modulus_u512) + 1) * modulus_u512;
        auto msb = multiple_of_modulus.get_msb();

        bigfield result(nullptr, uint256_t(0));
        result.binary_basis_limbs[0] = Limb(bb::fr(multiple_of_modulus.slice(0, NUM_LIMB_BITS).lo));
        result.binary_basis_limbs[1] = Limb(bb::fr(multiple_of_modulus.slice(NUM_LIMB_BITS, 2 * NUM_LIMB_BITS).lo));
        result.binary_basis_limbs[2] = Limb(bb::fr(multiple_of_modulus.slice(2 * NUM_LIMB_BITS, 3 * NUM_LIMB_BITS).lo));
        result.binary_basis_limbs[3] = Limb(bb::fr(multiple_of_modulus.slice(3 * NUM_LIMB_BITS, msb + 1).lo));
        result.prime_basis_limb = field_t<Builder>((multiple_of_modulus % uint512_t(field_t<Builder>::modulus)).lo);
        return result;
    }

    /**
     * Create a witness form a constant. This way the value of the witness is fixed and public.
     **/
    void convert_constant_to_fixed_witness(Builder* builder)
    {
        context = builder;
        for (auto& limb : binary_basis_limbs) {
            limb.element.convert_constant_to_fixed_witness(context);
        }
        prime_basis_limb.convert_constant_to_fixed_witness(context);
    }

    /**
     * Fix a witness. The value of the witness is constrained with a selector
     **/
    void fix_witness()
    {
        // Origin tags should be updated within
        for (auto& limb : binary_basis_limbs) {
            limb.element.fix_witness();
        }
        prime_basis_limb.fix_witness();

        // This is now effectively a constant
        unset_free_witness_tag();
    }

    Builder* get_context() const { return context; }

    void set_origin_tag(const bb::OriginTag& tag) const
    {
        for (size_t i = 0; i < NUM_LIMBS; i++) {
            binary_basis_limbs[i].element.set_origin_tag(tag);
        }
        prime_basis_limb.set_origin_tag(tag);
    }

    bb::OriginTag get_origin_tag() const
    {
        return bb::OriginTag(binary_basis_limbs[0].element.tag,
                             binary_basis_limbs[1].element.tag,
                             binary_basis_limbs[2].element.tag,
                             binary_basis_limbs[3].element.tag,
                             prime_basis_limb.tag);
    }

    /**
     * @brief Set the free witness flag for the bigfield
     */
    void set_free_witness_tag()
    {
        for (auto& limb : binary_basis_limbs) {
            limb.element.set_free_witness_tag();
        }
        prime_basis_limb.set_free_witness_tag();
    }

    /**
     * @brief Unset the free witness flag for the bigfield
     */
    void unset_free_witness_tag()
    {
        for (auto& limb : binary_basis_limbs) {
            limb.element.unset_free_witness_tag();
        }
        prime_basis_limb.unset_free_witness_tag();
    }
    /**
     * @brief Set the witness indices of the binary basis limbs to public
     *
     * @return uint32_t The public input index at which the representation of the bigfield starts
     */
    uint32_t set_public() const
    {
        Builder* ctx = get_context();
        const uint32_t start_index = static_cast<uint32_t>(ctx->num_public_inputs());
        for (auto& limb : binary_basis_limbs) {
            ctx->set_public_input(limb.element.normalize().witness_index);
        }
        return start_index;
    }

    /**
     * @brief Reconstruct a bigfield from limbs (generally stored in the public inputs)
     */
    static bigfield reconstruct_from_public(const std::span<const field_ct, PUBLIC_INPUTS_SIZE>& limbs)
    {
        return construct_from_limbs(limbs[0], limbs[1], limbs[2], limbs[3], /*can_overflow=*/false);
    }

    static constexpr uint512_t get_maximum_unreduced_value()
    {
        // This = `T * n = 2^272 * |BN(Fr)|` So this equals n*2^t
        uint1024_t maximum_product = get_maximum_crt_product();

        // In multiplying two bigfield elements a and b, we must check that:
        //
        // a * b = q * p + r
        //
        // where p is the quotient, r is the remainder, and p is the size of the non-native field.
        // The CRT requires that we check that the equation:
        // (a) holds modulo the size of the native field n,
        // (b) holds modulo the size of the bigger ring 2^t,
        // (c) both sides of the equation are less than the max product M = 2^t * n.
        // Thus, the max value of an unreduced bigfield element is √M. In this case, we use
        // an even stricter bound. Let n = 2^m + l (where 1 < l < 2^m). Thus, we have:
        //
        //     M = 2^t * n = 2^t * (2^m + l) = 2^(t + m) + (2^t * l)
        // =>  M > 2^(t + m)
        // => √M > 2^((t + m) / 2)
        //
        // We set the maximum unreduced value of a bigfield element to be: 2^((t + m) / 2) < √M.
        //
        // Note: We use a further safer bound of 2^((t + m - 1) / 2). We use -1 to stay safer,
        // because it provides additional space to avoid the overflow, but get_msb() by itself should be enough.
        uint64_t maximum_product_bits = maximum_product.get_msb() - 1;
        return (uint512_t(1) << (maximum_product_bits >> 1));
    }

    // If we encounter this maximum value of a bigfield we stop execution
    static constexpr uint512_t get_prohibited_value()
    {
        uint1024_t maximum_product = get_maximum_crt_product();
        uint64_t maximum_product_bits = maximum_product.get_msb() - 1;
        const size_t arbitrary_secure_margin = 20;
        return (uint512_t(1) << ((maximum_product_bits >> 1) + arbitrary_secure_margin)) - uint512_t(1);
    }

    /**
     * @brief Compute the maximum product of two bigfield elements in CRT: M = 2^t * n.
     *
     * @details When we multiply two bigfield elements a and b, we need to check that: a * b = q * p + r,
     * where q is the quotient, r is the remainder, and p is the size of the non-native field. With the CRT, we should
     * have both sizes less than the maximum product M = 2^t * n.
     *
     * @return uint1024_t Maximum product of two bigfield elements in CRT form
     */
    static constexpr uint1024_t get_maximum_crt_product()
    {
        uint1024_t maximum_product = uint1024_t(binary_basis.modulus) * uint1024_t(prime_basis.modulus);
        return maximum_product;
    }

    /**
     * @brief Compute the maximum number of bits for quotient range proof to protect against CRT underflow
     *
     * @details When multiplying a and b, we need to check that: a * b = q * p + r, and each side of the equation
     * is less than the maximum product M = 2^t * n. The quotient q is a size of the non-native field, and we need to
     * ensure it fits within the available bits. q * p + r < M  ==>  q < (M - r_max) / p
     *
     * @param remainders_max Maximum sizes of resulting remainders
     * @return Desired length of range proof
     */
    static size_t get_quotient_max_bits(const std::vector<uint1024_t>& remainders_max)
    {
        // find q_max * p + ...remainders_max < nT
        uint1024_t base = get_maximum_crt_product();
        for (const auto& r : remainders_max) {
            base -= r;
        }
        base /= modulus_u512;
        return static_cast<size_t>(base.get_msb() - 1);
    }

    /**
     * Check that the maximum value of a bigfield product with added values overflows crt modulus.
     *
     * @param a_max multiplicand maximum value
     * @param b_max multiplier maximum value
     * @param to_add vector of field elements to be added
     *
     * @return true if there is an overflow, false otherwise
     **/
    static bool mul_product_overflows_crt_modulus(const uint1024_t& a_max,
                                                  const uint1024_t& b_max,
                                                  const std::vector<bigfield>& to_add)
    {
        uint1024_t product = a_max * b_max;
        uint1024_t add_term = 0;
        for (const auto& add : to_add) {
            add_term += add.get_maximum_value();
        }
        constexpr uint1024_t maximum_default_bigint = uint1024_t(1) << (NUM_LIMB_BITS * 6 + NUM_LAST_LIMB_BITS * 2);

        // check that the add terms alone cannot overflow the crt modulus. v. unlikely so just forbid circuits that
        // trigger this case
        BB_ASSERT_LT(add_term + maximum_default_bigint, get_maximum_crt_product());
        return ((product + add_term) >= get_maximum_crt_product());
    }

    /**
     * Check that the maximum value of a sum of bigfield productc with added values overflows ctf modulus.
     *
     * @param as_max Vector of multiplicands' maximum values
     * @param b_max Vector of multipliers' maximum values
     * @param to_add Vector of field elements to be added
     *
     * @return true if there is an overflow, false otherwise
     **/
    static bool mul_product_overflows_crt_modulus(const std::vector<uint512_t>& as_max,
                                                  const std::vector<uint512_t>& bs_max,
                                                  const std::vector<bigfield>& to_add)
    {
        std::vector<uint1024_t> products;
        BB_ASSERT_EQ(as_max.size(), bs_max.size());
        // Computing individual products
        uint1024_t product_sum = 0;
        uint1024_t add_term = 0;
        for (size_t i = 0; i < as_max.size(); i++) {
            product_sum += uint1024_t(as_max[i]) * uint1024_t(bs_max[i]);
        }
        for (const auto& add : to_add) {
            add_term += add.get_maximum_value();
        }
        static const uint1024_t maximum_default_bigint = uint1024_t(1) << (NUM_LIMB_BITS * 6 + NUM_LAST_LIMB_BITS * 2);

        // check that the add terms alone cannot overflow the crt modulus. v. unlikely so just forbid circuits that
        // trigger this case
        BB_ASSERT_LT(add_term + maximum_default_bigint, get_maximum_crt_product());
        return ((product_sum + add_term) >= get_maximum_crt_product());
    }

    // a (currently generous) upper bound on the log of number of fr additions in any of the class operations
    static constexpr uint64_t MAX_ADDITION_LOG = 10;

    // The rationale of the expression is we should not overflow Fr when applying any bigfield operation (e.g. *) and
    // starting with this max limb size
    //
    // In multiplication of bigfield elements a * b, we encounter sum of limbs multiplications of form:
    // c0 := a0 * b0
    // c1 := a1 * b0 + a0 * b1
    // c2 := a2 * b0 + a1 * b1 + a0 * b2
    // c3 := a3 * b0 + a2 * b1 + a1 * b2 + a0 * b3
    // output:
    // lo := c0 + c1 * 2^L,
    // hi := c2 + c3 * 2^L.
    // Since hi term contains upto 4 limb-products, we must ensure that the hi term does not overflow the native field
    // modulus. Suppose we are adding 2^k such terms. Let Q be the max bitsize of a limb. We want to ensure that the sum
    // doesn't overflow the native field modulus. Hence:
    // max(∑ hi) = max(∑ c2 + c3 * 2^L)
    //           = max(∑ c2) + max(∑ c3 * 2^L)
    //           = 2^k * (3 * 2^2Q) + 2^k * 2^L * (4 * 2^2Q)
    //           < 2^k * (2^L + 1) * (4 * 2^2Q)
    //           < n
    // ==> 2^k * 2^L * 2^(2Q + 2) < n
    // ==> 2Q + 2 < (log(n) - k - L)
    // ==> Q < ((log(n) - k - L) - 2) / 2
    //
    static constexpr uint64_t MAXIMUM_LIMB_SIZE_THAT_WOULDNT_OVERFLOW =
        (bb::fr::modulus.get_msb() - MAX_ADDITION_LOG - NUM_LIMB_BITS - 2) / 2;

    // If the logarithm of the maximum value of a limb is more than this, we need to reduce.
    // We allow an element to be added to itself 10 times, so we allow the limb to grow by 10 bits.
    // Number 10 is arbitrary, there's no actual usecase for adding 1024 elements together.
    static constexpr uint64_t MAX_UNREDUCED_LIMB_BITS = NUM_LIMB_BITS + 10;

    // If we reach this size of a limb, we stop execution (as safety measure). This should never reach during addition
    // as we would reduce the limbs before they reach this size.
    static constexpr uint64_t PROHIBITED_LIMB_BITS = MAX_UNREDUCED_LIMB_BITS + 5;

    // If we encounter this maximum value of a bigfield we need to reduce it.
    static constexpr uint256_t get_maximum_unreduced_limb_value() { return uint256_t(1) << MAX_UNREDUCED_LIMB_BITS; }

    // If we encounter this maximum value of a limb we stop execution
    static constexpr uint256_t get_prohibited_limb_value() { return uint256_t(1) << PROHIBITED_LIMB_BITS; }

    static_assert(PROHIBITED_LIMB_BITS < MAXIMUM_LIMB_SIZE_THAT_WOULDNT_OVERFLOW);

  private:
    /**
     * @brief Get the witness indices of the (normalized) binary basis limbs
     *
     * @return Witness indices of the binary basis limbs
     */
    std::array<uint32_t, NUM_LIMBS> get_binary_basis_limb_witness_indices() const
    {
        std::array<uint32_t, NUM_LIMBS> limb_witness_indices;
        for (size_t i = 0; i < NUM_LIMBS; i++) {
            limb_witness_indices[i] = binary_basis_limbs[i].element.get_normalized_witness_index();
        }
        return limb_witness_indices;
    }

    /**
     * @brief Compute the quotient and remainder values for dividing (a * b + (to_add[0] + ... + to_add[-1])) with p
     *
     * @param a Left multiplicand
     * @param b Right multiplier
     * @param to_add Vector of elements to add
     * @return std::pair<uint512_t, uint512_t> Quotient and remainder values
     */
    static std::pair<uint512_t, uint512_t> compute_quotient_remainder_values(const bigfield& a,
                                                                             const bigfield& b,
                                                                             const std::vector<bigfield>& to_add);
    /**
     * @brief Compute the maximum possible value of quotient of a*b+\sum(to_add)
     *
     * @param as Multiplicands
     * @param bs Multipliers
     * @param to_add Added elements
     * @return uint512_t The maximum value of quotient
     */
    static uint512_t compute_maximum_quotient_value(const std::vector<uint512_t>& as,
                                                    const std::vector<uint512_t>& bs,
                                                    const std::vector<uint512_t>& to_add);

    /**
     * @brief Check for 2 conditions (CRT modulus is overflown or the maximum quotient doesn't fit into range proof).
     * Also returns the length of quotient's range proof if there is no need to reduce.
     *
     * @param as_max Vector of left multiplicands' maximum values
     * @param bs_max Vector of right multiplicands' maximum values
     * @param to_add Vector of added bigfield values
     * @return <true, 0> if we need to reduce the product;
     * <false, The length of quotient range proof> if there is no need to reduce the product.
     */
    static std::pair<bool, size_t> get_quotient_reduction_info(const std::vector<uint512_t>& as_max,
                                                               const std::vector<uint512_t>& bs_max,
                                                               const std::vector<bigfield>& to_add,
                                                               const std::vector<uint1024_t>& remainders_max = {
                                                                   DEFAULT_MAXIMUM_REMAINDER });

    /**
     * @brief Evaluate a multiply add identity with several added elements and several remainders
     *
     * @param left Left multiplicand
     * @param right Right multiplicand
     * @param to_add Vector of elements to add
     * @param quotient Quotient term
     * @param remainders Vector of remainders
     *
     * @details This function evaluates the relationship:
     * a * b + (to_add[0] + .. + to_add[-1]) - q * p - (r[0] + .. + r[-1]) = 0 mod 2^t (binary basis modulus)
     * a * b + (to_add[0] + .. + to_add[-1]) - q * p - (r[0] + .. + r[-1]) = 0 mod n (circuit modulus)
     *
     * @note This method supports multiple "remainders" because, when evaluating division of the form:
     * (n[0] * n[1] + ... + n[-1]) / d, the numerator (which becomes the remainder term) can be a sum of multiple
     * elements.
     *
     * @warning THIS FUNCTION IS UNSAFE TO USE IN CIRCUITS AS IT DOES NOT PROTECT AGAINST CRT OVERFLOWS.
     */
    static void unsafe_evaluate_multiply_add(const bigfield& input_left,
                                             const bigfield& input_to_mul,
                                             const std::vector<bigfield>& to_add,
                                             const bigfield& input_quotient,
                                             const std::vector<bigfield>& input_remainders);

    /**
     * @brief Evaluate a relation involving multiple multiplications and additions.
     *
     * @param input_left Vector of left multiplication operands.
     * @param input_right Vector of right multiplication operands.
     * @param to_add Vector of elements to add to the product.
     * @param input_quotient Quotient term.
     * @param input_remainders Vector of remainders.
     *
     * @details This function evaluates the relationship:
     * (a[0] * b[0] + ... + (a[-1] * b[-1])) + (to_add[0] + .. + to_add[-1]) - q * p - (r[0] + .. + r[-1]) = 0 mod 2^t
     * (a[0] * b[0] + ... + (a[-1] * b[-1])) + (to_add[0] + .. + to_add[-1]) - q * p - (r[0] + .. + r[-1]) = 0 mod n
     *
     * @note This method supports multiple "remainders" because, when evaluating division of the form:
     * (n[0] * n[1] + ... + n[-1]) / d, the numerator (which becomes the remainder term) can be a sum of multiple
     * elements. See `msub_div` for more details on how this is used.
     *
     * @warning THIS FUNCTION IS UNSAFE TO USE IN CIRCUITS AS IT DOES NOT PROTECT AGAINST CRT OVERFLOWS.
     */
    static void unsafe_evaluate_multiple_multiply_add(const std::vector<bigfield>& input_left,
                                                      const std::vector<bigfield>& input_right,
                                                      const std::vector<bigfield>& to_add,
                                                      const bigfield& input_quotient,
                                                      const std::vector<bigfield>& input_remainders);

    /**
     * @brief Evaluate a square with several additions.
     *
     * @param left Left multiplicand
     * @param to_add Vector of elements to add
     * @param quotient Quotient term
     * @param remainder Remainder term
     *
     * @details This function evaluates the relationship:
     * (a * a) + (to_add[0] + .. + to_add[-1]) - q * p - r = 0 mod 2^t (binary basis modulus)
     * (a * a) + (to_add[0] + .. + to_add[-1]) - q * p - r = 0 mod n (circuit modulus)
     *
     * @warning THIS FUNCTION IS UNSAFE TO USE IN CIRCUITS AS IT DOES NOT PROTECT AGAINST CRT OVERFLOWS.
     */
    static void unsafe_evaluate_square_add(const bigfield& left,
                                           const std::vector<bigfield>& to_add,
                                           const bigfield& quotient,
                                           const bigfield& remainder);

    /**
     * @brief Check if the bigfield element needs to be reduced.
     *
     * @details This function checks if the bigfield element is within the valid range and reduces it if necessary.
     * When multiplying bigfield elements a and b, we need to ensure that each side of the equation:
     *      a * b = q * p + r
     * (a) holds modulo the size of the native field n,
     * (b) holds modulo the size of the bigger ring 2^t.
     * (c) is less than the maximum value: M = 2^t * n.
     * This implies a, b must always be less than √M, and their limbs must be less than the maximum limb value.
     *
     * Given a bigfield element c, this function applies these checks:
     *  (i) c < √M (see note below).
     * (ii) each limb (binary basis) of c is less than the maximum limb value.
     *
     * These checks prevent our field arithmetic from overflowing the native modulus boundary, whilst ensuring we can
     * still use the chinese remainder theorem to validate field multiplications with a reduced number of range checks.
     *
     * Note: We actually apply a stricter bound, see @ref get_maximum_unreduced_value for an explanation.
     */
    void reduction_check() const;

    /**
     * @brief Perform a sanity check on a value that is about to interact with another value.
     *
     * @details ASSERTs that the value of all limbs is less than or equal to the prohibited maximum value. Checks that
     *the maximum value of the whole element is also less than a prohibited maximum value.
     */
    void sanity_check() const;

    /**
     * @brief Get the maximum values of the binary basis limbs.
     *
     * @return std::array<field_t<Builder>, NUM_LIMBS> An array containing the maximum values of the binary basis limbs.
     */
    std::array<uint256_t, NUM_LIMBS> get_binary_basis_limb_maximums()
    {
        std::array<uint256_t, NUM_LIMBS> limb_maximums;
        for (size_t i = 0; i < NUM_LIMBS; i++) {
            limb_maximums[i] = binary_basis_limbs[i].maximum_value;
        }
        return limb_maximums;
    }

    /**
     * @brief Compute the partial multiplication of two uint256_t arrays using schoolbook multiplication.
     *
     * @param a_limbs
     * @param b_limbs
     * @return std::pair<uint512_t, uint512_t>
     *
     * @details Regular schoolbook multiplication of two arrays each with L = 4 limbs will produce a result of size
     * 2 * L - 1 = 7. In this context, we can ignore the last three limbs as those terms have multiplicands: (2^4L,
     * 2^5L, 2^6L) and since we are working modulo 2^t = 2^4L, those terms will always be zero. This is why we call this
     * helper function "partial schoolbook multiplication".
     */
    static std::pair<uint512_t, uint512_t> compute_partial_schoolbook_multiplication(
        const std::array<uint256_t, NUM_LIMBS>& a_limbs, const std::array<uint256_t, NUM_LIMBS>& b_limbs);

}; // namespace stdlib

template <typename C, typename T> inline std::ostream& operator<<(std::ostream& os, bigfield<T, C> const& v)
{
    return os << v.get_value();
}

} // namespace bb::stdlib
