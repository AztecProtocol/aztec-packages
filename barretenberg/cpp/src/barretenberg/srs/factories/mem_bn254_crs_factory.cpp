#include "mem_bn254_crs_factory.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/bn254/pairing.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "bn254_crs_data.hpp"
#include "crs_integrity.hpp"
#include <atomic>

namespace {

using namespace bb;
using namespace bb::srs::factories;

class MemBn254Crs : public Crs<curve::BN254> {
    using Curve = curve::BN254;

  public:
    MemBn254Crs(const MemBn254Crs&) = delete;
    MemBn254Crs(MemBn254Crs&&) = delete;
    MemBn254Crs& operator=(const MemBn254Crs&) = delete;
    MemBn254Crs& operator=(MemBn254Crs&&) = delete;

    MemBn254Crs(std::vector<Curve::AffineElement> points, g2::affine_element const& g2_point)
        : g2_x(g2_point)
        , precomputed_g2_lines(
              static_cast<pairing::miller_lines*>(aligned_alloc(64, sizeof(bb::pairing::miller_lines) * 2)))
        , monomials_(std::move(points))
    {
        bb::pairing::precompute_miller_lines(bb::g2::one, precomputed_g2_lines[0]);
        bb::pairing::precompute_miller_lines(g2_x, precomputed_g2_lines[1]);
    }

    ~MemBn254Crs() override { aligned_free(precomputed_g2_lines); }

    std::span<Curve::AffineElement> get_monomial_points() override { return monomials_; }

    size_t get_monomial_size() const override { return monomials_.size(); }

    g2::affine_element get_g2x() const override { return g2_x; }

    pairing::miller_lines const* get_precomputed_g2_lines() const override { return precomputed_g2_lines; }
    g1::affine_element get_g1_identity() const override { return srs::BN254_G1_FIRST_ELEMENT; };

    void verify_points_integrity() override
    {
        if (!points_verified_.load(std::memory_order_acquire)) {
            srs::verify_bn254_g1_points(monomials_);
            points_verified_.store(true, std::memory_order_release);
        }
    }

  private:
    g2::affine_element g2_x;
    pairing::miller_lines* precomputed_g2_lines;
    std::vector<Curve::AffineElement> monomials_;
    std::atomic<bool> points_verified_{ false };
};

} // namespace

namespace bb::srs::factories {

MemBn254CrsFactory::MemBn254CrsFactory(std::vector<g1::affine_element> points, g2::affine_element const& g2_point)
    : crs_(std::make_shared<MemBn254Crs>(std::move(points), g2_point))
{
    vinfo("Initialized ", curve::BN254::name, " CRS from memory with num points = ", crs_->get_monomial_size());
}

template <> std::shared_ptr<Crs<curve::BN254>> CrsFactory<curve::BN254>::get_verifier_crs()
{
    static const std::shared_ptr<Crs<curve::BN254>> verifier_crs =
        std::make_shared<MemBn254Crs>(std::vector<g1::affine_element>{}, srs::get_bn254_g2_crs_element());
    return verifier_crs;
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
