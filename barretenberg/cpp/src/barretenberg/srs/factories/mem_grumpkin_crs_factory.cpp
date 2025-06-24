#include "mem_grumpkin_crs_factory.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"

namespace {

using namespace bb::curve;
using namespace bb;
using namespace bb::srs::factories;

class MemGrumpkinCrs : public Crs<Grumpkin> {
  public:
    MemGrumpkinCrs(const MemGrumpkinCrs&) = delete;
    MemGrumpkinCrs(MemGrumpkinCrs&&) noexcept = default;
    MemGrumpkinCrs& operator=(const MemGrumpkinCrs&) = delete;
    MemGrumpkinCrs& operator=(MemGrumpkinCrs&&) = delete;

    MemGrumpkinCrs(std::vector<Grumpkin::AffineElement> const& points)
        : monomials_(points.size())
    {
        std::copy(points.begin(), points.end(), monomials_.begin());
    }

    ~MemGrumpkinCrs() override = default;
    std::span<Grumpkin::AffineElement> get_monomial_points() override { return monomials_; }
    size_t get_monomial_size() const override { return monomials_.size(); }
    Grumpkin::AffineElement get_g1_identity() const override { return monomials_[0]; };

  private:
    std::vector<Grumpkin::AffineElement> monomials_;
};

} // namespace

namespace bb::srs::factories {

MemGrumpkinCrsFactory::MemGrumpkinCrsFactory(const std::vector<Grumpkin::AffineElement>& points)
    : crs_(std::make_shared<MemGrumpkinCrs>(points))
{
    if (points.empty() || !points[0].on_curve()) {
        throw_or_abort("invalid vector passed to MemGrumpkinCrsFactory");
    }
    vinfo(
        "Initialized ", curve::Grumpkin::name, " prover CRS from memory with num points = ", crs_->get_monomial_size());
}

std::shared_ptr<bb::srs::factories::Crs<Grumpkin>> MemGrumpkinCrsFactory::get_crs(size_t degree)
{
    if (crs_->get_monomial_size() < degree) {
        throw_or_abort(format("prover trying to get too many points in MemGrumpkinCrsFactory - ",
                              degree,
                              " is more than ",
                              crs_->get_monomial_size()));
    }
    return crs_;
}

} // namespace bb::srs::factories
