#pragma once
#include "crs_factory.hpp"
#include <cstddef>
#include <utility>

namespace bb::srs::factories {

/**
 * Create reference strings given pointers to in memory buffers.
 *
 * This class is currently only used with wasm and works exclusively with the Grumpkin CRS.
 */
class MemGrumpkinCrsFactory : public CrsFactory<curve::Grumpkin> {
  public:
    MemGrumpkinCrsFactory(const std::vector<curve::Grumpkin::AffineElement>& points);
    MemGrumpkinCrsFactory(MemGrumpkinCrsFactory&& other) = default;

    std::shared_ptr<Crs<curve::Grumpkin>> get_crs(size_t degree) override;

  private:
    std::shared_ptr<Crs<curve::Grumpkin>> crs_;
};

} // namespace bb::srs::factories
