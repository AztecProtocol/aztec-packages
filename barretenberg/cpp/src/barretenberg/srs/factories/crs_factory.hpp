#pragma once
#include "barretenberg/common/mem.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/bn254/g2.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <cstddef>

namespace bb::pairing {
struct miller_lines;
} // namespace bb::pairing

namespace bb::srs::factories {

template <typename Curve> class Crs {
  public:
    virtual ~Crs() = default;
};

// Crs specialization for bn254
template <> class Crs<curve::BN254> {
    using Curve = curve::BN254;

  public:
    // base class best practices
    Crs() = default;
    Crs(const Crs&) = delete;
    Crs(Crs&&) noexcept = default;
    Crs& operator=(const Crs&) = delete;
    Crs& operator=(Crs&&) = delete;
    virtual ~Crs() = default;

    /**
     *  @brief Returns the monomial points in a form to be consumed by scalar_multiplication pippenger algorithm.
     */
    virtual std::span<Curve::AffineElement> get_monomial_points() = 0;
    virtual size_t get_monomial_size() const = 0;

    /**
     *  @brief Returns the first G_1 element from the CRS, used by the Shplonk verifier to compute the final
     * commtiment.
     */
    virtual Curve::AffineElement get_g1_identity() const = 0;
    /**
     * @brief As the G_2 element of the CRS is fixed, we can precompute the operations performed on it during the
     * pairing algorithm to optimize pairing computations.
     */
    virtual bb::pairing::miller_lines const* get_precomputed_g2_lines() const = 0;

    virtual Curve::G2AffineElement get_g2x() const = 0;
};

// Crs specialization for Grumpkin
template <> class Crs<curve::Grumpkin> {
    using Curve = curve::Grumpkin;

  public:
    // base class best practices
    Crs() = default;
    Crs(const Crs&) = delete;
    Crs(Crs&&) = default;
    Crs& operator=(const Crs&) = delete;
    Crs& operator=(Crs&&) = delete;
    virtual ~Crs() = default;

    /**
     *  @brief Returns the monomial points in a form to be consumed by scalar_multiplication pippenger algorithm.
     */
    virtual std::span<Curve::AffineElement> get_monomial_points() = 0;
    virtual size_t get_monomial_size() const = 0;

    /**
     *  @brief Returns the first G_1 element from the CRS, used by the Shplonk verifier to compute the final
     * commtiment.
     */
    virtual Curve::AffineElement get_g1_identity() const = 0;
};

/**
 * A factory class to return the prover crs and verifier crs on request.
 * You can construct an empty placeholder factory, because composers need to be given a factory at construction time.
 */
template <typename Curve> class CrsFactory {
  public:
    // base class best practices
    CrsFactory() = default;
    CrsFactory(const CrsFactory&) = delete;
    CrsFactory(CrsFactory&&) noexcept = default;
    CrsFactory& operator=(const CrsFactory&) = delete;
    CrsFactory& operator=(CrsFactory&&) noexcept = default;
    virtual ~CrsFactory() = default;
    virtual std::shared_ptr<bb::srs::factories::Crs<Curve>> get_crs(size_t) = 0;
    std::shared_ptr<bb::srs::factories::Crs<Curve>> get_verifier_crs() { return get_crs(1); };
};

} // namespace bb::srs::factories
