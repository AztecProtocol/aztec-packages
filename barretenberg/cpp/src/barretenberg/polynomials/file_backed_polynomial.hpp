#pragma once
#include "file_backed_shifted_virtual_zeroes_array.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "evaluation_domain.hpp"
#include "polynomial_arithmetic.hpp"
#include <sys/mman.h>
#include <fcntl.h>
#include <unistd.h>
#include <filesystem>
#include <atomic>
#include <string>
#include <cstddef>
#include <fstream>
#include <ranges>

// When using BB_SLOW_LOW_MEMORY, disable polynomial conversion to avoid circular dependencies
#ifdef BB_SLOW_LOW_MEMORY
#define POLYNOMIAL_CONVERSION_DISABLED
#endif

namespace bb {

#ifndef POLYNOMIAL_SPAN_DEFINED
#define POLYNOMIAL_SPAN_DEFINED
// PolynomialSpan structure needed for compatibility
template <typename Fr> struct PolynomialSpan {
    size_t start_index;
    std::span<Fr> span;
    PolynomialSpan(size_t start_index, std::span<Fr> span)
        : start_index(start_index)
        , span(span)
    {}
    auto begin() { return span.begin(); }
    auto end() { return span.end(); }
    auto begin() const { return span.begin(); }
    auto end() const { return span.end(); }
    Fr& operator[](size_t index) { return span[index]; }
    const Fr& operator[](size_t index) const { return span[index]; }
    size_t size() const { return span.size(); }
    size_t end_index() const { return start_index + span.size(); }
    Fr* data() { return span.data(); }
    const Fr* data() const { return span.data(); }
    auto subspan(size_t offset) const
    {
        if (offset > span.size()) { // Return a null span
            return PolynomialSpan<const Fr>{ 0, span.subspan(span.size()) };
        }
        return PolynomialSpan<const Fr>{ start_index + offset, span.subspan(offset) };
    }
    auto subspan(size_t offset, size_t length) const
    {
        if (offset > span.size()) { // Return a null span
            return PolynomialSpan<const Fr>{ 0, span.subspan(span.size()) };
        }
        size_t new_length = std::min(length, span.size() - offset);
        return PolynomialSpan<const Fr>{ start_index + offset, span.subspan(offset, new_length) };
    }
    operator PolynomialSpan<const Fr>() const { return PolynomialSpan<const Fr>(start_index, span); }
};
#endif // POLYNOMIAL_SPAN_DEFINED

// Forward declaration - only needed when not using BB_SLOW_LOW_MEMORY
#ifndef BB_SLOW_LOW_MEMORY
template <typename Fr> class MemoryPolynomial;
#endif

/**
 * @brief Clone a file-backed array with optional expansion
 */
template <typename Fr>
FileBackedShiftedVirtualZeroesArray<Fr> _clone_file_backed(
    const FileBackedShiftedVirtualZeroesArray<Fr>& array,
    size_t right_expansion = 0,
    size_t left_expansion = 0);

/**
 * @brief File-backed polynomial class that stores coefficients in memory-mapped files.
 * This class has the exact same interface as MemoryPolynomial but uses file backing instead of heap.
 * 
 * @tparam Fr the finite field type.
 */
template <typename Fr> 
class FileBackedPolynomial {
  public:
    using FF = Fr;
    enum class DontZeroMemory { FLAG };
    
    // Constructors matching MemoryPolynomial interface
    FileBackedPolynomial(size_t size, size_t virtual_size, size_t start_index = 0);
    FileBackedPolynomial(size_t size) : FileBackedPolynomial(size, size) {}
    FileBackedPolynomial(size_t size, size_t virtual_size, size_t start_index, DontZeroMemory flag);
    FileBackedPolynomial(size_t size, size_t virtual_size, DontZeroMemory flag)
        : FileBackedPolynomial(size, virtual_size, 0, flag) {}
    FileBackedPolynomial(size_t size, DontZeroMemory flag)
        : FileBackedPolynomial(size, size, flag) {}
    
    FileBackedPolynomial(const FileBackedPolynomial& other);
    FileBackedPolynomial(const FileBackedPolynomial& other, size_t target_size);
    FileBackedPolynomial(FileBackedPolynomial&& other) noexcept = default;
    FileBackedPolynomial(std::span<const Fr> coefficients, size_t virtual_size);
    FileBackedPolynomial(std::span<const Fr> coefficients)
        : FileBackedPolynomial(coefficients, coefficients.size()) {}
    
    // Interpolation constructor
    FileBackedPolynomial(std::span<const Fr> interpolation_points,
                        std::span<const Fr> evaluations,
                        size_t virtual_size);
    
    // Default constructor
    FileBackedPolynomial() = default;
    
    // Assignment operators
    FileBackedPolynomial& operator=(const FileBackedPolynomial& other);
    FileBackedPolynomial& operator=(FileBackedPolynomial&& other) noexcept = default;
    
    ~FileBackedPolynomial() = default;
    
    // Factory methods
    static FileBackedPolynomial shiftable(size_t virtual_size) {
        return FileBackedPolynomial(virtual_size - 1, virtual_size, 1);
    }
    
    static FileBackedPolynomial random(size_t size, size_t start_index = 0) {
        return random(size - start_index, size, start_index);
    }
    
    static FileBackedPolynomial random(size_t size, size_t virtual_size, size_t start_index);
    
    // Factory to construct a polynomial with non-parallel initialization
    static FileBackedPolynomial create_non_parallel_zero_init(size_t size, size_t virtual_size)
    {
        FileBackedPolynomial p(size, virtual_size);
        // The constructor already zeros memory, no need for additional initialization
        return p;
    }
    
    // Core methods matching MemoryPolynomial interface
    FileBackedPolynomial share() const;
    void clear() { coefficients_ = FileBackedShiftedVirtualZeroesArray<Fr>{}; }
    
    bool is_zero() const;
    bool operator==(const FileBackedPolynomial& rhs) const;
    
    const Fr& get(size_t i, size_t virtual_padding = 0) const { 
        return coefficients_.get(i, virtual_padding); 
    }
    
    bool is_empty() const { return coefficients_.size() == 0; }
    
    FileBackedPolynomial shifted() const;
    FileBackedPolynomial right_shifted(size_t magnitude) const;
    
    Fr evaluate_mle(std::span<const Fr> evaluation_points, bool shift = false) const;
    FileBackedPolynomial partial_evaluate_mle(std::span<const Fr> evaluation_points) const;
    
    Fr compute_barycentric_evaluation(const Fr& z, const EvaluationDomain<Fr>& domain)
        requires polynomial_arithmetic::SupportsFFT<Fr>;
    Fr compute_kate_opening_coefficients(const Fr& z)
        requires polynomial_arithmetic::SupportsFFT<Fr>;
    
    void factor_roots(const Fr& root);
    
    Fr evaluate(const Fr& z, size_t target_size) const;
    Fr evaluate(const Fr& z) const;
    
    void add_scaled(PolynomialSpan<const Fr> other, Fr scaling_factor) &;
    FileBackedPolynomial& operator+=(PolynomialSpan<const Fr> other);
    FileBackedPolynomial& operator-=(PolynomialSpan<const Fr> other);
    FileBackedPolynomial& operator*=(Fr scaling_factor);
    
    void mask();
    
    std::size_t size() const { return coefficients_.size(); }
    std::size_t virtual_size() const { return coefficients_.virtual_size(); }
    void increase_virtual_size(const size_t size_in) { coefficients_.increase_virtual_size(size_in); }
    
    Fr* data() { return coefficients_.data(); }
    const Fr* data() const { return coefficients_.data(); }
    
    std::span<Fr> coeffs(size_t offset = 0) { return { data() + offset, data() + size() }; }
    std::span<const Fr> coeffs(size_t offset = 0) const { return { data() + offset, data() + size() }; }
    
    Fr& at(size_t index) { 
        if (is_empty()) {
            throw std::runtime_error("Attempting to access empty polynomial at index " + std::to_string(index));
        }
        if (!is_valid_set_index(index)) {
            throw std::runtime_error("Index " + std::to_string(index) + " out of range [" + 
                                   std::to_string(start_index()) + ", " + std::to_string(end_index()) + ")");
        }
        return coefficients_[index]; 
    }
    const Fr& at(size_t index) const { 
        if (is_empty()) {
            throw std::runtime_error("Attempting to access empty polynomial at index " + std::to_string(index));
        }
        return coefficients_[index]; 
    }
    
    const Fr& operator[](size_t i) { return get(i); }
    const Fr& operator[](size_t i) const { return get(i); }
    
    FileBackedPolynomial expand(const size_t new_start_index, const size_t new_end_index) const;
    void shrink_end_index(const size_t new_end_index);
    FileBackedPolynomial full() const;
    
    size_t start_index() const { return coefficients_.start_; }
    size_t end_index() const { return coefficients_.end_; }
    
    // Conversion to PolynomialSpan
    operator PolynomialSpan<Fr>() { 
        return PolynomialSpan<Fr>(coefficients_.start_, 
                                  std::span<Fr>(coefficients_.data(), coefficients_.size())); 
    }
    operator PolynomialSpan<const Fr>() const { 
        return PolynomialSpan<const Fr>(coefficients_.start_, 
                                         std::span<const Fr>(coefficients_.data(), coefficients_.size())); 
    }
    
    // Convert to heap-based polynomial
#ifndef POLYNOMIAL_CONVERSION_DISABLED
    MemoryPolynomial<Fr> to_buffer() const;
#endif
    
    // Index range and indexed values
    auto indices() const { return std::ranges::iota_view(start_index(), end_index()); }
    auto indexed_values() { return zip_view(indices(), coeffs()); }
    auto indexed_values() const { return zip_view(indices(), coeffs()); }
    
    // Helper methods for index validity checking
    bool is_valid_set_index(size_t index) const { return (index >= start_index() && index < end_index()); }
    void set_if_valid_index(size_t index, const Fr& value)
    {
        ASSERT(value.is_zero() || is_valid_set_index(index));
        if (is_valid_set_index(index)) {
            at(index) = value;
        }
    }
    
    // Copy from a vector of a convertible type
    template <typename T> void copy_vector(const std::vector<T>& vec)
    {
        BB_ASSERT_LTE(vec.size(), end_index());
        BB_ASSERT_LTE(vec.size() - start_index(), size());
        for (size_t i = start_index(); i < vec.size(); i++) {
            at(i) = vec[i];
        }
    }

  private:
    void allocate_backing_memory(size_t size, size_t virtual_size, size_t start_index);
    
    FileBackedShiftedVirtualZeroesArray<Fr> coefficients_;
};

// Clone implementation
template <typename Fr>
FileBackedShiftedVirtualZeroesArray<Fr> _clone_file_backed(
    const FileBackedShiftedVirtualZeroesArray<Fr>& array,
    size_t right_expansion,
    size_t left_expansion)
{
    size_t original_size = array.size();
    size_t new_start = array.start_ - left_expansion;
    size_t new_end = array.end_ + right_expansion;
    
    // Create new array with expanded size
    FileBackedShiftedVirtualZeroesArray<Fr> result(new_start, new_end, array.virtual_size_);
    
    // Zero left expansion
    if (left_expansion > 0) {
        memset(result.data(), 0, sizeof(Fr) * left_expansion);
    }
    
    // Copy original data
    if (original_size > 0) {
        memcpy(result.data() + left_expansion, array.data(), sizeof(Fr) * original_size);
    }
    
    // Zero right expansion
    if (right_expansion > 0) {
        memset(result.data() + left_expansion + original_size, 0, sizeof(Fr) * right_expansion);
    }
    
    return result;
}

} // namespace bb