#include "file_backed_polynomial.hpp"
#include "polynomial_arithmetic.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/common/assert.hpp"
#include <cstring>

// Include polynomial.hpp to get access to _evaluate_mle
#include "polynomial.hpp"


namespace bb {



template <typename Fr>
void FileBackedPolynomial<Fr>::allocate_backing_memory(size_t size, size_t virtual_size, size_t start_index)
{
    ASSERT(start_index + size <= virtual_size);
    coefficients_ = FileBackedShiftedVirtualZeroesArray<Fr>(
        start_index,        /* start index */
        size + start_index, /* end index */
        virtual_size        /* virtual size */
    );
}

// Constructor with zeroing
template <typename Fr>
FileBackedPolynomial<Fr>::FileBackedPolynomial(size_t size, size_t virtual_size, size_t start_index)
{
    allocate_backing_memory(size, virtual_size, start_index);
    
    // Parallel zero initialization
    size_t num_threads = calculate_num_threads(size);
    size_t range_per_thread = size / num_threads;
    size_t leftovers = size - (range_per_thread * num_threads);
    
    parallel_for(num_threads, [&](size_t j) {
        size_t offset = j * range_per_thread;
        size_t range = (j == num_threads - 1) ? range_per_thread + leftovers : range_per_thread;
        memset(static_cast<void*>(coefficients_.data() + offset), 0, sizeof(Fr) * range);
    });
}

// Constructor without zeroing
template <typename Fr>
FileBackedPolynomial<Fr>::FileBackedPolynomial(size_t size, size_t virtual_size, size_t start_index, DontZeroMemory)
{
    allocate_backing_memory(size, virtual_size, start_index);
}

// Copy constructor
template <typename Fr>
FileBackedPolynomial<Fr>::FileBackedPolynomial(const FileBackedPolynomial<Fr>& other)
    : FileBackedPolynomial(other, other.size())
{
}

// Copy constructor with resize
template <typename Fr>
FileBackedPolynomial<Fr>::FileBackedPolynomial(const FileBackedPolynomial<Fr>& other, size_t target_size)
{
    BB_ASSERT_LTE(other.size(), target_size);
    coefficients_ = _clone_file_backed(other.coefficients_, target_size - other.size());
}

// Constructor from span
template <typename Fr>
FileBackedPolynomial<Fr>::FileBackedPolynomial(std::span<const Fr> coefficients, size_t virtual_size)
{
    allocate_backing_memory(coefficients.size(), virtual_size, 0);
    memcpy(static_cast<void*>(data()), static_cast<const void*>(coefficients.data()), sizeof(Fr) * coefficients.size());
}

// Interpolation constructor
template <typename Fr>
FileBackedPolynomial<Fr>::FileBackedPolynomial(std::span<const Fr> interpolation_points,
                                               std::span<const Fr> evaluations,
                                               size_t virtual_size)
    : FileBackedPolynomial(interpolation_points.size(), virtual_size)
{
    BB_ASSERT_GT(coefficients_.size(), static_cast<size_t>(0));
    polynomial_arithmetic::compute_efficient_interpolation(
        evaluations.data(), coefficients_.data(), interpolation_points.data(), coefficients_.size());
}

// Copy assignment
template <typename Fr>
FileBackedPolynomial<Fr>& FileBackedPolynomial<Fr>::operator=(const FileBackedPolynomial<Fr>& other)
{
    if (this == &other) {
        return *this;
    }
    coefficients_ = _clone_file_backed(other.coefficients_);
    return *this;
}

// Share (shallow copy)
template <typename Fr>
FileBackedPolynomial<Fr> FileBackedPolynomial<Fr>::share() const
{
    if (is_empty()) {
        // Return an empty polynomial if this one is empty
        return FileBackedPolynomial();
    }
    FileBackedPolynomial p;
    p.coefficients_ = coefficients_.share();
    // Debug: print share info
    // info("FileBackedPolynomial::share() - size=", size(), " start=", start_index(), " end=", end_index());
    return p;
}

// Is zero check
template <typename Fr>
bool FileBackedPolynomial<Fr>::is_zero() const
{
    if (is_empty()) {
        ASSERT(false);
        info("Checking is_zero on an empty FileBackedPolynomial!");
    }
    for (size_t i = 0; i < size(); i++) {
        if (coefficients_.data()[i] != 0) {
            return false;
        }
    }
    return true;
}

// Equality operator
template <typename Fr>
bool FileBackedPolynomial<Fr>::operator==(const FileBackedPolynomial& rhs) const
{
    if (is_empty() || rhs.is_empty()) {
        return is_empty() && rhs.is_empty();
    }
    if (virtual_size() != rhs.virtual_size()) {
        return false;
    }
    for (size_t i = std::min(coefficients_.start_, rhs.coefficients_.start_);
         i < std::max(coefficients_.end_, rhs.coefficients_.end_);
         i++) {
        if (coefficients_.get(i) != rhs.coefficients_.get(i)) {
            return false;
        }
    }
    return true;
}

// Shifted (left shift by 1)
template <typename Fr>
FileBackedPolynomial<Fr> FileBackedPolynomial<Fr>::shifted() const
{
    BB_ASSERT_GTE(coefficients_.start_, static_cast<size_t>(1));
    FileBackedPolynomial result;
    result.coefficients_ = coefficients_.share();
    result.coefficients_.start_ -= 1;
    result.coefficients_.end_ -= 1;
    return result;
}

// Right shifted
template <typename Fr>
FileBackedPolynomial<Fr> FileBackedPolynomial<Fr>::right_shifted(size_t magnitude) const
{
    BB_ASSERT_LTE((coefficients_.end_ + magnitude), virtual_size());
    FileBackedPolynomial result;
    result.coefficients_ = coefficients_.share();
    result.coefficients_.start_ += magnitude;
    result.coefficients_.end_ += magnitude;
    return result;
}

// Evaluate polynomial
template <typename Fr>
Fr FileBackedPolynomial<Fr>::evaluate(const Fr& z, size_t target_size) const
{
    return polynomial_arithmetic::evaluate(data(), z, target_size);
}

template <typename Fr>
Fr FileBackedPolynomial<Fr>::evaluate(const Fr& z) const
{
    return polynomial_arithmetic::evaluate(data(), z, size());
}

// Add scaled
template <typename Fr>
void FileBackedPolynomial<Fr>::add_scaled(PolynomialSpan<const Fr> other, Fr scaling_factor) &
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

// Operator +=
template <typename Fr>
FileBackedPolynomial<Fr>& FileBackedPolynomial<Fr>::operator+=(PolynomialSpan<const Fr> other)
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

// Operator -=
template <typename Fr>
FileBackedPolynomial<Fr>& FileBackedPolynomial<Fr>::operator-=(PolynomialSpan<const Fr> other)
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

// Operator *=
template <typename Fr>
FileBackedPolynomial<Fr>& FileBackedPolynomial<Fr>::operator*=(Fr scaling_factor)
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

// Mask
template <typename Fr>
void FileBackedPolynomial<Fr>::mask()
{
    BB_ASSERT_GTE(virtual_size(), NUM_MASKED_ROWS);
    BB_ASSERT_EQ(virtual_size(), end_index());
    
    for (size_t i = virtual_size() - NUM_MASKED_ROWS; i < virtual_size(); ++i) {
        at(i) = Fr::random_element();
    }
}

// Random polynomial
template <typename Fr>
FileBackedPolynomial<Fr> FileBackedPolynomial<Fr>::random(size_t size, size_t virtual_size, size_t start_index)
{
    FileBackedPolynomial p(size, virtual_size, start_index, DontZeroMemory::FLAG);
    parallel_for_heuristic(
        size,
        [&](size_t i) { p.coefficients_.data()[i] = Fr::random_element(); },
        thread_heuristics::ALWAYS_MULTITHREAD);
    return p;
}

// Expand
template <typename Fr>
FileBackedPolynomial<Fr> FileBackedPolynomial<Fr>::expand(size_t new_start_index, size_t new_end_index) const
{
    BB_ASSERT_LTE(new_end_index, virtual_size());
    BB_ASSERT_LTE(new_start_index, start_index());
    BB_ASSERT_GTE(new_end_index, end_index());
    if (new_start_index == start_index() && new_end_index == end_index()) {
        return *this;
    }
    FileBackedPolynomial result = *this;
    result.coefficients_ = _clone_file_backed(coefficients_, new_end_index - end_index(), start_index() - new_start_index);
    return result;
}

// Shrink end index
template <typename Fr>
void FileBackedPolynomial<Fr>::shrink_end_index(size_t new_end_index)
{
    BB_ASSERT_LTE(new_end_index, end_index());
    coefficients_.end_ = new_end_index;
}

// Full
template <typename Fr>
FileBackedPolynomial<Fr> FileBackedPolynomial<Fr>::full() const
{
    FileBackedPolynomial result = *this;
    result.coefficients_ = _clone_file_backed(coefficients_, virtual_size() - end_index(), start_index());
    return result;
}

// Convert to heap polynomial
#ifndef POLYNOMIAL_CONVERSION_DISABLED
template <typename Fr>
Polynomial<Fr> FileBackedPolynomial<Fr>::to_buffer() const
{
    if (is_empty()) {
        return Polynomial<Fr>();
    }
    
    Polynomial<Fr> result(size(), virtual_size(), start_index());
    memcpy(result.data(), data(), size() * sizeof(Fr));
    return result;
}
#endif

// MLE evaluation
template <typename Fr>
Fr FileBackedPolynomial<Fr>::evaluate_mle(std::span<const Fr> evaluation_points, bool shift) const
{
#ifndef POLYNOMIAL_CONVERSION_DISABLED
    // TODO: Implement _evaluate_mle for file-backed arrays
    // For now, convert to buffer
    return to_buffer().evaluate_mle(evaluation_points, shift);
#else
    // Direct implementation for FileBackedShiftedVirtualZeroesArray
    if (coefficients_.size() == 0) {
        return Fr::zero();
    }

    const size_t n = evaluation_points.size();
    const size_t dim = numeric::get_msb(coefficients_.end_ - 1) + 1; // Round up to next power of 2

    // To simplify handling of edge cases, we assume that the index space is always a power of 2
    BB_ASSERT_EQ(coefficients_.virtual_size(), static_cast<size_t>(1 << n));

    // We first fold over dim rounds l = 0,...,dim-1.
    // in round l, n_l is the size of the buffer containing the Polynomial partially evaluated
    // at u₀,..., u_l.
    // In round 0, this is half the size of dim
    size_t n_l = 1 << (dim - 1);

    // temporary buffer of half the size of the Polynomial
    auto tmp_ptr = _allocate_aligned_memory<Fr>(sizeof(Fr) * n_l);
    auto tmp = tmp_ptr.get();

    size_t offset = 0;
    if (shift) {
        BB_ASSERT_EQ(coefficients_.get(0), Fr::zero());
        offset++;
    }

    Fr u_l = evaluation_points[0];

    // Note below: i * 2 + 1 + offset might equal virtual_size. This used to subtlely be handled by extra capacity
    // padding (and there used to be no assert time checks, which this constant helps with).
    const size_t ALLOW_ONE_PAST_READ = 1;
    for (size_t i = 0; i < n_l; ++i) {
        // curr[i] = (Fr(1) - u_l) * prev[i * 2] + u_l * prev[(i * 2) + 1];
        tmp[i] = coefficients_.get(i * 2 + offset) +
                 u_l * (coefficients_.get(i * 2 + 1 + offset, ALLOW_ONE_PAST_READ) - coefficients_.get(i * 2 + offset));
    }

    // partially evaluate the dim-1 remaining points
    for (size_t l = 1; l < dim; ++l) {
        n_l = 1 << (dim - l - 1);
        u_l = evaluation_points[l];
        for (size_t i = 0; i < n_l; ++i) {
            tmp[i] = tmp[i * 2] + u_l * (tmp[(i * 2) + 1] - tmp[i * 2]);
        }
    }
    auto result = tmp[0];

    return result;
#endif
}

// Partial MLE evaluation
template <typename Fr>
FileBackedPolynomial<Fr> FileBackedPolynomial<Fr>::partial_evaluate_mle(std::span<const Fr> evaluation_points) const
{
#ifndef POLYNOMIAL_CONVERSION_DISABLED
    // TODO: Implement directly for file-backed
    // For now, convert to buffer and back
    auto result_buffer = to_buffer().partial_evaluate_mle(evaluation_points);
    return FileBackedPolynomial<Fr>(std::span<const Fr>(result_buffer.data(), result_buffer.size()), 
                                   result_buffer.virtual_size());
#else
    // TODO: Implement direct partial_evaluate_mle for FileBackedPolynomial
    (void)evaluation_points; // Suppress unused parameter warning
    throw std::runtime_error("partial_evaluate_mle not yet implemented for BB_SLOW_LOW_MEMORY mode");
#endif
}

// Factor roots
template <typename Fr>
void FileBackedPolynomial<Fr>::factor_roots(const Fr& root)
{
    polynomial_arithmetic::factor_roots(coeffs(), root);
}

// Barycentric evaluation
template <typename Fr>
Fr FileBackedPolynomial<Fr>::compute_barycentric_evaluation(const Fr& z, const EvaluationDomain<Fr>& domain)
    requires polynomial_arithmetic::SupportsFFT<Fr>
{
    return polynomial_arithmetic::compute_barycentric_evaluation(data(), domain.size, z, domain);
}

// Kate opening coefficients
template <typename Fr>
Fr FileBackedPolynomial<Fr>::compute_kate_opening_coefficients(const Fr& z)
    requires polynomial_arithmetic::SupportsFFT<Fr>
{
    return polynomial_arithmetic::compute_kate_opening_coefficients(data(), data(), z, size());
}

// Explicit instantiation
template class FileBackedPolynomial<bb::fr>;
template class FileBackedPolynomial<grumpkin::fr>;

} // namespace bb