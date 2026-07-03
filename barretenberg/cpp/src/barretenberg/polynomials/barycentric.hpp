// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Nishat], commit: 94f596f8b3bbbc216f9ad7dc33253256141156b2 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/fields/field.hpp"
#include <array>

namespace bb {

/**
 * @brief Helper to determine whether input is bb::field type
 * @details Needed before BarycentricDataFunctions so that batch_invert can branch on it.
 *
 * @tparam T
 */
template <typename T> struct is_field_type {
    static constexpr bool value = false;
};

template <typename Params> struct is_field_type<bb::field<Params>> {
    static constexpr bool value = true;
};

template <typename T> inline constexpr bool is_field_type_v = is_field_type<T>::value;

/**
 * @brief Shared computation logic for barycentric extension and evaluation data.
 * @details All methods are constexpr. For native field types (bb::field) they are evaluated at compile time;
 * for non-constexpr types (e.g. stdlib field_t) the constexpr qualifier is silently ignored and they execute at
 * runtime. The two thin wrapper classes (BarycentricDataCompileTime, BarycentricDataRunTime) inherit these methods
 * and only differ in how they declare their static data members (static constexpr vs inline static const).
 *
 * @tparam domain_end specifies the given evaluation domain {0,..., domain_end - 1}
 * @tparam num_evals the number of evaluations that are computable with specific barycentric extension formula
 * IMPROVEMENT : Can use lookup tables to optimize the computations.
 */
template <class Fr, size_t domain_end, size_t num_evals> class BarycentricDataFunctions {
  public:
    static constexpr size_t domain_size = domain_end;
    static constexpr size_t big_domain_size = std::max(domain_size, num_evals);

    static_assert(domain_size > 0, "BarycentricData requires domain_size > 0");
    static_assert(num_evals > 0, "BarycentricData requires num_evals > 0");
    static_assert(num_evals >= domain_end || (!is_field_type_v<Fr> && num_evals == 1),
                  "Expected num_evals >= domain_size (or stdlib num_evals==1 special case)");

    /**
     * Static constexpr methods for computing arrays of precomputable data used for barycentric extension and evaluation
     */

    // build big_domain, currently the set of x_i in {0, ..., big_domain_size - 1 }
    static constexpr std::array<Fr, big_domain_size> construct_big_domain()
    {
        std::array<Fr, big_domain_size> result;
        for (size_t i = 0; i < big_domain_size; ++i) {
            result[i] = static_cast<Fr>(i);
        }
        return result;
    }

    // build set of lagrange_denominators d_i = \prod_{j!=i} x_i - x_j
    static constexpr std::array<Fr, domain_size> construct_lagrange_denominators(const auto& big_domain)
    {
        std::array<Fr, domain_size> result;
        for (size_t i = 0; i != domain_size; ++i) {
            result[i] = 1;
            for (size_t j = 0; j != domain_size; ++j) {
                if (j != i) {
                    result[i] *= big_domain[i] - big_domain[j];
                }
            }
        }
        return result;
    }

    // Non-constexpr helper so we can use BB_ASSERT inside the constexpr batch_invert.
    static void assert_constant(const Fr& val)
    {
        if constexpr (!is_field_type_v<Fr>) {
            BB_ASSERT(val.is_constant(), "barycentric coeffs must be constants, not witnesses");
        }
    }

    static constexpr std::array<Fr, domain_size * num_evals> batch_invert(
        const std::array<Fr, domain_size * num_evals>& coeffs)
    {
        constexpr size_t n = domain_size * num_evals;
        std::array<Fr, n> temporaries{};
        std::array<bool, n> skipped{};
        Fr accumulator = 1;
        for (size_t i = 0; i < n; ++i) {
            temporaries[i] = accumulator;
            // For native field types, == 0 is a plain constexpr comparison. For stdlib field_t,
            // operator== would create circuit constraints and return bool_t, so we use get_value()
            // to extract the underlying native value for a plain comparison instead. Note that coeffs[] are derived
            // from constants (big_domain[i] = Fr(i)) and products/differences thereof, so they are constants. This
            // makes the get_value() based zero check safe.
            bool is_zero = false;
            if constexpr (is_field_type_v<Fr>) {
                is_zero = (coeffs[i] == 0);
            } else {
                assert_constant(coeffs[i]);
                is_zero = (coeffs[i].get_value() == 0);
            }
            if (is_zero) {
                skipped[i] = true;
            } else {
                skipped[i] = false;
                accumulator *= coeffs[i];
            }
        }
        accumulator = Fr(1) / accumulator;
        std::array<Fr, n> result{};
        Fr T0;
        for (size_t i = n - 1; i < n; --i) {
            if (!skipped[i]) {
                T0 = accumulator * temporaries[i];
                accumulator *= coeffs[i];
                result[i] = T0;
            }
        }
        return result;
    }

    // for each x_k in the big domain, build set of domain size-many denominator inverses
    // 1/(d_i*(x_k - x_j)). will multiply against each of these (rather than to divide by something)
    // for each barycentric evaluation
    //
    // Storage layout: `result` has domain_size * num_evals entries, but only the block for k in
    // [domain_size, num_evals) is populated. The leading domain_size * domain_size region (k < domain_size) is
    // left at 0: consumers only index `result[k * domain_size + j]` with k >= domain_size, and `batch_invert`
    // skips zero entries, so that region is never read.
    static constexpr std::array<Fr, domain_size * num_evals> construct_denominator_inverses(
        const auto& big_domain, const auto& lagrange_denominators)
    {
        // stdlib special case: if num_evals == 1, the result is just the barycentric weights result[j] = 1 / d_j.
        // This case does not arise on the native (compile-time) path.
        if constexpr (!is_field_type_v<Fr> && num_evals == 1) {
            return batch_invert(lagrange_denominators);
        } else {
            std::array<Fr, domain_size * num_evals> result{}; // leading domain_size^2 region stays 0 (never read)
            // Used in Univariate's `extend_to` method to extend univariates given by > 4 evaluations ( deg>3 ) to a
            // bigger evaluation domain.
            for (size_t k = domain_size; k < num_evals; ++k) {
                for (size_t j = 0; j < domain_size; ++j) {
                    Fr inv = lagrange_denominators[j];
                    inv *= (big_domain[k] - big_domain[j]);
                    result[(k * domain_size) + j] = inv;
                }
            }
            return batch_invert(result);
        }
    }

    // get full numerator values
    // full numerator is M(x) = \prod_{i} (x-x_i)
    // these will be zero for i < domain_size, but that's ok because
    // at such entries we will already have the evaluations of the polynomial
    static constexpr std::array<Fr, num_evals> construct_full_numerator_values(const auto& big_domain)
    {
        std::array<Fr, num_evals> result;
        for (size_t i = 0; i != num_evals; ++i) {
            result[i] = 1;
            Fr v_i = big_domain[i];
            for (size_t j = 0; j != domain_size; ++j) {
                result[i] *= v_i - big_domain[j];
            }
        }
        return result;
    }
};

/**
 * @brief Compile-time variant: precomputed arrays are static constexpr.
 * @details Used for native field types (bb::field) where all operations are constexpr-compatible.
 */
template <class Fr, size_t domain_end, size_t num_evals>
class BarycentricDataCompileTime : public BarycentricDataFunctions<Fr, domain_end, num_evals> {
    using Base = BarycentricDataFunctions<Fr, domain_end, num_evals>;

  public:
    using Base::big_domain_size;
    using Base::domain_size;

    static constexpr auto big_domain = Base::construct_big_domain();
    static constexpr auto lagrange_denominators = Base::construct_lagrange_denominators(big_domain);
    static constexpr auto precomputed_denominator_inverses =
        Base::construct_denominator_inverses(big_domain, lagrange_denominators);
    static constexpr auto full_numerator_values = Base::construct_full_numerator_values(big_domain);
};

/**
 * @brief Run-time variant: precomputed arrays are inline static const.
 * @details Used for types whose operations are not constexpr-compatible (e.g. stdlib field_t).
 */
template <class Fr, size_t domain_end, size_t num_evals>
class BarycentricDataRunTime : public BarycentricDataFunctions<Fr, domain_end, num_evals> {
    using Base = BarycentricDataFunctions<Fr, domain_end, num_evals>;

  public:
    using Base::big_domain_size;
    using Base::domain_size;

    inline static const auto big_domain = Base::construct_big_domain();
    inline static const auto lagrange_denominators = Base::construct_lagrange_denominators(big_domain);
    inline static const auto precomputed_denominator_inverses =
        Base::construct_denominator_inverses(big_domain, lagrange_denominators);
    inline static const auto full_numerator_values = Base::construct_full_numerator_values(big_domain);
};

/**
 * @brief Exposes BarycentricData with compile time arrays if the type is bberg::field and runtime arrays otherwise
 * @details This method is also needed for stdlib field, for which the arrays are not compile time computable
 * @tparam Fr
 * @tparam domain_end
 * @tparam num_evals
 */
template <class Fr, size_t domain_end, size_t num_evals>
using BarycentricData = std::conditional_t<is_field_type_v<Fr>,
                                           BarycentricDataCompileTime<Fr, domain_end, num_evals>,
                                           BarycentricDataRunTime<Fr, domain_end, num_evals>>;

} // namespace bb
