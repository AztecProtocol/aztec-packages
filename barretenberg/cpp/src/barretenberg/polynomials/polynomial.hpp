// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/honk/types/circuit_type.hpp"
#include "barretenberg/polynomials/shared_shifted_virtual_zeroes_array.hpp"
#include "evaluation_domain.hpp"
#include "polynomial_arithmetic.hpp"
#include <cstddef>
#include <fstream>
#include <ranges>
namespace bb {

/* Span class with a start index offset.
 * We conceptually have a span like a_0 + a_1 x ... a_n x^n and then multiply by x^start_index.
 * This allows more efficient representation than a fully defined span for 'islands' of zeroes. */
template <typename Fr> struct PolynomialSpan {
    size_t start_index;
    std::span<Fr> span;
    PolynomialSpan(size_t start_index, std::span<Fr> span)
        : start_index(start_index)
        , span(span)
    {}
    size_t end_index() const { return start_index + size(); }
    Fr* data() { return span.data(); }
    size_t size() const { return span.size(); }
    Fr& operator[](size_t index)
    {
        BB_ASSERT_GTE(index, start_index);
        BB_ASSERT_LT(index, end_index());
        return span[index - start_index];
    }
    const Fr& operator[](size_t index) const
    {
        BB_ASSERT_GTE(index, start_index);
        BB_ASSERT_LT(index, end_index());
        return span[index - start_index];
    }
    PolynomialSpan subspan(size_t offset, size_t length)
    {
        if (offset > span.size()) { // Return a null span
            return { 0, span.subspan(span.size()) };
        }
        size_t new_length = std::min(length, span.size() - offset);
        return { start_index + offset, span.subspan(offset, new_length) };
    }
    operator PolynomialSpan<const Fr>() const { return PolynomialSpan<const Fr>(start_index, span); }
};

/**
 * @brief Structured polynomial class that represents the coefficients 'a' of a_0 + a_1 x ... a_n x^n of
 * a finite field polynomial equation of degree that is at most the size of some zk circuit.
 * Past 'n' it has a virtual size where it conceptually has coefficients all equal to 0.
 * Notably, we allow indexing past 'n' up to our virtual size (checked only in a debug build, however).
 * As well, we have a start index that means coefficients before start_index are also considered to be 0.
 * The polynomial is used to represent the gates of our arithmetized zk programs.
 * Polynomials use the majority of the memory in proving, so caution should be used in making sure
 * unnecessary copies are avoided, both for avoiding unnecessary memory usage and performance
 * due to unnecessary allocations.
 * The polynomial has a maximum degree in the underlying SharedShiftedVirtualZeroesArray, dictated by the circuit
 * size, this is just used for debugging as we represent.
 *
 * @tparam Fr the finite field type.
 */
template <typename Fr> class Polynomial {
  public:
    using FF = Fr;
    enum class DontZeroMemory { FLAG };

    Polynomial(size_t size, size_t virtual_size, size_t start_index = 0);
    // Intended just for plonk, where size == virtual_size always
    Polynomial(size_t size)
        : Polynomial(size, size){};

    // Constructor that does not initialize values, use with caution to save time.
    Polynomial(size_t size, size_t virtual_size, size_t start_index, DontZeroMemory flag);
    Polynomial(size_t size, size_t virtual_size, DontZeroMemory flag)
        : Polynomial(size, virtual_size, 0, flag)
    {}
    Polynomial(size_t size, DontZeroMemory flag)
        : Polynomial(size, size, flag)
    {}
    Polynomial(const Polynomial& other);
    Polynomial(const Polynomial& other, size_t target_size);

    Polynomial(Polynomial&& other) noexcept = default;

    Polynomial(std::span<const Fr> coefficients, size_t virtual_size);

    Polynomial(std::span<const Fr> coefficients)
        : Polynomial(coefficients, coefficients.size())
    {}

    /**
     * @brief Utility to efficiently construct a shift from the original polynomial.
     *
     * @param virtual_size the size of the polynomial to be shifted
     * @return Polynomial
     */
    static Polynomial shiftable(size_t virtual_size)
    {
        return Polynomial(/*actual size*/ virtual_size - 1, virtual_size, /*shiftable offset*/ 1);
    }
    // Allow polynomials to be entirely reset/dormant
    Polynomial() = default;

    /**
     * @brief Create the degree-(m-1) polynomial T(X) that interpolates the given evaluations.
     * We have T(xⱼ) = yⱼ for j=1,...,m
     *
     * @param interpolation_points (x₁,…,xₘ)
     * @param evaluations (y₁,…,yₘ)
     */
    Polynomial(std::span<const Fr> interpolation_points, std::span<const Fr> evaluations, size_t virtual_size);

    // move assignment
    Polynomial& operator=(Polynomial&& other) noexcept = default;
    Polynomial& operator=(const Polynomial& other);
    ~Polynomial() = default;

    /**
     * Return a shallow clone of the polynomial. i.e. underlying memory is shared.
     */
    Polynomial share() const;

    void clear() { coefficients_ = SharedShiftedVirtualZeroesArray<Fr>{}; }

    /**
     * @brief Check whether or not a polynomial is identically zero
     *
     */
    bool is_zero() const
    {
        if (is_empty()) {
            ASSERT(false);
            info("Checking is_zero on an empty Polynomial!");
        }
        for (size_t i = 0; i < size(); i++) {
            if (coefficients_.data()[i] != 0) {
                return false;
            }
        }
        return true;
    }

    bool operator==(Polynomial const& rhs) const;

    /**
     * @brief Retrieves the value at the specified index.
     *
     * @param index The index from which to retrieve the value.
     * @param virtual_padding For the rare case where we explicitly want the 0-returning behavior beyond our usual
     * virtual_size.
     */
    const Fr& get(size_t i, size_t virtual_padding = 0) const { return coefficients_.get(i, virtual_padding); };

    bool is_empty() const { return coefficients_.size() == 0; }

    /**
     * @brief Returns a Polynomial the left-shift of self.
     *
     * @details If the n coefficients of self are (0, a₁, …, aₙ₋₁),
     * we returns the view of the n-1 coefficients (a₁, …, aₙ₋₁).
     */
    Polynomial shifted() const;

    /**
     * @brief Returns a Polynomial equal to the right-shift-by-magnitude of self.
     * @note Resulting Polynomial shares the memory of that used to generate it
     */
    Polynomial right_shifted(const size_t magnitude) const;

    /**
     * @brief evaluate multi-linear extension p(X_0,…,X_{n-1}) = \sum_i a_i*L_i(X_0,…,X_{n-1}) at u =
     * (u_0,…,u_{n-1}) If the polynomial is embedded into a lower dimension k<n, i.e, start_index + size <= 2^k, we
     * evaluate it in a more efficient way. Note that a_j == 0 for any j >= 2^k. We fold over k dimensions and then
     * multiply the result by (1 - u_k) * (1 - u_{k+1}) ... * (1 - u_{n-1}). In this case, for any i < 2^k, L_i is a
     * multiple of (1 - X_k) * (1 - X_{k+1}) ... * (1 - X_{n-1}). Dividing p by this monomial leads to a multilinear
     * extension over variables X_0, X_1, ..X_{k-1}.
     *
     * @details this function allocates a temporary buffer of size 2^(k-1)
     *
     * @param evaluation_points evaluation vector of size n
     * @param shift a boolean and when set to true, we evaluate the shifted counterpart polynomial:
     *              enforce a_0 == 0 and compute \sum_i a_{i+1}*L_i(X_0,…,X_{n-1})
     */
    Fr evaluate_mle(std::span<const Fr> evaluation_points, bool shift = false) const;

    /**
     * @brief Partially evaluates in the last k variables a polynomial interpreted as a multilinear extension.
     *
     * @details Partially evaluates p(X) = (a_0, ..., a_{2^n-1}) considered as multilinear extension
     * p(X_0,…,X_{n-1}) = \sum_i a_i*L_i(X_0,…,X_{n-1}) at u = (u_0,…,u_{m-1}), m < n, in the last m variables
     * X_n-m,…,X_{n-1}. The result is a multilinear polynomial in n-m variables g(X_0,…,X_{n-m-1})) =
     * p(X_0,…,X_{n-m-1},u_0,...u_{m-1}).
     *
     * @note Intuitively, partially evaluating in one variable collapses the hypercube in one dimension, halving the
     * number of coefficients needed to represent the result. To partially evaluate starting with the first variable
     * (as is done in evaluate_mle), the vector of coefficents is halved by combining adjacent rows in a pairwise
     * fashion (similar to what is done in Sumcheck via "edges"). To evaluate starting from the last variable, we
     * instead bisect the whole vector and combine the two halves. I.e. rather than coefficents being combined with
     * their immediate neighbor, they are combined with the coefficient that lives n/2 indices away.
     *
     * @param evaluation_points an MLE partial evaluation point u = (u_0,…,u_{m-1})
     * @return DensePolynomial<Fr> g(X_0,…,X_{n-m-1})) = p(X_0,…,X_{n-m-1},u_0,...u_{m-1})
     */
    Polynomial partial_evaluate_mle(std::span<const Fr> evaluation_points) const;

    Fr compute_barycentric_evaluation(const Fr& z, const EvaluationDomain<Fr>& domain)
        requires polynomial_arithmetic::SupportsFFT<Fr>;
    Fr compute_kate_opening_coefficients(const Fr& z)
        requires polynomial_arithmetic::SupportsFFT<Fr>;

    /**
     * @brief Divides p(X) by (X-r) in-place.
     * Assumes that p(rⱼ)=0 for all j
     *
     * @details we specialize the method when only a single root is given.
     * if one of the roots is 0, then we first factor all other roots.
     * dividing by X requires only a left shift of all coefficient.
     *
     * @param root a single root r
     */
    void factor_roots(const Fr& root) { polynomial_arithmetic::factor_roots(coeffs(), root); };

    Fr evaluate(const Fr& z, size_t target_size) const;
    Fr evaluate(const Fr& z) const;

    /**
     * @brief adds the polynomial q(X) 'other', multiplied by a scaling factor.
     *
     * @param other q(X)
     * @param scaling_factor scaling factor by which all coefficients of q(X) are multiplied
     */
    void add_scaled(PolynomialSpan<const Fr> other, Fr scaling_factor) &;

    /**
     * @brief adds the polynomial q(X) 'other'.
     *
     * @param other q(X)
     */
    Polynomial& operator+=(PolynomialSpan<const Fr> other);

    /**
     * @brief subtracts the polynomial q(X) 'other'.
     *
     * @param other q(X)
     */
    Polynomial& operator-=(PolynomialSpan<const Fr> other);

    /**
     * @brief sets this = p(X) to s⋅p(X)
     *
     * @param scaling_factor s
     */
    Polynomial& operator*=(Fr scaling_factor);

    /**
     * @brief Add random values to the coefficients of a polynomial. In practice, this is used for ensuring the
     * commitment and evaluation of a polynomial don't leak information about the coefficients in the context of zero
     * knowledge.
     */
    void mask()
    {
        // Ensure there is sufficient space to add masking and also that we have memory allocated up to the virtual_size
        BB_ASSERT_GTE(virtual_size(), NUM_MASKED_ROWS);
        BB_ASSERT_EQ(virtual_size(), end_index());

        for (size_t i = virtual_size() - NUM_MASKED_ROWS; i < virtual_size(); ++i) {
            at(i) = FF::random_element();
        }
    }

    std::size_t size() const { return coefficients_.size(); }
    std::size_t virtual_size() const { return coefficients_.virtual_size(); }
    void increase_virtual_size(const size_t size_in) { coefficients_.increase_virtual_size(size_in); };

    Fr* data() { return coefficients_.data(); }
    const Fr* data() const { return coefficients_.data(); }

    /**
     * @brief Our mutable accessor, unlike operator[].
     * We abuse precedent a bit to differentiate at() and operator[] as mutable and immutable, respectively.
     * This means at() can only index within start_index()..end_index() unlike operator[] which can index
     * 0..virtual_size
     * @param index the index, to be subtracted by start_index() and read into the array memory
     * @return Fr& a mutable reference.
     */
    Fr& at(size_t index) { return coefficients_[index]; }
    const Fr& at(size_t index) const { return coefficients_[index]; }

    const Fr& operator[](size_t i) { return get(i); }
    const Fr& operator[](size_t i) const { return get(i); }

    static Polynomial random(size_t size, size_t start_index = 0)
    {
        PROFILE_THIS_NAME("generate random polynomial");

        return random(size - start_index, size, start_index);
    }

    static Polynomial random(size_t size, size_t virtual_size, size_t start_index)
    {
        Polynomial p(size, virtual_size, start_index, DontZeroMemory::FLAG);
        parallel_for_heuristic(
            size,
            [&](size_t i) { p.coefficients_.data()[i] = Fr::random_element(); },
            thread_heuristics::ALWAYS_MULTITHREAD);
        return p;
    }

    /**
     * @brief A factory to construct a polynomial where parallel initialization is
     *        not possible (e.g. AVM code).
     *
     * @return a polynomial initialized with zero on the range defined by size
     */
    static Polynomial create_non_parallel_zero_init(size_t size, size_t virtual_size);

    /**
     * @brief Expands the polynomial with new start_index and end_index
     * The value of the polynomial remains the same, but defined memory region differs.
     *
     * @return a polynomial with a larger size() but same virtual_size()
     */
    Polynomial expand(const size_t new_start_index, const size_t new_end_index) const;

    /**
     * @brief The end_index of the polynomial is decreased without any memory de-allocation.
     *        This is a very fast way to zeroize the polynomial tail from new_end_index to the
     *        end. It also means that the new end_index might be smaller than the backed memory.
     */
    void shrink_end_index(const size_t new_end_index);

    /**
     * @brief Copys the polynomial, but with the whole address space usable.
     * The value of the polynomial remains the same, but defined memory region differs.
     *
     * @return a polynomial with a larger size() but same virtual_size()
     */
    Polynomial full() const;

    // The extents of the actual memory-backed polynomial region
    size_t start_index() const { return coefficients_.start_; }
    size_t end_index() const { return coefficients_.end_; }

    /**
     * @brief Strictly iterates the defined region of the polynomial.
     * We keep this explicit, instead of having an implicit conversion to span.
     * This is safer as it is more likely that we need to consider our start_index()
     * along with the span, as in PolynomialSpan below.
     *
     * @return std::span<Fr> a span covering start_index() to end_index()
     */
    std::span<Fr> coeffs(size_t offset = 0) { return { data() + offset, data() + size() }; }
    std::span<const Fr> coeffs(size_t offset = 0) const { return { data() + offset, data() + size() }; }
    /**
     * @brief Convert to an std::span bundled with our start index.
     * @return PolynomialSpan<Fr> A span covering the entire polynomial.
     */
    operator PolynomialSpan<Fr>() { return { start_index(), coeffs() }; }

    /**
     * @brief Convert to an std::span bundled with our start index.
     * @return PolynomialSpan<Fr> A span covering the entire polynomial.
     */
    operator PolynomialSpan<const Fr>() const { return { start_index(), coeffs() }; }

    auto indices() const { return std::ranges::iota_view(start_index(), end_index()); }
    auto indexed_values() { return zip_view(indices(), coeffs()); }
    auto indexed_values() const { return zip_view(indices(), coeffs()); }
    /**
     * @brief Is this index valid for a set? i.e. calling poly.at(index) = value
     */
    bool is_valid_set_index(size_t index) const { return (index >= start_index() && index < end_index()); }
    /**
     * @brief Like setting with at(), but allows zeroes to result in no set.
     */
    void set_if_valid_index(size_t index, const Fr& value)
    {
        ASSERT(value.is_zero() || is_valid_set_index(index));
        if (is_valid_set_index(index)) {
            at(index) = value;
        }
    }

    /**
     * @brief Copy over values from a vector that is of a convertible type.
     *
     * @details There is an underlying assumption that the relevant start index in the vector
     * corresponds to the start_index of the destination polynomial and also that the number of elements we want to copy
     * corresponds to the size of the polynomial. This is quirky behavior and we might want to improve the UX.
     *
     * @todo https://github.com/AztecProtocol/barretenberg/issues/1292
     *
     * @tparam T a convertible type
     * @param vec the vector
     */
    template <typename T> void copy_vector(const std::vector<T>& vec)
    {
        BB_ASSERT_LTE(vec.size(), end_index());
        BB_ASSERT_LTE(vec.size() - start_index(), size());
        for (size_t i = start_index(); i < vec.size(); i++) {
            at(i) = vec[i];
        }
    }

    /*
     * @brief For quick and dirty comparisons. ONLY for development and log use!
     */
    Fr debug_hash() const
    {
        Fr result{ 0 };
        for (size_t i = start_index(); i < end_index(); i++) {
            result += (*this)[i] * i;
        }
        return result;
    }

  private:
    // allocate a fresh memory pointer for backing memory
    // DOES NOT initialize memory
    void allocate_backing_memory(size_t size, size_t virtual_size, size_t start_index);

    // safety check for in place operations
    bool in_place_operation_viable(size_t domain_size) { return (size() >= domain_size); }

    // The underlying memory, with a bespoke (but minimal) shared array struct that fits our needs.
    // Namely, it supports polynomial shifts and 'virtual' zeroes past a size up until a 'virtual' size.
    SharedShiftedVirtualZeroesArray<Fr> coefficients_;
};
// NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
template <typename Fr> std::shared_ptr<Fr[]> _allocate_aligned_memory(size_t n_elements)
{
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    return std::static_pointer_cast<Fr[]>(get_mem_slab(sizeof(Fr) * n_elements));
}

/**
 * @brief Internal implementation to support both native and stdlib circuit field types.
 * @details Instantiation with circuit field type is always called with shift == false
 */
template <typename Fr_>
Fr_ _evaluate_mle(std::span<const Fr_> evaluation_points,
                  const SharedShiftedVirtualZeroesArray<Fr_>& coefficients,
                  bool shift)
{
    constexpr bool is_native = IsAnyOf<Fr_, bb::fr, grumpkin::fr>;
    // shift ==> native
    ASSERT(!shift || is_native);

    if (coefficients.size() == 0) {
        return Fr_(0);
    }

    const size_t n = evaluation_points.size();
    const size_t dim = numeric::get_msb(coefficients.end_ - 1) + 1; // Round up to next power of 2

    // To simplify handling of edge cases, we assume that the index space is always a power of 2
    BB_ASSERT_EQ(coefficients.virtual_size(), static_cast<size_t>(1 << n));

    // We first fold over dim rounds l = 0,...,dim-1.
    // in round l, n_l is the size of the buffer containing the Polynomial partially evaluated
    // at u₀,..., u_l.
    // In round 0, this is half the size of dim
    size_t n_l = 1 << (dim - 1);

    // temporary buffer of half the size of the Polynomial
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1096): Make this a Polynomial with
    // DontZeroMemory::FLAG
    auto tmp_ptr = _allocate_aligned_memory<Fr_>(sizeof(Fr_) * n_l);
    auto tmp = tmp_ptr.get();

    size_t offset = 0;
    if constexpr (is_native) {
        if (shift) {
            BB_ASSERT_EQ(coefficients.get(0), Fr_::zero());
            offset++;
        }
    }

    Fr_ u_l = evaluation_points[0];

    // Note below: i * 2 + 1 + offset might equal virtual_size. This used to subtlely be handled by extra capacity
    // padding (and there used to be no assert time checks, which this constant helps with).
    const size_t ALLOW_ONE_PAST_READ = 1;
    for (size_t i = 0; i < n_l; ++i) {
        // curr[i] = (Fr(1) - u_l) * prev[i * 2] + u_l * prev[(i * 2) + 1];
        tmp[i] = coefficients.get(i * 2 + offset) +
                 u_l * (coefficients.get(i * 2 + 1 + offset, ALLOW_ONE_PAST_READ) - coefficients.get(i * 2 + offset));
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

    // We handle the "trivial" dimensions which are full of zeros.
    for (size_t i = dim; i < n; i++) {
        result *= (Fr_(1) - evaluation_points[i]);
    }

    return result;
}

/**
 * @brief Static exposed implementation to support both native and stdlib circuit field types.
 */
template <typename Fr_>
Fr_ generic_evaluate_mle(std::span<const Fr_> evaluation_points,
                         const SharedShiftedVirtualZeroesArray<Fr_>& coefficients)
{
    return _evaluate_mle(evaluation_points, coefficients, false);
}

template <typename Fr> inline std::ostream& operator<<(std::ostream& os, const Polynomial<Fr>& p)
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

template <typename Poly, typename... Polys> auto zip_polys(Poly&& poly, Polys&&... polys)
{
    // Ensure all polys have the same start_index() and end_index() as poly
    // Use fold expression to check all polys exactly match our size
    ASSERT((poly.start_index() == polys.start_index() && poly.end_index() == polys.end_index()) && ...);
    return zip_view(poly.indices(), poly.coeffs(), polys.coeffs()...);
}
} // namespace bb
