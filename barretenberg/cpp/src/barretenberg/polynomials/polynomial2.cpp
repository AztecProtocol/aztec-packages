#include "polynomial2.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/slab_allocator.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/numeric/bitop/pow.hpp"
#include "polynomial_arithmetic.hpp"
#include <cstddef>
#include <fcntl.h>
#include <list>
#include <memory>
#include <mutex>
#include <sys/stat.h>
#include <unordered_map>
#include <utility>

namespace bb {

// NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
template <typename Fr> std::shared_ptr<Fr[]> _allocate_aligned_memory(size_t n_elements)
{
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    return std::static_pointer_cast<Fr[]>(get_mem_slab(sizeof(Fr) * n_elements));
}

template <typename Fr> void Polynomial2<Fr>::allocate_backing_memory(size_t size, size_t virtual_size)
{
    coefficients_ = SharedShiftedVirtualZeroesArray<Fr>{
        size,                              /* actual memory size */
        virtual_size,                      /* virtual size, i.e. until what size do we conceptually have zeroes */
        0,                                 /* shift, initially 0 */
        _allocate_aligned_memory<Fr>(size) /* our backing memory, since shift is 0 it is equal to our memory size */
    };
}

/**
 * Constructors / Destructors
 **/

/**
 * @brief Initialize a Polynomial2 to size 'size', zeroing memory.
 *
 * @param size The size of the polynomial.
 */
template <typename Fr> Polynomial2<Fr>::Polynomial2(size_t size, size_t virtual_size)
{
    allocate_backing_memory(size, virtual_size);
    memset(static_cast<void*>(coefficients_.data()), 0, sizeof(Fr) * size);
}

/**
 * @brief Initialize a Polynomial2 to size 'size'.
 * Important: This does NOT zero memory.
 *
 * @param size The initial size of the polynomial.
 * @param flag Signals that we do not zero memory.
 */
template <typename Fr> Polynomial2<Fr>::Polynomial2(size_t size, size_t virtual_size, DontZeroMemory flag)
{
    // Flag is unused, but we don't memset 0 if passed.
    (void)flag;
    allocate_backing_memory(size, virtual_size);
}

template <typename Fr>
Polynomial2<Fr>::Polynomial2(const Polynomial2<Fr>& other)
    : Polynomial2<Fr>(other, other.size())
{}

// fully copying "expensive" constructor
template <typename Fr> Polynomial2<Fr>::Polynomial2(const Polynomial2<Fr>& other, const size_t target_size)
{
    allocate_backing_memory(std::max(target_size, other.size()), other.virtual_size());

    memcpy(static_cast<void*>(coefficients_.data()),
           static_cast<const void*>(other.coefficients_.data()),
           sizeof(Fr) * other.size());
}

// interpolation constructor
template <typename Fr>
Polynomial2<Fr>::Polynomial2(std::span<const Fr> interpolation_points,
                             std::span<const Fr> evaluations,
                             size_t virtual_size)
    : Polynomial2(interpolation_points.size(), virtual_size)
{
    ASSERT(coefficients_.size() > 0);

    polynomial_arithmetic::compute_efficient_interpolation(
        evaluations.data(), coefficients_.data(), interpolation_points.data(), coefficients_.size());
}

// Assignments

// full copy "expensive" assignment
template <typename Fr> Polynomial2<Fr>& Polynomial2<Fr>::operator=(const Polynomial2<Fr>& other)
{
    if (this == &other) {
        return *this;
    }
    allocate_backing_memory(other.coefficients_.size(), other.coefficients_.virtual_size());
    memcpy(static_cast<void*>(coefficients_.data()),
           static_cast<const void*>(other.coefficients_.data()),
           sizeof(Fr) * other.coefficients_.size());
    return *this;
}

template <typename Fr> Polynomial2<Fr> Polynomial2<Fr>::share() const
{
    Polynomial2 p;
    p.coefficients_ = coefficients_;
    return p;
}

template <typename Fr> bool Polynomial2<Fr>::operator==(Polynomial2 const& rhs) const
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
    for (size_t i = 0; i < std::max(size(), rhs.size()); i++) {
        if (coefficients_.get(i) != rhs.coefficients_.get(i)) {
            return false;
        }
    }
    return true;
}

// template <typename Fr> Polynomial2<Fr>& Polynomial2<Fr>::operator+=(std::span<const Fr> other)
// {
//     const size_t other_size = other.size();
//     ASSERT(in_place_operation_viable(other_size));

//     size_t num_threads = calculate_num_threads(other_size);
//     size_t range_per_thread = other_size / num_threads;
//     size_t leftovers = other_size - (range_per_thread * num_threads);
//     parallel_for(num_threads, [&](size_t j) {
//         size_t offset = j * range_per_thread;
//         size_t end = (j == num_threads - 1) ? offset + range_per_thread + leftovers : offset + range_per_thread;
//         for (size_t i = offset; i < end; ++i) {
//             coefficients_[i] += other[i];
//         }
//     });

//     return *this;
// }

// template <typename Fr> Polynomial2<Fr>& Polynomial2<Fr>::operator-=(std::span<const Fr> other)
// {
//     const size_t other_size = other.size();
//     ASSERT(in_place_operation_viable(other_size));

//     size_t num_threads = calculate_num_threads(other_size);
//     size_t range_per_thread = other_size / num_threads;
//     size_t leftovers = other_size - (range_per_thread * num_threads);
//     parallel_for(num_threads, [&](size_t j) {
//         size_t offset = j * range_per_thread;
//         size_t end = (j == num_threads - 1) ? offset + range_per_thread + leftovers : offset + range_per_thread;
//         for (size_t i = offset; i < end; ++i) {
//             coefficients_[i] -= other[i];
//         }
//     });

//     return *this;
// }

template <typename Fr> Polynomial2<Fr>& Polynomial2<Fr>::operator*=(const Fr scaling_factor)
{
    ASSERT(in_place_operation_viable());

    size_t num_threads = calculate_num_threads(size());
    size_t range_per_thread = size() / num_threads;
    size_t leftovers = size() - (range_per_thread * num_threads);
    parallel_for(num_threads, [&](size_t j) {
        size_t offset = j * range_per_thread;
        size_t end = (j == num_threads - 1) ? offset + range_per_thread + leftovers : offset + range_per_thread;
        for (size_t i = offset; i < end; ++i) {
            coefficients_.data()[i] *= scaling_factor;
        }
    });

    return *this;
}

template class Polynomial2<bb::fr>;
template class Polynomial2<grumpkin::fr>;

} // namespace bb