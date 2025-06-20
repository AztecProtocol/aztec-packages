#include "mem_bn254_crs_factory.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/bn254/pairing.hpp"
#include "barretenberg/ecc/scalar_multiplication/point_table.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"

namespace {

using namespace bb;
using namespace bb::srs::factories;

class MemBn254Crs : public Crs<curve::BN254> {
    using Curve = curve::BN254;

  public:
    MemBn254Crs(const MemBn254Crs&) = delete;
    MemBn254Crs(MemBn254Crs&&) noexcept = default;
    MemBn254Crs& operator=(const MemBn254Crs&) = delete;
    MemBn254Crs& operator=(MemBn254Crs&&) = delete;

    MemBn254Crs(std::vector<Curve::AffineElement> const& points, g2::affine_element const& g2_point)
        : g2_x(g2_point)
        , precomputed_g2_lines(
              static_cast<pairing::miller_lines*>(aligned_alloc(64, sizeof(bb::pairing::miller_lines) * 2)))
        , monomials_(bb::scalar_multiplication::point_table_size(points.size()))
    {
        if (points.empty() || !points[0].on_curve()) {
            throw_or_abort("invalid g1_identity passed to MemBn254CrsFactory");
        }
        std::copy(points.begin(), points.end(), monomials_.begin());
        scalar_multiplication::generate_pippenger_point_table<Curve>(
            monomials_.data(), monomials_.data(), points.size());
        bb::pairing::precompute_miller_lines(bb::g2::one, precomputed_g2_lines[0]);
        bb::pairing::precompute_miller_lines(g2_x, precomputed_g2_lines[1]);
    }

    ~MemBn254Crs() override { aligned_free(precomputed_g2_lines); }

    std::span<Curve::AffineElement> get_monomial_points() override { return monomials_; }

    size_t get_monomial_size() const override { return monomials_.size() / 2; }

    g2::affine_element get_g2x() const override { return g2_x; }

    pairing::miller_lines const* get_precomputed_g2_lines() const override { return precomputed_g2_lines; }
    g1::affine_element get_g1_identity() const override { return monomials_[0]; };

  private:
    g2::affine_element g2_x;
    pairing::miller_lines* precomputed_g2_lines;
    std::vector<Curve::AffineElement> monomials_;
};

} // namespace

namespace bb::srs::factories {

MemBn254CrsFactory::MemBn254CrsFactory(std::vector<g1::affine_element> const& points,
                                       g2::affine_element const& g2_point)
    : crs_(std::make_shared<MemBn254Crs>(points, g2_point))
{
    vinfo("Initialized ", curve::BN254::name, " CRS from memory with num points = ", crs_->get_monomial_size());
}

std::shared_ptr<bb::srs::factories::Crs<curve::BN254>> MemBn254CrsFactory::get_crs(size_t degree)
{
    if (crs_->get_monomial_size() < degree) {
        throw_or_abort(format(
            "prover trying to get too many points in MemBn254CrsFactory! ", crs_->get_monomial_size(), " vs ", degree));
    }
    return crs_;
}

} // namespace bb::srs::factories
