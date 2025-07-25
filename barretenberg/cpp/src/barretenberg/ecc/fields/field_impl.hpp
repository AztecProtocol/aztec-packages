// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/common/slab_allocator.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <memory>
#include <span>
#include <type_traits>
#include <vector>

#include "./field_declarations.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

namespace bb {

// clang-format off
// disable the following style guides:
// cppcoreguidelines-avoid-c-arrays : we make heavy use of c-style arrays here to prevent default-initialization of memory when constructing `field` objects.
//                                    The intention is for field to act like a primitive numeric type with the performance/complexity trade-offs expected from this.
// NOLINTBEGIN(cppcoreguidelines-avoid-c-arrays)
// clang-format on
/**
 *
 * Mutiplication
 *
 **/
template <class T> constexpr field<T> field<T>::operator*(const field& other) const noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::mul");
    if constexpr (BBERG_NO_ASM || (T::modulus_3 >= 0x4000000000000000ULL) ||
                  (T::modulus_1 == 0 && T::modulus_2 == 0 && T::modulus_3 == 0)) {
        // >= 255-bits or <= 64-bits.
        return montgomery_mul(other);
    } else {
        if (std::is_constant_evaluated()) {
            return montgomery_mul(other);
        }
        return asm_mul_with_coarse_reduction(*this, other);
    }
}

template <class T> constexpr field<T>& field<T>::operator*=(const field& other) & noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::self_mul");
    if constexpr (BBERG_NO_ASM || (T::modulus_3 >= 0x4000000000000000ULL) ||
                  (T::modulus_1 == 0 && T::modulus_2 == 0 && T::modulus_3 == 0)) {
        // >= 255-bits or <= 64-bits.
        *this = operator*(other);
    } else {
        if (std::is_constant_evaluated()) {
            *this = operator*(other);
        } else {
            asm_self_mul_with_coarse_reduction(*this, other); // asm_self_mul(*this, other);
        }
    }
    return *this;
}

/**
 *
 * Squaring
 *
 **/
template <class T> constexpr field<T> field<T>::sqr() const noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::sqr");
    if constexpr (BBERG_NO_ASM || (T::modulus_3 >= 0x4000000000000000ULL) ||
                  (T::modulus_1 == 0 && T::modulus_2 == 0 && T::modulus_3 == 0)) {
        return montgomery_square();
    } else {
        if (std::is_constant_evaluated()) {
            return montgomery_square();
        }
        return asm_sqr_with_coarse_reduction(*this); // asm_sqr(*this);
    }
}

template <class T> constexpr void field<T>::self_sqr() & noexcept
{
    BB_OP_COUNT_TRACK_NAME("f::self_sqr");
    if constexpr (BBERG_NO_ASM || (T::modulus_3 >= 0x4000000000000000ULL) ||
                  (T::modulus_1 == 0 && T::modulus_2 == 0 && T::modulus_3 == 0)) {
        *this = montgomery_square();
    } else {
        if (std::is_constant_evaluated()) {
            *this = montgomery_square();
        } else {
            asm_self_sqr_with_coarse_reduction(*this);
        }
    }
}

/**
 *
 * Addition
 *
 **/
template <class T> constexpr field<T> field<T>::operator+(const field& other) const noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::add");
    if constexpr (BBERG_NO_ASM || (T::modulus_3 >= 0x4000000000000000ULL) ||
                  (T::modulus_1 == 0 && T::modulus_2 == 0 && T::modulus_3 == 0)) {
        return add(other);
    } else {
        if (std::is_constant_evaluated()) {
            return add(other);
        }
        return asm_add_with_coarse_reduction(*this, other); // asm_add_without_reduction(*this, other);
    }
}

template <class T> constexpr field<T>& field<T>::operator+=(const field& other) & noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::self_add");
    if constexpr (BBERG_NO_ASM || (T::modulus_3 >= 0x4000000000000000ULL) ||
                  (T::modulus_1 == 0 && T::modulus_2 == 0 && T::modulus_3 == 0)) {
        (*this) = operator+(other);
    } else {
        if (std::is_constant_evaluated()) {
            (*this) = operator+(other);
        } else {
            asm_self_add_with_coarse_reduction(*this, other); // asm_self_add(*this, other);
        }
    }
    return *this;
}

template <class T> constexpr field<T> field<T>::operator++() noexcept
{
    BB_OP_COUNT_TRACK_NAME("++f");
    return *this += 1;
}

// NOLINTNEXTLINE(cert-dcl21-cpp) circular linting errors. If const is added, linter suggests removing
template <class T> constexpr field<T> field<T>::operator++(int) noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::increment");
    field<T> value_before_incrementing = *this;
    *this += 1;
    return value_before_incrementing;
}

/**
 *
 * Subtraction
 *
 **/
template <class T> constexpr field<T> field<T>::operator-(const field& other) const noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::sub");
    if constexpr (BBERG_NO_ASM || (T::modulus_3 >= 0x4000000000000000ULL) ||
                  (T::modulus_1 == 0 && T::modulus_2 == 0 && T::modulus_3 == 0)) {
        return subtract_coarse(other); // modulus - *this;
    } else {
        if (std::is_constant_evaluated()) {
            return subtract_coarse(other); // subtract(other);
        }
        return asm_sub_with_coarse_reduction(*this, other); // asm_sub(*this, other);
    }
}

template <class T> constexpr field<T> field<T>::operator-() const noexcept
{
    BB_OP_COUNT_TRACK_NAME("-f");
    if constexpr ((T::modulus_3 >= 0x4000000000000000ULL) ||
                  (T::modulus_1 == 0 && T::modulus_2 == 0 && T::modulus_3 == 0)) {
        constexpr field p{ modulus.data[0], modulus.data[1], modulus.data[2], modulus.data[3] };
        return p - *this; // modulus - *this;
    }

    // TODO(@zac-williamson): there are 3 ways we can make this more efficient
    // 1: we subtract `p` from `*this` instead of `2p`
    // 2: instead of `p - *this`, we use an asm block that does `p - *this` without the assembly reduction step
    // 3: we replace `(p - *this).reduce_once()` with an assembly block that is equivalent to `p - *this`,
    //    but we call `REDUCE_FIELD_ELEMENT` with `not_twice_modulus` instead of `twice_modulus`
    // not sure which is faster and whether any of the above might break something!
    //
    // More context below:
    // the operator-(a, b) method's asm implementation has a sneaky was to check underflow.
    // if `a - b` underflows we need to add in `2p`. Instead of conditional branching which would cause pipeline
    // flushes, we add `2p` into the result of `a - b`. If the result triggers the overflow flag, then we know we are
    // correcting an *underflow* produced from computing `a - b`. Finally...we use the overflow flag to conditionally
    // move data into registers such that we end up with either `a - b` or `2p + (a - b)` (this is branchless). OK! So
    // what's the problem? Well we assume that every field element lies between 0 and 2p - 1. But we are computing `2p -
    // *this`! If *this = 0 then we exceed this bound hence the need for the extra reduction step. HOWEVER, we also know
    // that 2p - *this won't underflow so we could skip the underflow check present in the assembly code
    constexpr field p{ twice_modulus.data[0], twice_modulus.data[1], twice_modulus.data[2], twice_modulus.data[3] };
    return (p - *this).reduce_once(); // modulus - *this;
}

template <class T> constexpr field<T>& field<T>::operator-=(const field& other) & noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::self_sub");
    if constexpr (BBERG_NO_ASM || (T::modulus_3 >= 0x4000000000000000ULL) ||
                  (T::modulus_1 == 0 && T::modulus_2 == 0 && T::modulus_3 == 0)) {
        *this = subtract_coarse(other); // subtract(other);
    } else {
        if (std::is_constant_evaluated()) {
            *this = subtract_coarse(other); // subtract(other);
        } else {
            asm_self_sub_with_coarse_reduction(*this, other); // asm_self_sub(*this, other);
        }
    }
    return *this;
}

template <class T> constexpr void field<T>::self_neg() & noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::self_neg");
    if constexpr ((T::modulus_3 >= 0x4000000000000000ULL) ||
                  (T::modulus_1 == 0 && T::modulus_2 == 0 && T::modulus_3 == 0)) {
        constexpr field p{ modulus.data[0], modulus.data[1], modulus.data[2], modulus.data[3] };
        *this = p - *this;
    } else {
        constexpr field p{ twice_modulus.data[0], twice_modulus.data[1], twice_modulus.data[2], twice_modulus.data[3] };
        *this = (p - *this).reduce_once();
    }
}

template <class T> constexpr void field<T>::self_conditional_negate(const uint64_t predicate) & noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::self_conditional_negate");
    if constexpr (BBERG_NO_ASM || (T::modulus_3 >= 0x4000000000000000ULL) ||
                  (T::modulus_1 == 0 && T::modulus_2 == 0 && T::modulus_3 == 0)) {
        *this = predicate ? -(*this) : *this; // NOLINT
    } else {
        if (std::is_constant_evaluated()) {
            *this = predicate ? -(*this) : *this; // NOLINT
        } else {
            asm_conditional_negate(*this, predicate);
        }
    }
}

/**
 * @brief Greater-than operator
 * @details comparison operators exist so that `field` is comparible with stl methods that require them.
 *          (e.g. std::sort)
 *          Finite fields do not have an explicit ordering, these should *NEVER* be used in algebraic algorithms.
 *
 * @tparam T
 * @param other
 * @return true
 * @return false
 */
template <class T> constexpr bool field<T>::operator>(const field& other) const noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::gt");
    const field left = reduce_once();
    const field right = other.reduce_once();
    const bool t0 = left.data[3] > right.data[3];
    const bool t1 = (left.data[3] == right.data[3]) && (left.data[2] > right.data[2]);
    const bool t2 =
        (left.data[3] == right.data[3]) && (left.data[2] == right.data[2]) && (left.data[1] > right.data[1]);
    const bool t3 = (left.data[3] == right.data[3]) && (left.data[2] == right.data[2]) &&
                    (left.data[1] == right.data[1]) && (left.data[0] > right.data[0]);
    return (t0 || t1 || t2 || t3);
}

/**
 * @brief Less-than operator
 * @details comparison operators exist so that `field` is comparible with stl methods that require them.
 *          (e.g. std::sort)
 *          Finite fields do not have an explicit ordering, these should *NEVER* be used in algebraic algorithms.
 *
 * @tparam T
 * @param other
 * @return true
 * @return false
 */
template <class T> constexpr bool field<T>::operator<(const field& other) const noexcept
{
    return (other > *this);
}

template <class T> constexpr bool field<T>::operator==(const field& other) const noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::eqeq");
    const field left = reduce_once();
    const field right = other.reduce_once();
    return (left.data[0] == right.data[0]) && (left.data[1] == right.data[1]) && (left.data[2] == right.data[2]) &&
           (left.data[3] == right.data[3]);
}

template <class T> constexpr bool field<T>::operator!=(const field& other) const noexcept
{
    return (!operator==(other));
}

template <class T> constexpr field<T> field<T>::to_montgomery_form() const noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::to_montgomery_form");
    constexpr field r_squared =
        field{ r_squared_uint.data[0], r_squared_uint.data[1], r_squared_uint.data[2], r_squared_uint.data[3] };

    field result = *this;
    // TODO(@zac-williamson): are these reductions needed?
    // Rationale: We want to take any 256-bit input and be able to convert into montgomery form.
    // A basic heuristic we use is that any input into the `*` operator must be between [0, 2p - 1]
    // to prevent overflows in the asm algorithm.
    // However... r_squared is already reduced so perhaps we can relax this requirement?
    // (would be good to identify a failure case where not calling self_reduce triggers an error)
    result.self_reduce_once();
    result.self_reduce_once();
    result.self_reduce_once();
    return (result * r_squared).reduce_once();
}

template <class T> constexpr field<T> field<T>::from_montgomery_form() const noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::from_montgomery_form");
    constexpr field one_raw{ 1, 0, 0, 0 };
    return operator*(one_raw).reduce_once();
}

template <class T> constexpr void field<T>::self_to_montgomery_form() & noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::self_to_montgomery_form");
    constexpr field r_squared =
        field{ r_squared_uint.data[0], r_squared_uint.data[1], r_squared_uint.data[2], r_squared_uint.data[3] };

    self_reduce_once();
    self_reduce_once();
    self_reduce_once();
    *this *= r_squared;
    self_reduce_once();
}

template <class T> constexpr void field<T>::self_from_montgomery_form() & noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::self_from_montgomery_form");
    constexpr field one_raw{ 1, 0, 0, 0 };
    *this *= one_raw;
    self_reduce_once();
}

template <class T> constexpr field<T> field<T>::reduce_once() const noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::reduce_once");
    if constexpr (BBERG_NO_ASM || (T::modulus_3 >= 0x4000000000000000ULL) ||
                  (T::modulus_1 == 0 && T::modulus_2 == 0 && T::modulus_3 == 0)) {
        return reduce();
    } else {
        if (std::is_constant_evaluated()) {
            return reduce();
        }
        return asm_reduce_once(*this);
    }
}

template <class T> constexpr void field<T>::self_reduce_once() & noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::self_reduce_once");
    if constexpr (BBERG_NO_ASM || (T::modulus_3 >= 0x4000000000000000ULL) ||
                  (T::modulus_1 == 0 && T::modulus_2 == 0 && T::modulus_3 == 0)) {
        *this = reduce();
    } else {
        if (std::is_constant_evaluated()) {
            *this = reduce();
        } else {
            asm_self_reduce_once(*this);
        }
    }
}

template <class T> constexpr field<T> field<T>::pow(const uint256_t& exponent) const noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::pow");
    field accumulator{ data[0], data[1], data[2], data[3] };
    field to_mul{ data[0], data[1], data[2], data[3] };
    const uint64_t maximum_set_bit = exponent.get_msb();

    for (int i = static_cast<int>(maximum_set_bit) - 1; i >= 0; --i) {
        accumulator.self_sqr();
        if (exponent.get_bit(static_cast<uint64_t>(i))) {
            accumulator *= to_mul;
        }
    }
    if (exponent == uint256_t(0)) {
        accumulator = one();
    } else if (*this == zero()) {
        accumulator = zero();
    }
    return accumulator;
}

template <class T> constexpr field<T> field<T>::pow(const uint64_t exponent) const noexcept
{
    return pow({ exponent, 0, 0, 0 });
}

template <class T> constexpr field<T> field<T>::invert() const noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::invert");
    if (*this == zero()) {
        throw_or_abort("Trying to invert zero in the field");
    }
    return pow(modulus_minus_two);
}

template <class T> void field<T>::batch_invert(field* coeffs, const size_t n) noexcept
{
    batch_invert(std::span{ coeffs, n });
}

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1166)
template <class T> void field<T>::batch_invert(std::span<field> coeffs) noexcept
{
    PROFILE_THIS_NAME("fr::batch_invert");
    const size_t n = coeffs.size();

    auto temporaries_ptr = std::static_pointer_cast<field[]>(get_mem_slab(n * sizeof(field)));
    auto skipped_ptr = std::static_pointer_cast<bool[]>(get_mem_slab(n));
    auto temporaries = temporaries_ptr.get();
    auto* skipped = skipped_ptr.get();

    field accumulator = one();
    for (size_t i = 0; i < n; ++i) {
        temporaries[i] = accumulator;
        if (coeffs[i].is_zero()) {
            skipped[i] = true;
        } else {
            skipped[i] = false;
            accumulator *= coeffs[i];
        }
    }

    // std::vector<field> temporaries;
    // std::vector<bool> skipped;
    // temporaries.reserve(n);
    // skipped.reserve(n);

    // field accumulator = one();
    // for (size_t i = 0; i < n; ++i) {
    //     temporaries.emplace_back(accumulator);
    //     if (coeffs[i].is_zero()) {
    //         skipped.emplace_back(true);
    //     } else {
    //         skipped.emplace_back(false);
    //         accumulator *= coeffs[i];
    //     }
    // }

    accumulator = accumulator.invert();

    field T0;
    for (size_t i = n - 1; i < n; --i) {
        if (!skipped[i]) {
            T0 = accumulator * temporaries[i];
            accumulator *= coeffs[i];
            coeffs[i] = T0;
        }
    }
}

/**
 * @brief Implements an optimised variant of Tonelli-Shanks via lookup tables.
 * Algorithm taken from https://cr.yp.to/papers/sqroot-20011123-retypeset20220327.pdf
 * "FASTER SQUARE ROOTS IN ANNOYING FINITE FIELDS" by D. Bernstein
 * Page 5 "Accelerated Discrete Logarithm"
 * @tparam T
 * @return constexpr field<T>
 */
template <class T> constexpr field<T> field<T>::tonelli_shanks_sqrt() const noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::tonelli_shanks_sqrt");
    // Tonelli-shanks algorithm begins by finding a field element Q and integer S,
    // such that (p - 1) = Q.2^{s}
    // We can determine s by counting the least significant set bit of `p - 1`
    // We pick elements `r, g` such that g = r^Q and r is not a square.
    // (the coset generators are all nonresidues and satisfy this condition)
    //
    // To find the square root of `u`, consider `v = u^(Q - 1 / 2)`
    // There exists an integer `e` where uv^2 = g^e (see Theorem 3.1 in paper).
    // If `u` is a square, `e` is even and (uvg^{−e/2})^2 = u^2v^2g^e = u^{Q+1}g^{-e} = u
    //
    // The goal of the algorithm is two fold:
    // 1. find `e` given `u`
    // 2. compute `sqrt(u) = uvg^{−e/2}`
    constexpr uint256_t Q = (modulus - 1) >> static_cast<uint64_t>(primitive_root_log_size());
    constexpr uint256_t Q_minus_one_over_two = (Q - 1) >> 1;
    field v = pow(Q_minus_one_over_two);
    field uv = operator*(v); // uv = u^{(Q + 1) / 2}
    // uvv = g^e for some unknown e. Goal is to find e.
    field uvv = uv * v; // uvv = u^{(Q - 1) / 2 + (Q + 1) / 2} = u^{Q}

    // check if t is a square with euler's criterion
    // if not, we don't have a quadratic residue and a has no square root!
    field check = uvv;
    for (size_t i = 0; i < primitive_root_log_size() - 1; ++i) {
        check.self_sqr();
    }
    if (check != 1) {
        return 0;
    }

    constexpr field g = coset_generator<0>().pow(Q);
    constexpr field g_inv = coset_generator<0>().pow(modulus - 1 - Q);
    constexpr size_t root_bits = primitive_root_log_size();
    constexpr size_t table_bits = 6;
    constexpr size_t num_tables = root_bits / table_bits + (root_bits % table_bits != 0 ? 1 : 0);
    constexpr size_t num_offset_tables = num_tables - 1;
    constexpr size_t table_size = static_cast<size_t>(1UL) << table_bits;

    using GTable = std::array<field, table_size>;
    constexpr auto get_g_table = [&](const field& h) {
        GTable result;
        result[0] = 1;
        for (size_t i = 1; i < table_size; ++i) {
            result[i] = result[i - 1] * h;
        }
        return result;
    };
    constexpr std::array<GTable, num_tables> g_tables = [&]() {
        field working_base = g_inv;
        std::array<GTable, num_tables> result;
        for (size_t i = 0; i < num_tables; ++i) {
            result[i] = get_g_table(working_base);
            for (size_t j = 0; j < table_bits; ++j) {
                working_base.self_sqr();
            }
        }
        return result;
    }();
    constexpr std::array<GTable, num_offset_tables> offset_g_tables = [&]() {
        field working_base = g_inv;
        for (size_t i = 0; i < root_bits % table_bits; ++i) {
            working_base.self_sqr();
        }
        std::array<GTable, num_offset_tables> result;
        for (size_t i = 0; i < num_offset_tables; ++i) {
            result[i] = get_g_table(working_base);
            for (size_t j = 0; j < table_bits; ++j) {
                working_base.self_sqr();
            }
        }
        return result;
    }();

    constexpr GTable root_table_a = get_g_table(g.pow(1UL << ((num_tables - 1) * table_bits)));
    constexpr GTable root_table_b = get_g_table(g.pow(1UL << (root_bits - table_bits)));
    // compute uvv^{2^table_bits}, uvv^{2^{table_bits*2}}, ..., uvv^{2^{table_bits*num_tables}}
    std::array<field, num_tables> uvv_powers;
    field base = uvv;
    for (size_t i = 0; i < num_tables - 1; ++i) {
        uvv_powers[i] = base;
        for (size_t j = 0; j < table_bits; ++j) {
            base.self_sqr();
        }
    }
    uvv_powers[num_tables - 1] = base;
    std::array<size_t, num_tables> e_slices;
    for (size_t i = 0; i < num_tables; ++i) {
        size_t table_index = num_tables - 1 - i;
        field target = uvv_powers[table_index];
        for (size_t j = 0; j < i; ++j) {
            size_t e_idx = num_tables - 1 - (i - 1) + j;
            size_t g_idx = num_tables - 2 - j;

            field g_lookup;
            if (j != i - 1) {
                g_lookup = offset_g_tables[g_idx - 1][e_slices[e_idx]]; // e1
            } else {
                g_lookup = g_tables[g_idx][e_slices[e_idx]];
            }
            target *= g_lookup;
        }
        size_t count = 0;

        if (i == 0) {
            for (auto& x : root_table_a) {
                if (x == target) {
                    break;
                }
                count += 1;
            }
        } else {
            for (auto& x : root_table_b) {
                if (x == target) {
                    break;
                }
                count += 1;
            }
        }

        ASSERT_IN_CONSTEXPR(count != table_size);
        e_slices[table_index] = count;
    }

    // We want to compute g^{-e/2} which requires computing `e/2` via our slice representation
    for (size_t i = 0; i < num_tables; ++i) {
        auto& e_slice = e_slices[num_tables - 1 - i];
        // e_slices[num_tables - 1] is always even.
        // From theorem 3.1 (https://cr.yp.to/papers/sqroot-20011123-retypeset20220327.pdf)
        // if slice is odd, propagate the downshifted bit into previous slice value
        if ((e_slice & 1UL) == 1UL) {
            size_t borrow_value = (i == 1) ? 1UL << ((root_bits % table_bits) - 1) : (1UL << (table_bits - 1));
            e_slices[num_tables - i] += borrow_value;
        }
        e_slice >>= 1;
    }

    field g_pow_minus_e_over_2 = 1;
    for (size_t i = 0; i < num_tables; ++i) {
        if (i == 0) {
            g_pow_minus_e_over_2 *= g_tables[i][e_slices[num_tables - 1 - i]];
        } else {
            g_pow_minus_e_over_2 *= offset_g_tables[i - 1][e_slices[num_tables - 1 - i]];
        }
    }
    return uv * g_pow_minus_e_over_2;
}

template <class T>
constexpr std::pair<bool, field<T>> field<T>::sqrt() const noexcept
    requires((T::modulus_0 & 0x3UL) == 0x3UL)
{
    BB_OP_COUNT_TRACK_NAME("fr::sqrt");
    constexpr uint256_t sqrt_exponent = (modulus + uint256_t(1)) >> 2;
    field root = pow(sqrt_exponent);
    if ((root * root) == (*this)) {
        return std::pair<bool, field>(true, root);
    }
    return std::pair<bool, field>(false, field::zero());
}

template <class T>
constexpr std::pair<bool, field<T>> field<T>::sqrt() const noexcept
    requires((T::modulus_0 & 0x3UL) != 0x3UL)
{
    field root = tonelli_shanks_sqrt();
    if ((root * root) == (*this)) {
        return std::pair<bool, field>(true, root);
    }
    return std::pair<bool, field>(false, field::zero());
}

template <class T> constexpr field<T> field<T>::operator/(const field& other) const noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::div");
    return operator*(other.invert());
}

template <class T> constexpr field<T>& field<T>::operator/=(const field& other) & noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::self_div");
    *this = operator/(other);
    return *this;
}

template <class T> constexpr void field<T>::self_set_msb() & noexcept
{
    data[3] = 0ULL | (1ULL << 63ULL);
}

template <class T> constexpr bool field<T>::is_msb_set() const noexcept
{
    return (data[3] >> 63ULL) == 1ULL;
}

template <class T> constexpr uint64_t field<T>::is_msb_set_word() const noexcept
{
    return (data[3] >> 63ULL);
}

template <class T> constexpr bool field<T>::is_zero() const noexcept
{
    return ((data[0] | data[1] | data[2] | data[3]) == 0) ||
           (data[0] == T::modulus_0 && data[1] == T::modulus_1 && data[2] == T::modulus_2 && data[3] == T::modulus_3);
}

template <class T> constexpr field<T> field<T>::get_root_of_unity(size_t subgroup_size) noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    field r{ T::primitive_root_0, T::primitive_root_1, T::primitive_root_2, T::primitive_root_3 };
#else
    field r{ T::primitive_root_wasm_0, T::primitive_root_wasm_1, T::primitive_root_wasm_2, T::primitive_root_wasm_3 };
#endif
    for (size_t i = primitive_root_log_size(); i > subgroup_size; --i) {
        r.self_sqr();
    }
    return r;
}

template <class T> field<T> field<T>::random_element(numeric::RNG* engine) noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::random_element");
    if (engine == nullptr) {
        engine = &numeric::get_randomness();
    }
    constexpr field pow_2_256 = field(uint256_t(1) << 128).sqr();
    field lo;
    field hi;
    lo = engine->get_random_uint256();
    hi = engine->get_random_uint256();
    return lo + (pow_2_256 * hi);
}

template <class T> constexpr size_t field<T>::primitive_root_log_size() noexcept
{
    BB_OP_COUNT_TRACK_NAME("fr::primitive_root_log_size");
    uint256_t target = modulus - 1;
    size_t result = 0;
    while (!target.get_bit(result)) {
        ++result;
    }
    return result;
}

template <class T>
constexpr std::array<field<T>, field<T>::COSET_GENERATOR_SIZE> field<T>::compute_coset_generators() noexcept
{
    constexpr size_t n = COSET_GENERATOR_SIZE;
    constexpr uint64_t subgroup_size = 1 << 30;

    std::array<field, COSET_GENERATOR_SIZE> result{ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
    if (n > 0) {
        result[0] = (multiplicative_generator());
    }
    field work_variable = multiplicative_generator() + field(1);

    size_t count = 1;
    while (count < n) {
        // work_variable contains a new field element, and we need to test that, for all previous vector
        // elements, result[i] / work_variable is not a member of our subgroup
        field work_inverse = work_variable.invert();
        bool valid = true;
        for (size_t j = 0; j < count; ++j) {
            field subgroup_check = (work_inverse * result[j]).pow(subgroup_size);
            if (subgroup_check == field(1)) {
                valid = false;
                break;
            }
        }
        if (valid) {
            result[count] = (work_variable);
            ++count;
        }
        work_variable += field(1);
    }
    return result;
}

template <class T> constexpr field<T> field<T>::multiplicative_generator() noexcept
{
    field target(1);
    uint256_t p_minus_one_over_two = (modulus - 1) >> 1;
    bool found = false;
    while (!found) {
        target += field(1);
        found = (target.pow(p_minus_one_over_two) == -field(1));
    }
    return target;
}

// This function is used to serialize a field. It matches the old serialization format by first
// converting the field from Montgomery form, which is a special representation used for efficient
// modular arithmetic.
template <class Params> void field<Params>::msgpack_pack(auto& packer) const
{
    // The field is first converted from Montgomery form, similar to how the old format did it.
    auto adjusted = from_montgomery_form();

    // The data is then converted to big endian format using htonll, which stands for "host to network long
    // long". This is necessary because the data will be written to a raw msgpack buffer, which requires big
    // endian format.
    uint64_t bin_data[4] = {
        htonll(adjusted.data[3]), htonll(adjusted.data[2]), htonll(adjusted.data[1]), htonll(adjusted.data[0])
    };

    // The packer is then used to write the binary data to the buffer, just like in the old format.
    packer.pack_bin(sizeof(bin_data));
    packer.pack_bin_body((const char*)bin_data, sizeof(bin_data)); // NOLINT
}

// This function is used to deserialize a field. It also matches the old deserialization format by
// reading the binary data as big endian uint64_t's, correcting them to the host endianness, and
// then converting the field back to Montgomery form.
template <class Params> void field<Params>::msgpack_unpack(auto o)
{
    // The binary data is first extracted from the msgpack object.
    std::array<uint8_t, sizeof(data)> raw_data = o;

    // The binary data is then read as big endian uint64_t's. This is done by casting the raw data to uint64_t*
    // and then using ntohll ("network to host long long") to correct the endianness to the host's endianness.
    uint64_t* cast_data = (uint64_t*)&raw_data[0]; // NOLINT
    uint64_t reversed[] = { ntohll(cast_data[3]), ntohll(cast_data[2]), ntohll(cast_data[1]), ntohll(cast_data[0]) };

    // The corrected data is then copied back into the field's data array.
    for (int i = 0; i < 4; i++) {
        data[i] = reversed[i];
    }

    // Finally, the field is converted back to Montgomery form, just like in the old format.
    *this = to_montgomery_form();
}

} // namespace bb

// clang-format off
// NOLINTEND(cppcoreguidelines-avoid-c-arrays)
// clang-format on
