#pragma once
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/srs/factories/crs_factory.hpp"
#include "barretenberg/srs/factories/mem_bn254_crs_factory.hpp"
#include "barretenberg/srs/factories/mem_grumpkin_crs_factory.hpp"
#include <filesystem>
#include <memory>

namespace bb::srs::factories {

/**
 * @details The transcript is divided into G1 and G2 point files:
 * The G1 flat file:
 *      | XX XX XX XX | ‾\          ‾\
 *            ...         > G1 point  \
 *      | XX XX XX XX | _/             \
 *            ...                       > 64 bytes each
 *      | XX XX XX XX | ‾\             /
 *            ...         > G1 point  /
 *      | XX XX XX XX | _/          _/
 *
 * BN254 has one 128 byte G2 point. Grumpkin has no G2 points.
 */

MemBn254CrsFactory init_bn254_crs(const std::filesystem::path& path,
                                  size_t dyadic_circuit_size,
                                  bool allow_download = true);
MemGrumpkinCrsFactory init_grumpkin_crs(const std::filesystem::path& path,
                                        size_t eccvm_dyadic_circuit_size,
                                        bool allow_download = true);

/**
 * Derives reference strings from a file, that is secondarily backed by the network.
 */
class NativeBn254CrsFactory : public CrsFactory<curve::BN254> {
  public:
    NativeBn254CrsFactory(const std::filesystem::path& path, bool allow_download = true)
        : path_(path)
        , allow_download_(allow_download)
    {}
    std::shared_ptr<Crs<curve::BN254>> get_crs(size_t degree) override
    {
        if (degree > last_degree_ || mem_crs_ == nullptr) {
            mem_crs_ = std::make_shared<MemBn254CrsFactory>(init_bn254_crs(path_, degree, allow_download_));
            last_degree_ = degree;
        }
        return mem_crs_->get_crs(degree);
    }

  private:
    std::filesystem::path path_;
    bool allow_download_ = true;
    size_t last_degree_ = 0;
    std::shared_ptr<MemBn254CrsFactory> mem_crs_;
};

class NativeGrumpkinCrsFactory : public CrsFactory<curve::Grumpkin> {
  public:
    NativeGrumpkinCrsFactory(const std::filesystem::path& path, bool allow_download = true)
        : path_(path)
        , allow_download_(allow_download)
    {}

    std::shared_ptr<Crs<curve::Grumpkin>> get_crs(size_t degree) override
    {
        if (degree > last_degree_ || mem_crs_ == nullptr) {
            mem_crs_ = std::make_unique<MemGrumpkinCrsFactory>(init_grumpkin_crs(path_, degree, allow_download_));
            last_degree_ = degree;
        }
        return mem_crs_->get_crs(degree);
    }

  private:
    std::filesystem::path path_;
    bool allow_download_ = true;
    size_t last_degree_ = 0;
    std::unique_ptr<MemGrumpkinCrsFactory> mem_crs_;
};

} // namespace bb::srs::factories
