#pragma once
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/bn254/g2.hpp"
#include "crs_factory.hpp"
#include <cstddef>
#include <utility>

namespace bb::srs::factories {

/**
 * Create reference strings given pointers to in memory buffers.
 *
 * This class is currently only used with wasm and works exclusively with the BN254 CRS.
 */
class MemBn254CrsFactory : public CrsFactory<curve::BN254> {
  public:
    MemBn254CrsFactory(std::vector<g1::affine_element> const& points, g2::affine_element const& g2_point);

    std::shared_ptr<Crs<curve::BN254>> get_crs(size_t degree) override;

  private:
    std::shared_ptr<Crs<curve::BN254>> crs_;
};

} // namespace bb::srs::factories
