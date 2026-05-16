// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include <cstddef>

namespace bb {

/**
 * @brief Compact representation of a structured binary polynomial.
 * @details A binary selector is a polynomial whose values form the pattern
 *          [zeros][contiguous run of ones][zeros] over its virtual size.
 *          Such selectors are used by Mega's gate selectors q_busread, q_lookup,
 *          q_delta_range, q_elliptic, q_poseidon2_external, q_poseidon2_internal.
 *
 *          Storing only (start, end, virtual_size) avoids allocating a dense
 *          ~2^d field array per selector and enables an O(end - start) commitment
 *          (a sum of SRS points with no scalar multiplications).
 *
 *          The representation is purely metadata; consumers that need a dense
 *          Polynomial<FF> can call materialise() to allocate one on demand.
 *
 * @tparam FF Finite field type used for materialisation.
 */
template <typename FF> class BinarySelector {
  public:
    BinarySelector() = default;

    BinarySelector(size_t start, size_t end, size_t virtual_size)
        : start_(start)
        , end_(end)
        , virtual_size_(virtual_size)
    {
        BB_ASSERT(start <= end, "BinarySelector: start must not exceed end");
        BB_ASSERT(end <= virtual_size, "BinarySelector: end must not exceed virtual_size");
    }

    /**
     * @brief Read the value at index i (0 if outside [start, end), 1 inside).
     */
    FF operator[](size_t i) const
    {
        return (i >= start_ && i < end_) ? FF::one() : FF::zero();
    }

    FF get(size_t i, size_t /*virtual_padding*/ = 0) const { return (*this)[i]; }

    bool is_zero() const { return start_ == end_; }
    bool is_empty() const { return virtual_size_ == 0; }

    size_t size() const { return virtual_size_; }
    size_t virtual_size() const { return virtual_size_; }
    size_t start_index() const { return start_; }
    size_t end_index() const { return end_; }

    /**
     * @brief Materialise into a dense Polynomial<FF> covering [start, end).
     * @details Returns a shiftable-style polynomial whose coefficients equal one on
     *          [start, end) and zero elsewhere up to virtual_size.
     */
    Polynomial<FF> materialise() const
    {
        if (is_zero()) {
            return Polynomial<FF>(/*size=*/0, virtual_size_, /*start_index=*/start_);
        }
        Polynomial<FF> p(/*size=*/end_ - start_, /*virtual_size=*/virtual_size_, /*start_index=*/start_);
        for (size_t i = start_; i < end_; ++i) {
            p.at(i) = FF::one();
        }
        return p;
    }

    bool operator==(const BinarySelector& other) const = default;

  private:
    size_t start_{ 0 };
    size_t end_{ 0 };
    size_t virtual_size_{ 0 };
};

} // namespace bb
