// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "polynomial.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/slab_allocator.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/numeric/bitop/pow.hpp"
#include "barretenberg/polynomials/shared_shifted_virtual_zeroes_array.hpp"
#include "polynomial_arithmetic.hpp"
#include <cstddef>
#include <fcntl.h>
#include <list>
#include <memory>
#include <mutex>
#include <span>
#include <sys/stat.h>
#include <unordered_map>
#include <utility>

namespace bb {

// Note: This function is pretty gnarly, but we try to make it the only function that deals
// with copying polynomials. It should be scrutinized thusly.
template <typename Fr>
SharedShiftedVirtualZeroesArray<Fr> _clone(const SharedShiftedVirtualZeroesArray<Fr>& array,
                                           size_t right_expansion = 0,
                                           size_t left_expansion = 0)
{
    size_t expanded_size = array.size() + right_expansion + left_expansion;
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    std::shared_ptr<Fr[]> backing_clone = _allocate_aligned_memory<Fr>(expanded_size);
    // zero any left extensions to the array
    memset(static_cast<void*>(backing_clone.get()), 0, sizeof(Fr) * left_expansion);
    // copy our cloned array over
    memcpy(static_cast<void*>(backing_clone.get() + left_expansion),
           static_cast<const void*>(array.backing_memory_.get()),
           sizeof(Fr) * array.size());
    // zero any right extensions to the array
    memset(static_cast<void*>(backing_clone.get() + left_expansion + array.size()), 0, sizeof(Fr) * right_expansion);
    return { array.start_ - left_expansion, array.end_ + right_expansion, array.virtual_size_, backing_clone };
}

template <typename Fr>
void MemoryPolynomial<Fr>::allocate_backing_memory(size_t size, size_t virtual_size, size_t start_index)
{
    BB_ASSERT_LTE(start_index + size, virtual_size);
    coefficients_ = SharedShiftedVirtualZeroesArray<Fr>{
        start_index,        /* start index, used for shifted polynomials and offset 'islands' of non-zeroes */
        size + start_index, /* end index, actual memory used is (end - start) */
        virtual_size,       /* virtual size, i.e. until what size do we conceptually have zeroes */
        _allocate_aligned_memory<Fr>(size)
    };
}

/**
 * Constructors / Destructors
 **/

/**
 * @brief Initialize a Polynomial to size 'size', zeroing memory.
 *
 * @param size The size of the polynomial.
 */
template <typename Fr> MemoryPolynomial<Fr>::MemoryPolynomial(size_t size, size_t virtual_size, size_t start_index)
{
    PROFILE_THIS_NAME("polynomial allocation with zeroing");

    allocate_backing_memory(size, virtual_size, start_index);

    size_t num_threads = calculate_num_threads(size);
    size_t range_per_thread = size / num_threads;
    size_t leftovers = size - (range_per_thread * num_threads);

    parallel_for(num_threads, [&](size_t j) {
        size_t offset = j * range_per_thread;
        size_t range = (j == num_threads - 1) ? range_per_thread + leftovers : range_per_thread;
        ASSERT(offset < size || size == 0);
        BB_ASSERT_LTE((offset + range), size);
        memset(static_cast<void*>(coefficients_.backing_memory_.get() + offset), 0, sizeof(Fr) * range);
    });
}

/**
 * @brief Initialize a Polynomial to size 'size'.
 * Important: This does NOT zero memory.
 *
 * @param size The initial size of the polynomial.
 * @param flag Signals that we do not zero memory.
 */
template <typename Fr>
MemoryPolynomial<Fr>::MemoryPolynomial(size_t size, size_t virtual_size, size_t start_index, [[maybe_unused]] DontZeroMemory flag)
{
    PROFILE_THIS_NAME("polynomial allocation without zeroing");
    allocate_backing_memory(size, virtual_size, start_index);
}

template <typename Fr>
MemoryPolynomial<Fr>::MemoryPolynomial(const MemoryPolynomial<Fr>& other)
    : MemoryPolynomial<Fr>(other, other.size())
{}

// fully copying "expensive" constructor
template <typename Fr> MemoryPolynomial<Fr>::MemoryPolynomial(const MemoryPolynomial<Fr>& other, const size_t target_size)
{
    BB_ASSERT_LTE(other.size(), target_size);
    coefficients_ = _clone(other.coefficients_, target_size - other.size());
}

// interpolation constructor
template <typename Fr>
MemoryPolynomial<Fr>::MemoryPolynomial(std::span<const Fr> interpolation_points,
                           std::span<const Fr> evaluations,
                           size_t virtual_size)
    : MemoryPolynomial(interpolation_points.size(), virtual_size)
{
    BB_ASSERT_GT(coefficients_.size(), static_cast<size_t>(0));

    polynomial_arithmetic::compute_efficient_interpolation(
        evaluations.data(), coefficients_.data(), interpolation_points.data(), coefficients_.size());
}

template <typename Fr> MemoryPolynomial<Fr>::MemoryPolynomial(std::span<const Fr> coefficients, size_t virtual_size)
{
    allocate_backing_memory(coefficients.size(), virtual_size, 0);

    memcpy(static_cast<void*>(data()), static_cast<const void*>(coefficients.data()), sizeof(Fr) * coefficients.size());
}

// Assignments

// full copy "expensive" assignment
template <typename Fr> MemoryPolynomial<Fr>& MemoryPolynomial<Fr>::operator=(const MemoryPolynomial<Fr>& other)
{
    if (this == &other) {
        return *this;
    }
    coefficients_ = _clone(other.coefficients_);
    return *this;
}

template <typename Fr> MemoryPolynomial<Fr> MemoryPolynomial<Fr>::share() const
{
    MemoryPolynomial p;
    p.coefficients_ = coefficients_;
    return p;
}

template <typename Fr> bool MemoryPolynomial<Fr>::operator==(MemoryPolynomial const& rhs) const
{
    // If either is empty, both must be
    if (is_empty() || rhs.is_empty()) {
        return is_empty() && rhs.is_empty();
    }
    // Size must agree
    if (virtual_size() != rhs.virtual_size()) {
        return false;
    }
    // Each coefficient must agree
    for (size_t i = std::min(coefficients_.start_, rhs.coefficients_.start_);
         i < std::max(coefficients_.end_, rhs.coefficients_.end_);
         i++) {
        if (coefficients_.get(i) != rhs.coefficients_.get(i)) {
            return false;
        }
    }
    return true;
}

template <typename Fr> MemoryPolynomial<Fr>& MemoryPolynomial<Fr>::operator+=(PolynomialSpan<const Fr> other)
{
    BB_ASSERT_LTE(start_index(), other.start_index);
    BB_ASSERT_GTE(end_index(), other.end_index());
    size_t num_threads = calculate_num_threads(other.size());
    size_t range_per_thread = other.size() / num_threads;
    size_t leftovers = other.size() - (range_per_thread * num_threads);
    parallel_for(num_threads, [&](size_t j) {
        size_t offset = j * range_per_thread + other.start_index;
        size_t end = (j == num_threads - 1) ? offset + range_per_thread + leftovers : offset + range_per_thread;
        for (size_t i = offset; i < end; ++i) {
            at(i) += other[i];
        }
    });
    return *this;
}

template <typename Fr> Fr MemoryPolynomial<Fr>::evaluate(const Fr& z, const size_t target_size) const
{
    return polynomial_arithmetic::evaluate(data(), z, target_size);
}

template <typename Fr> Fr MemoryPolynomial<Fr>::evaluate(const Fr& z) const
{
    return polynomial_arithmetic::evaluate(data(), z, size());
}

template <typename Fr> Fr MemoryPolynomial<Fr>::evaluate_mle(std::span<const Fr> evaluation_points, bool shift) const
{
    return _evaluate_mle(evaluation_points, coefficients_, shift);
}

template <typename Fr> MemoryPolynomial<Fr> MemoryPolynomial<Fr>::partial_evaluate_mle(std::span<const Fr> evaluation_points) const
{
    // Get size of partial evaluation point u = (u_0,...,u_{m-1})
    const size_t m = evaluation_points.size();

    // Assert that the size of the Polynomial being evaluated is a power of 2 greater than (1 << m)
    ASSERT(numeric::is_power_of_two(size()));
    BB_ASSERT_GTE(size(), static_cast<size_t>(1 << m));
    size_t n = numeric::get_msb(size());

    // Partial evaluation is done in m rounds l = 0,...,m-1. At the end of round l, the Polynomial has been
    // partially evaluated at u_{m-l-1}, ..., u_{m-1} in variables X_{n-l-1}, ..., X_{n-1}. The size of this
    // Polynomial is n_l.
    size_t n_l = 1 << (n - 1);

    // Temporary buffer of half the size of the Polynomial
    MemoryPolynomial<Fr> intermediate(n_l, n_l, DontZeroMemory::FLAG);

    // Evaluate variable X_{n-1} at u_{m-1}
    Fr u_l = evaluation_points[m - 1];

    for (size_t i = 0; i < n_l; i++) {
        // Initiate our intermediate results using this Polynomial.
        intermediate.at(i) = get(i) + u_l * (get(i + n_l) - get(i));
    }
    // Evaluate m-1 variables X_{n-l-1}, ..., X_{n-2} at m-1 remaining values u_0,...,u_{m-2})
    for (size_t l = 1; l < m; ++l) {
        n_l = 1 << (n - l - 1);
        u_l = evaluation_points[m - l - 1];
        for (size_t i = 0; i < n_l; ++i) {
            intermediate.at(i) = intermediate[i] + u_l * (intermediate[i + n_l] - intermediate[i]);
        }
    }

    // Construct resulting Polynomial g(X_0,…,X_{n-m-1})) = p(X_0,…,X_{n-m-1},u_0,...u_{m-1}) from buffer
    MemoryPolynomial<Fr> result(n_l, n_l, DontZeroMemory::FLAG);
    for (size_t idx = 0; idx < n_l; ++idx) {
        result.at(idx) = intermediate[idx];
    }

    return result;
}

template <typename Fr>
Fr MemoryPolynomial<Fr>::compute_kate_opening_coefficients(const Fr& z)
    requires polynomial_arithmetic::SupportsFFT<Fr>
{
    return polynomial_arithmetic::compute_kate_opening_coefficients(data(), data(), z, size());
}

template <typename Fr>
Fr MemoryPolynomial<Fr>::compute_barycentric_evaluation(const Fr& z, const EvaluationDomain<Fr>& domain)
    requires polynomial_arithmetic::SupportsFFT<Fr>
{
    return polynomial_arithmetic::compute_barycentric_evaluation(data(), domain.size, z, domain);
}

template <typename Fr> MemoryPolynomial<Fr>& MemoryPolynomial<Fr>::operator-=(PolynomialSpan<const Fr> other)
{
    BB_ASSERT_LTE(start_index(), other.start_index);
    BB_ASSERT_GTE(end_index(), other.end_index());
    const size_t num_threads = calculate_num_threads(other.size());
    const size_t range_per_thread = other.size() / num_threads;
    const size_t leftovers = other.size() - (range_per_thread * num_threads);
    parallel_for(num_threads, [&](size_t j) {
        const size_t offset = j * range_per_thread + other.start_index;
        const size_t end = (j == num_threads - 1) ? offset + range_per_thread + leftovers : offset + range_per_thread;
        for (size_t i = offset; i < end; ++i) {
            at(i) -= other[i];
        }
    });
    return *this;
}

template <typename Fr> MemoryPolynomial<Fr>& MemoryPolynomial<Fr>::operator*=(const Fr scaling_factor)
{
    const size_t num_threads = calculate_num_threads(size());
    const size_t range_per_thread = size() / num_threads;
    const size_t leftovers = size() - (range_per_thread * num_threads);
    parallel_for(num_threads, [&](size_t j) {
        const size_t offset = j * range_per_thread;
        const size_t end = (j == num_threads - 1) ? offset + range_per_thread + leftovers : offset + range_per_thread;
        for (size_t i = offset; i < end; ++i) {
            data()[i] *= scaling_factor;
        }
    });

    return *this;
}

template <typename Fr> MemoryPolynomial<Fr> MemoryPolynomial<Fr>::create_non_parallel_zero_init(size_t size, size_t virtual_size)
{
    MemoryPolynomial p(size, virtual_size, MemoryPolynomial<Fr>::DontZeroMemory::FLAG);
    memset(static_cast<void*>(p.coefficients_.backing_memory_.get()), 0, sizeof(Fr) * size);
    return p;
}

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1113): Optimizing based on actual sizes would involve using
// expand, but it is currently unused.
template <typename Fr>
MemoryPolynomial<Fr> MemoryPolynomial<Fr>::expand(const size_t new_start_index, const size_t new_end_index) const
{
    BB_ASSERT_LTE(new_end_index, virtual_size());
    BB_ASSERT_LTE(new_start_index, start_index());
    BB_ASSERT_GTE(new_end_index, end_index());
    if (new_start_index == start_index() && new_end_index == end_index()) {
        return *this;
    }
    MemoryPolynomial result = *this;
    // Make new_start_index..new_end_index usable
    result.coefficients_ = _clone(coefficients_, new_end_index - end_index(), start_index() - new_start_index);
    return result;
}

template <typename Fr> void MemoryPolynomial<Fr>::shrink_end_index(const size_t new_end_index)
{
    BB_ASSERT_LTE(new_end_index, end_index());
    coefficients_.end_ = new_end_index;
}

template <typename Fr> MemoryPolynomial<Fr> MemoryPolynomial<Fr>::full() const
{
    MemoryPolynomial result = *this;
    // Make 0..virtual_size usable
    result.coefficients_ = _clone(coefficients_, virtual_size() - end_index(), start_index());
    return result;
}

template <typename Fr> void MemoryPolynomial<Fr>::add_scaled(PolynomialSpan<const Fr> other, Fr scaling_factor) &
{
    BB_ASSERT_LTE(start_index(), other.start_index);
    BB_ASSERT_GTE(end_index(), other.end_index());
    const size_t num_threads = calculate_num_threads(other.size());
    const size_t range_per_thread = other.size() / num_threads;
    const size_t leftovers = other.size() - (range_per_thread * num_threads);
    parallel_for(num_threads, [&](size_t j) {
        const size_t offset = j * range_per_thread + other.start_index;
        const size_t end = (j == num_threads - 1) ? offset + range_per_thread + leftovers : offset + range_per_thread;
        for (size_t i = offset; i < end; ++i) {
            at(i) += scaling_factor * other[i];
        }
    });
}

template <typename Fr> MemoryPolynomial<Fr> MemoryPolynomial<Fr>::shifted() const
{
    BB_ASSERT_GTE(coefficients_.start_, static_cast<size_t>(1));
    MemoryPolynomial result;
    result.coefficients_ = coefficients_;
    result.coefficients_.start_ -= 1;
    result.coefficients_.end_ -= 1;
    return result;
}

template <typename Fr> MemoryPolynomial<Fr> MemoryPolynomial<Fr>::right_shifted(const size_t magnitude) const
{
    // ensure that at least the last magnitude-many coefficients are virtual 0's
    BB_ASSERT_LTE((coefficients_.end_ + magnitude), virtual_size());
    MemoryPolynomial result;
    result.coefficients_ = coefficients_;
    result.coefficients_.start_ += magnitude;
    result.coefficients_.end_ += magnitude;
    return result;
}

template class MemoryPolynomial<bb::fr>;
template class MemoryPolynomial<grumpkin::fr>;
} // namespace bb
