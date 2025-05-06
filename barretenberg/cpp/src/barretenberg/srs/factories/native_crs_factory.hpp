#pragma once
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/srs/factories/crs_factory.hpp"
#include "barretenberg/srs/factories/mem_bn254_crs_factory.hpp"
#include "barretenberg/srs/factories/mem_grumpkin_crs_factory.hpp"
#include <filesystem>
#include <memory>

namespace bb::srs::factories {
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
    std::shared_ptr<ProverCrs<curve::BN254>> get_prover_crs(size_t degree) override
    {
        if (degree > last_degree_) {
            mem_crs_ = std::make_shared<MemBn254CrsFactory>(init_bn254_crs(path_, degree, allow_download_));
            last_degree_ = degree;
        }
        return mem_crs_->get_prover_crs(degree);
    }
    std::shared_ptr<VerifierCrs<curve::BN254>> get_verifier_crs(size_t degree) override
    {
        if (degree > last_degree_) {
            mem_crs_ = std::make_shared<MemBn254CrsFactory>(init_bn254_crs(path_, degree, allow_download_));
            last_degree_ = degree;
        }
        return mem_crs_->get_verifier_crs(degree);
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
    std::shared_ptr<ProverCrs<curve::Grumpkin>> get_prover_crs(size_t degree) override
    {
        if (degree > last_degree_) {
            mem_crs_ = std::make_unique<MemGrumpkinCrsFactory>(init_grumpkin_crs(path_, degree, allow_download_));
            last_degree_ = degree;
        }
        return mem_crs_->get_prover_crs(degree);
    }

    std::shared_ptr<VerifierCrs<curve::Grumpkin>> get_verifier_crs(size_t degree) override
    {
        if (degree > last_degree_) {
            mem_crs_ = std::make_unique<MemGrumpkinCrsFactory>(init_grumpkin_crs(path_, degree, allow_download_));
            last_degree_ = degree;
        }
        return mem_crs_->get_verifier_crs(degree);
    }

  private:
    std::filesystem::path path_;
    bool allow_download_ = true;
    size_t last_degree_ = 0;
    std::unique_ptr<MemGrumpkinCrsFactory> mem_crs_;
};

} // namespace bb::srs::factories
