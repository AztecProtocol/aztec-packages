#pragma once
#include "barretenberg/common/mem.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/polynomials/shared_shifted_virtual_zeroes_array.hpp"
#include "evaluation_domain.hpp"
#include "polynomial_arithmetic.hpp"
#include <fstream>

namespace bb {
enum class DontZeroMemory { FLAG };

/**
 * @brief Polynomial class that represents the coefficients 'a' of a_0 + a_1 x + a_n x^n of
 * a finite field polynomial equation of degree that is at most the size of some zk circuit.
 * The polynomial is used to represent the gates of our arithmetized zk programs.
 * This uses the majority of the memory in proving, so caution should be used in making sure
 * unnecessary copies are avoided, both for avoiding unnecessary memory usage and performance
 * due to unnecessary allocations.
 * The polynomial has a maximum degree in the underlying VirtualZerosArray, dictated by the circuit size, this is just
 * used for debugging as we represent.
 *
 * @tparam Fr the finite field type.
 */
template <typename Fr> class Polynomial2 {
  public:
    using FF = Fr;

    Polynomial2(size_t size, size_t virtual_size);
    // Constructor that does not initialize values, use with caution to save time.
    Polynomial2(size_t size, size_t virtual_size, DontZeroMemory flag);
    Polynomial2(const Polynomial2& other);
    Polynomial2(const Polynomial2& other, size_t target_size);

    Polynomial2(Polynomial2&& other) noexcept = default;

    Polynomial2(std::span<const Fr> coefficients, size_t virtual_size);

    // Allow polynomials to be entirely reset/dormant
    Polynomial2() = default;

    /**
     * @brief Create the degree-(m-1) polynomial T(X) that interpolates the given evaluations.
     * We have T(xⱼ) = yⱼ for j=1,...,m
     *
     * @param interpolation_points (x₁,…,xₘ)
     * @param evaluations (y₁,…,yₘ)
     */
    Polynomial2(std::span<const Fr> interpolation_points, std::span<const Fr> evaluations, size_t virtual_size);

    // move assignment
    Polynomial2& operator=(Polynomial2&& other) noexcept = default;
    Polynomial2& operator=(const Polynomial2& other);
    ~Polynomial2() = default;

    /**
     * Return a shallow clone of the polynomial. i.e. underlying memory is shared.
     */
    Polynomial2 share() const;

    void clear() { coefficients_ = SharedShiftedVirtualZeroesArray<Fr>{}; }

    /**
     * @brief Check whether or not a polynomial is identically zero
     *
     */
    bool is_zero()
    {
        if (is_empty()) {
            ASSERT(false);
            info("Checking is_zero on an empty Polynomial2!");
        }
        for (size_t i = 0; i < size(); i++) {
            if (coefficients_.data()[i] != 0) {
                return false;
            }
        }
        return true;
    }

    bool operator==(Polynomial2 const& rhs) const;

    void set(size_t i, const Fr& value) { coefficients_.set(i, value); };
    Fr get(size_t i) const { return coefficients_.get(i); };

    bool is_empty() const { return coefficients_.size() == 0; }

    /**
     * @brief Returns an std::span of the left-shift of self.
     *
     * @details If the n coefficients of self are (0, a₁, …, aₙ₋₁),
     * we returns the view of the n-1 coefficients (a₁, …, aₙ₋₁).
     */
    Polynomial2 shifted() const;

    /**
     * @brief Set self to the right shift of input coefficients
     * @details Set the size of self to match the input then set coefficients equal to right shift of input. Note: The
     * shifted result is constructed with its first shift-many coefficients equal to zero, so we assert that the last
     * shift-size many input coefficients are equal to zero to ensure that the relationship f(X) = f_{shift}(X)/X^m
     * holds. This is analagous to asserting the first coefficient is 0 in our left-shift-by-one method.
     *
     * @param coeffs_in
     * @param shift_size
     */
    void set_to_right_shifted(std::span<Fr> coeffs_in, size_t shift_size = 1);

    /**
     * @brief adds the polynomial q(X) 'other', multiplied by a scaling factor.
     *
     * @param other q(X)
     * @param scaling_factor scaling factor by which all coefficients of q(X) are multiplied
     */
    void add_scaled(std::span<const Fr> other, Fr scaling_factor);

    // /**
    //  * @brief adds the polynomial q(X) 'other'.
    //  *
    //  * @param other q(X)
    //  */
    // Polynomial2& operator+=(std::span<const Fr> other);

    // /**
    //  * @brief subtracts the polynomial q(X) 'other'.
    //  *
    //  * @param other q(X)
    //  */
    // Polynomial2& operator-=(std::span<const Fr> other);

    /**
     * @brief sets this = p(X) to s⋅p(X)
     *
     * @param scaling_factor s
     */
    Polynomial2& operator*=(Fr scaling_factor);

    std::size_t size() const { return coefficients_.size(); }
    std::size_t virtual_size() const { return coefficients_.virtual_size(); }

    static Polynomial2 random(size_t size, size_t virtual_size)
    {
        Polynomial2 p(size, virtual_size, DontZeroMemory::FLAG);
        std::generate_n(p.coefficients_.data(), size, []() { return Fr::random_element(); });
        return p;
    }

  private:
    // allocate a fresh memory pointer for backing memory
    // DOES NOT initialize memory
    void allocate_backing_memory(size_t size, size_t virtual_size);

    // safety check for in place operations
    bool in_place_operation_viable(size_t domain_size = 0) { return (size() >= domain_size); }

    void zero_memory_beyond(size_t start_position);
    // When a polynomial is instantiated from a size alone, the memory allocated corresponds to
    // input size + MAXIMUM_COEFFICIENT_SHIFT to support 'shifted' coefficients efficiently.
    const static size_t MAXIMUM_COEFFICIENT_SHIFT = 1;

    // The underlying memory, with a bespoke (but minimal) shared array struct that fits our needs.
    // Namely, it supports polynomial shifts and 'virtual' zeroes past a size up until a 'virtual' size.
    SharedShiftedVirtualZeroesArray<Fr> coefficients_;
};

template <typename Fr> inline std::ostream& operator<<(std::ostream& os, Polynomial2<Fr> const& p)
{
    if (p.size() == 0) {
        return os << "[]";
    }
    if (p.size() == 1) {
        return os << "[ data " << p[0] << "]";
    }
    return os << "[ data\n"
              << "  " << p[0] << ",\n"
              << "  " << p[1] << ",\n"
              << "  ... ,\n"
              << "  " << p[p.size() - 2] << ",\n"
              << "  " << p[p.size() - 1] << ",\n"
              << "]";
}

using polynomial = Polynomial2<bb::fr>;

} // namespace bb