// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Nishat], commit: 94f596f8b3bbbc216f9ad7dc33253256141156b2 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "polynomial.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/numeric/bitop/pow.hpp"
#include "barretenberg/polynomials/backing_memory.hpp"
#include "barretenberg/polynomials/shared_shifted_virtual_zeroes_array.hpp"
#include "polynomial_arithmetic.hpp"
#include <cstddef>
#include <fcntl.h>
#include <list>
#include <memory>
#include <mutex>
#include <span>
#include <sys/stat.h>
#include <type_traits>
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
    BackingMemory<Fr> backing_clone = BackingMemory<Fr>::allocate(expanded_size);
    // zero any left extensions to the array
    memset(static_cast<void*>(backing_clone.raw_data), 0, sizeof(Fr) * left_expansion);
    // copy our cloned array over
    memcpy(static_cast<void*>(backing_clone.raw_data + left_expansion),
           static_cast<const void*>(array.data()),
           sizeof(Fr) * array.size());
    // zero any right extensions to the array
    memset(static_cast<void*>(backing_clone.raw_data + left_expansion + array.size()), 0, sizeof(Fr) * right_expansion);
    return {
        array.start_ - left_expansion, array.end_ + right_expansion, array.virtual_size_, std::move(backing_clone)
    };
}

template <typename Fr>
void Polynomial<Fr>::allocate_backing_memory(size_t size, size_t virtual_size, size_t start_index)
{
    BB_BENCH_NAME("Polynomial::allocate_backing_memory");
    BB_ASSERT_LTE(start_index + size, virtual_size);
    coefficients_ = SharedShiftedVirtualZeroesArray<Fr>{
        start_index,        /* start index, used for shifted polynomials and offset 'islands' of non-zeroes */
        size + start_index, /* end index, actual memory used is (end - start) */
        virtual_size,       /* virtual size, i.e. until what size do we conceptually have zeroes */
        BackingMemory<Fr>::allocate(size)
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
template <typename Fr> Polynomial<Fr>::Polynomial(size_t size, size_t virtual_size, size_t start_index)
{
    BB_BENCH_NAME("Polynomial::Polynomial(size_t, size_t, size_t)");
    allocate_backing_memory(size, virtual_size, start_index);

    parallel_for([&](const ThreadChunk& chunk) {
        auto range = chunk.range(size);
        if (!range.empty()) {
            size_t start = *range.begin();
            size_t range_size = range.size();
            BB_ASSERT(start < size || size == 0);
            BB_ASSERT_LTE((start + range_size), size);
            memset(static_cast<void*>(coefficients_.data() + start), 0, sizeof(Fr) * range_size);
        }
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
Polynomial<Fr>::Polynomial(size_t size, size_t virtual_size, size_t start_index, [[maybe_unused]] DontZeroMemory flag)
{
    allocate_backing_memory(size, virtual_size, start_index);
}

template <typename Fr>
Polynomial<Fr>::Polynomial(const Polynomial<Fr>& other)
    : Polynomial<Fr>(other, other.size())
{}

// fully copying "expensive" constructor
template <typename Fr> Polynomial<Fr>::Polynomial(const Polynomial<Fr>& other, const size_t target_size)
{
    BB_ASSERT_LTE(other.size(), target_size);
    coefficients_ = _clone(other.coefficients_, target_size - other.size());
}

// interpolation constructor
template <typename Fr>
Polynomial<Fr>::Polynomial(std::span<const Fr> interpolation_points,
                           std::span<const Fr> evaluations,
                           size_t virtual_size)
    : Polynomial(interpolation_points.size(), virtual_size)
{
    BB_ASSERT_GT(coefficients_.size(), static_cast<size_t>(0));
    // compute_efficient_interpolation indexes evaluations by interpolation_points.size()
    BB_ASSERT_EQ(interpolation_points.size(), evaluations.size());

    polynomial_arithmetic::compute_efficient_interpolation(
        evaluations.data(), coefficients_.data(), interpolation_points.data(), coefficients_.size());
}

template <typename Fr> Polynomial<Fr>::Polynomial(std::span<const Fr> coefficients, size_t virtual_size)
{
    allocate_backing_memory(coefficients.size(), virtual_size, 0);

    memcpy(static_cast<void*>(data()), static_cast<const void*>(coefficients.data()), sizeof(Fr) * coefficients.size());
}

// Assignments

// full copy "expensive" assignment
template <typename Fr> Polynomial<Fr>& Polynomial<Fr>::operator=(const Polynomial<Fr>& other)
{
    if (this == &other) {
        return *this;
    }
    coefficients_ = _clone(other.coefficients_);
    return *this;
}

template <typename Fr> Polynomial<Fr> Polynomial<Fr>::share() const
{
    Polynomial p;
    p.coefficients_ = coefficients_;
    return p;
}

template <typename Fr> bool Polynomial<Fr>::operator==(Polynomial const& rhs) const
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

template <typename Fr> Fr Polynomial<Fr>::evaluate(const Fr& z) const
{
    // Evaluate only the backing data; virtual zeroes beyond backing contribute nothing.
    // When start_index > 0, multiply by z^start_index to account for the offset.
    Fr result = polynomial_arithmetic::evaluate(data(), z, size());
    if (start_index() > 0) {
        result *= z.pow(start_index());
    }
    return result;
}

template <typename Fr> Fr Polynomial<Fr>::evaluate_mle(std::span<const Fr> evaluation_points, bool shift) const
{
    return _evaluate_mle(evaluation_points, coefficients_, shift);
}

template <typename Fr> Polynomial<Fr> Polynomial<Fr>::create_non_parallel_zero_init(size_t size, size_t virtual_size)
{
    Polynomial p(size, virtual_size, Polynomial<Fr>::DontZeroMemory::FLAG);
    memset(static_cast<void*>(p.coefficients_.data()), 0, sizeof(Fr) * size);
    return p;
}

template <typename Fr> void Polynomial<Fr>::shrink_end_index(const size_t new_end_index)
{
    BB_ASSERT_LTE(new_end_index, end_index());
    // Without this lower-bound check, end_ < start_ would silently underflow size().
    BB_ASSERT_GTE(new_end_index, start_index());
    coefficients_.end_ = new_end_index;
}

template <typename Fr> Polynomial<Fr> Polynomial<Fr>::full() const
{
    Polynomial result;
    // Make 0..virtual_size usable
    result.coefficients_ = _clone(coefficients_, virtual_size() - end_index(), start_index());
    return result;
}

// add_scaled / add_scaled_chunk are defined inline in polynomial.hpp so
// that callers (including the V8/TurboFan-jitted WASM bench) can inline
// them and avoid a real WASM function-call boundary that V8 would not
// otherwise elide.

template <typename Fr> Polynomial<Fr> Polynomial<Fr>::shifted() const
{
    BB_ASSERT_GTE(coefficients_.start_, static_cast<size_t>(1));
    Polynomial result;
    result.coefficients_ = coefficients_;
    result.coefficients_.start_ -= 1;
    result.coefficients_.end_ -= 1;
    return result;
}

template <typename Fr> Polynomial<Fr> Polynomial<Fr>::reverse() const
{
    const size_t end_index = this->end_index();
    const size_t start_index = this->start_index();
    const size_t poly_size = this->size();
    Polynomial reversed(/*size=*/poly_size, /*virtual_size=*/end_index);
    for (size_t idx = end_index; idx > start_index; --idx) {
        reversed.at(end_index - idx) = this->at(idx - 1);
    }
    return reversed;
}

template <typename Fr>
void add_scaled_batch(Polynomial<Fr>& dst,
                      std::span<const PolynomialSpan<const Fr>> sources,
                      std::span<const Fr> scalars)
{
    BB_BENCH_NAME("add_scaled_batch");
    BB_ASSERT_EQ(sources.size(), scalars.size(), "sources and scalars must have the same length");
    if (sources.empty()) {
        return;
    }

    size_t min_start = sources[0].start_index;
    size_t max_end = sources[0].end_index();
    for (size_t i = 1; i < sources.size(); ++i) {
        min_start = std::min(min_start, sources[i].start_index);
        max_end = std::max(max_end, sources[i].end_index());
    }
    BB_ASSERT_LTE(dst.start_index(), min_start);
    BB_ASSERT_GTE(dst.end_index(), max_end);

    const size_t union_size = max_end - min_start;
    parallel_for([&](const ThreadChunk& chunk) {
        BB_BENCH_TRACY_NAME("add_scaled_batch/chunk");
        auto chunk_indices = chunk.range(union_size, min_start);
        if (chunk_indices.empty()) {
            return;
        }
        auto chunk_start = chunk_indices.front();
        auto chunk_end = chunk_indices.back();

        for (size_t k = 0; k < sources.size(); ++k) {
            const auto& src = sources[k];
            const Fr& c = scalars[k];
            const size_t src_start = src.start_index;
            const size_t src_end = src.end_index();

            const size_t idx_start = std::max(chunk_start, src_start);
            const size_t idx_end = std::min(chunk_end + 1, src_end);

            for (size_t i = idx_start; i < idx_end; ++i) {
                dst.at(i) += c * src[i];
            }
        }
    });
}

template class Polynomial<bb::fr>;
template class Polynomial<grumpkin::fr>;
template void add_scaled_batch<bb::fr>(Polynomial<bb::fr>& dst,
                                       std::span<const PolynomialSpan<const bb::fr>> sources,
                                       std::span<const bb::fr> scalars);
template void add_scaled_batch<grumpkin::fr>(Polynomial<grumpkin::fr>& dst,
                                             std::span<const PolynomialSpan<const grumpkin::fr>> sources,
                                             std::span<const grumpkin::fr> scalars);
} // namespace bb
