#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include <span>

namespace bb {

/**
 * @brief A view of a univariate, also used to truncate univariates.
 *
 * @details For optimization purposes, it makes sense to define univariates with large lengths and then reuse only some
 * of the data in those univariates. We do that by taking a view of those elements and then, as needed, using this to
 * populate new containers.
 */
template <class Fr, size_t view_domain_end, size_t view_domain_start, size_t skip_count> class UnivariateView;

/**
 * @brief A univariate polynomial represented by its values on {domain_start, domain_start + 1,..., domain_end - 1}. For
 * memory efficiency purposes, we store the evaluations in an array starting from 0 and make the mapping to the right
 * domain under the hood.
 *
 * @tparam skip_count Skip computing the values of elements [domain_start+1,..,domain_start+skip_count]. Used for
 * optimising computation in protogalaxy. The value at [domain_start] is the value from the accumulator, while the
 * values in [domain_start+1, ... domain_start + skip_count] in the accumulator should be zero if the original if the
 * skip_count-many keys to be folded are all valid
 */
template <class Fr, size_t domain_end, size_t domain_start = 0, size_t skip_count = 0> class Univariate {
  public:
    static constexpr size_t LENGTH = domain_end - domain_start;
    static constexpr size_t SKIP_COUNT = skip_count;
    using View = UnivariateView<Fr, domain_end, domain_start, skip_count>;
    using value_type = Fr; // Used to get the type of the elements consistently with std::array

    std::array<Fr, LENGTH> evaluations;

    // Constructors and Destructor
    Univariate() = default;
    explicit Univariate(std::array<Fr, LENGTH> evaluations);
    explicit Univariate(Fr value);
    explicit Univariate(UnivariateView<Fr, domain_end, domain_start, skip_count> in);
    ~Univariate() = default;

    // Copy/Move Constructors and Assignment Operators
    Univariate(const Univariate& other) = default;
    Univariate(Univariate&& other) noexcept = default;
    Univariate& operator=(const Univariate& other) = default;
    Univariate& operator=(Univariate&& other) noexcept = default;

    // Conversion function
    Univariate<Fr, domain_end, domain_start> convert() const noexcept;

    // Operations between Univariate and other Univariate

    Univariate& operator+=(const Univariate& other);
    bool operator==(const Univariate& other) const;
    Univariate& operator-=(const Univariate& other);
    Univariate& operator*=(const Univariate& other);
    Univariate& self_sqr();

    Univariate operator+(const Univariate& other) const;
    Univariate operator-(const Univariate& other) const;
    Univariate operator*(const Univariate& other) const;
    Univariate operator-() const;
    Univariate sqr() const;

    // Operations between Univariate and scalar
    Univariate& operator+=(const Fr& scalar);
    Univariate& operator-=(const Fr& scalar);
    Univariate& operator*=(const Fr& scalar);

    Univariate operator+(const Fr& scalar) const;
    Univariate operator-(const Fr& scalar) const;
    Univariate operator*(const Fr& scalar) const;

    // Operations between Univariate and UnivariateView
    Univariate& operator+=(const UnivariateView<Fr, domain_end, domain_start, skip_count>& view);
    Univariate& operator-=(const UnivariateView<Fr, domain_end, domain_start, skip_count>& view);
    Univariate& operator*=(const UnivariateView<Fr, domain_end, domain_start, skip_count>& view);

    Univariate operator+(const UnivariateView<Fr, domain_end, domain_start, skip_count>& view) const;
    Univariate operator-(const UnivariateView<Fr, domain_end, domain_start, skip_count>& view) const;
    Univariate operator*(const UnivariateView<Fr, domain_end, domain_start, skip_count>& view) const;

    // Utility methods
    Fr& value_at(size_t i);
    const Fr& value_at(size_t i) const;

    bool is_zero() const;
    // Buffer methods
    std::vector<uint8_t> to_buffer() const;
    static Univariate serialize_from_buffer(uint8_t const* buffer);
    static Univariate get_random();
    static Univariate zero() noexcept;
    static Univariate random_element();

    // Extension and evaluation methods

    /**
     * @brief Given a univariate f represented by {f(domain_start), ..., f(domain_end - 1)}, compute the
     * evaluations {f(domain_end),..., f(extended_domain_end -1)} and return the Univariate represented by
     * {f(domain_start),..., f(extended_domain_end -1)}
     *
     * @details Write v_i = f(x_i) on a the domain {x_{domain_start}, ..., x_{domain_end-1}}. To efficiently
     * compute the needed values of f, we use the barycentric formula
     *      - f(x) = B(x) Σ_{i=domain_start}^{domain_end-1} v_i / (d_i*(x-x_i))
     * where
     *      - B(x) = Π_{i=domain_start}^{domain_end-1} (x-x_i)
     *      - d_i  = Π_{j ∈ {domain_start, ..., domain_end-1}, j≠i} (x_i-x_j) for i ∈ {domain_start, ...,
     * domain_end-1}
     *
     * When the domain size is two, extending f = v0(1-X) + v1X to a new value involves just one addition
     * and a subtraction: setting Δ = v1-v0, the values of f(X) are f(0)=v0, f(1)= v0 + Δ, v2 = f(1) + Δ, v3
     * = f(2) + Δ...
     *
     */
    template <size_t EXTENDED_DOMAIN_END, size_t NUM_SKIPPED_INDICES = 0>
    Univariate<Fr, EXTENDED_DOMAIN_END, 0, NUM_SKIPPED_INDICES> extend_to() const;
    template <size_t INITIAL_LENGTH> void self_extend_from();

    Fr evaluate(const Fr& u) const;

    // Output stream operator
    // Output is immediately parsable as a list of integers by Python.
    friend std::ostream& operator<<(std::ostream& os, const Univariate& u)
    {
        os << "[";
        os << u.evaluations[0] << "," << std::endl;
        for (size_t i = 1; i < u.evaluations.size(); i++) {
            os << " " << u.evaluations[i];
            if (i + 1 < u.evaluations.size()) {
                os << "," << std::endl;
            } else {
                os << "]";
            };
        }
        return os;
    }

    Univariate zero_skipped_elements() const noexcept;
    // Begin iterators
    auto begin() { return evaluations.begin(); }
    auto begin() const { return evaluations.begin(); }
    // End iterators
    auto end() { return evaluations.end(); }
    auto end() const { return evaluations.end(); }
};

template <typename B, class Fr, size_t domain_end, size_t domain_start = 0>
inline void read(B& it, Univariate<Fr, domain_end, domain_start>& univariate)
{
    using serialize::read;
    read(it, univariate.evaluations);
}

template <typename B, class Fr, size_t domain_end, size_t domain_start = 0>
inline void write(B& it, Univariate<Fr, domain_end, domain_start> const& univariate)
{
    using serialize::write;
    write(it, univariate.evaluations);
}

template <class Fr, size_t domain_end, size_t domain_start = 0, size_t skip_count = 0>
Univariate<Fr, domain_end, domain_start, skip_count> operator+(
    const Fr& ff, const Univariate<Fr, domain_end, domain_start, skip_count>& uv)
{
    return uv + ff;
}

template <class Fr, size_t domain_end, size_t domain_start = 0, size_t skip_count = 0>
Univariate<Fr, domain_end, domain_start, skip_count> operator-(
    const Fr& ff, const Univariate<Fr, domain_end, domain_start, skip_count>& uv)
{
    return -uv + ff;
}

template <class Fr, size_t domain_end, size_t domain_start = 0, size_t skip_count = 0>
Univariate<Fr, domain_end, domain_start, skip_count> operator*(
    const Fr& ff, const Univariate<Fr, domain_end, domain_start, skip_count>& uv)
{
    return uv * ff;
}

template <class Fr, size_t domain_end, size_t domain_start = 0, size_t skip_count = 0> class UnivariateView {
  public:
    static constexpr size_t LENGTH = domain_end - domain_start;
    std::span<const Fr, LENGTH> evaluations;

    UnivariateView() = default;

    const Fr& value_at(size_t i) const { return evaluations[i]; };

    template <size_t full_domain_end, size_t full_domain_start = 0>
    explicit UnivariateView(const Univariate<Fr, full_domain_end, full_domain_start, skip_count>& univariate_in)
        : evaluations(std::span<const Fr>(univariate_in.evaluations.data(), LENGTH)){};

    Univariate<Fr, domain_end, domain_start, skip_count> operator+(const UnivariateView& other) const
    {
        Univariate<Fr, domain_end, domain_start, skip_count> res(*this);
        res += other;
        return res;
    }

    Univariate<Fr, domain_end, domain_start, skip_count> operator-(const UnivariateView& other) const
    {
        Univariate<Fr, domain_end, domain_start, skip_count> res(*this);
        res -= other;
        return res;
    }

    Univariate<Fr, domain_end, domain_start, skip_count> operator-() const
    {
        Univariate<Fr, domain_end, domain_start, skip_count> res(*this);
        size_t i = 0;
        for (auto& eval : res.evaluations) {
            if (i == 0 || i >= (skip_count + 1)) {
                eval = -eval;
            }
            i++;
        }
        return res;
    }

    Univariate<Fr, domain_end, domain_start, skip_count> operator*(const UnivariateView& other) const
    {
        Univariate<Fr, domain_end, domain_start, skip_count> res(*this);
        res *= other;
        return res;
    }
    Univariate<Fr, domain_end, domain_start, skip_count> sqr() const
    {
        Univariate<Fr, domain_end, domain_start, skip_count> res(*this);
        res = res.sqr();
        return res;
    }

    Univariate<Fr, domain_end, domain_start, skip_count> operator*(
        const Univariate<Fr, domain_end, domain_start, skip_count>& other) const
    {
        Univariate<Fr, domain_end, domain_start, skip_count> res(*this);
        res *= other;
        return res;
    }

    Univariate<Fr, domain_end, domain_start, skip_count> operator+(
        const Univariate<Fr, domain_end, domain_start, skip_count>& other) const
    {
        Univariate<Fr, domain_end, domain_start, skip_count> res(*this);
        res += other;
        return res;
    }

    Univariate<Fr, domain_end, domain_start, skip_count> operator+(const Fr& other) const
    {
        Univariate<Fr, domain_end, domain_start, skip_count> res(*this);
        res += other;
        return res;
    }

    Univariate<Fr, domain_end, domain_start, skip_count> operator-(const Fr& other) const
    {
        Univariate<Fr, domain_end, domain_start, skip_count> res(*this);
        res -= other;
        return res;
    }

    Univariate<Fr, domain_end, domain_start, skip_count> operator*(const Fr& other) const
    {
        Univariate<Fr, domain_end, domain_start, skip_count> res(*this);
        res *= other;
        return res;
    }

    Univariate<Fr, domain_end, domain_start, skip_count> operator-(
        const Univariate<Fr, domain_end, domain_start, skip_count>& other) const
    {
        Univariate<Fr, domain_end, domain_start, skip_count> res(*this);
        res -= other;
        return res;
    }

    // Output is immediately parsable as a list of integers by Python.
    friend std::ostream& operator<<(std::ostream& os, const UnivariateView& u)
    {
        os << "[";
        os << u.evaluations[0] << "," << std::endl;
        for (size_t i = 1; i < u.evaluations.size(); i++) {
            os << " " << u.evaluations[i];
            if (i + 1 < u.evaluations.size()) {
                os << "," << std::endl;
            } else {
                os << "]";
            };
        }
        return os;
    }
};

/**
 * @brief Create a sub-array of `elements` at the indices given in the template pack `Is`, converting them
 * to the new type T.
 *
 * @tparam T type to convert to
 * @tparam U type to convert from
 * @tparam N number (deduced by `elements`)
 * @tparam Is list of indices we want in the returned array. When the second argument is called with
 * `std::make_index_sequence<N>`, these will be `0, 1, ..., N-1`.
 * @param elements array to convert from
 * @return std::array<T, sizeof...(Is)> result array s.t. result[i] = T(elements[Is[i]]). By default, Is[i]
 * = i when called with `std::make_index_sequence<N>`.
 */
template <typename T, typename U, std::size_t N, std::size_t... Is>
std::array<T, sizeof...(Is)> array_to_array_aux(const std::array<U, N>& elements, std::index_sequence<Is...>)
{
    return { { T{ elements[Is] }... } };
};

/**
 * @brief Given an std::array<U,N>, returns an std::array<T,N>, by calling the (explicit) constructor T(U).
 *
 * @details https://stackoverflow.com/a/32175958
 * The main use case is to convert an array of `Univariate` into `UnivariateView`. The main use case would
 * be to let Sumcheck decide the required degree of the relation evaluation, rather than hardcoding it
 * inside the relation. The
 * `_aux` version could also be used to create an array of only the polynomials required by the relation,
 * and it could help us implement the optimization where we extend each edge only up to the maximum degree
 * that is required over all relations (for example, `L_LAST` only needs degree 3).
 *
 * @tparam T Output type
 * @tparam U Input type (deduced from `elements`)
 * @tparam N Common array size (deduced from `elements`)
 * @param elements array to be converted
 * @return std::array<T, N> result s.t. result[i] = T(elements[i])
 */
template <typename T, typename U, std::size_t N> std::array<T, N> array_to_array(const std::array<U, N>& elements)
{
    // Calls the aux method that uses the index sequence to unpack all values in `elements`
    return array_to_array_aux<T, U, N>(elements, std::make_index_sequence<N>());
};

} // namespace bb

namespace std {
template <typename T, size_t N> struct tuple_size<bb::Univariate<T, N>> : std::integral_constant<std::size_t, N> {};

} // namespace std
