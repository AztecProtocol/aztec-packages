#pragma once
#include "./factories/crs_factory.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <filesystem>

namespace bb::srs {
// Path to ~/.bb-crs where we store the downloaded crs files
std::filesystem::path bb_crs_path();

// Initializes the crs using files
void init_bn254_file_crs_factory(const std::filesystem::path& path);
void init_grumpkin_file_crs_factory(const std::filesystem::path& path);
inline void init_file_crs_factory(const std::filesystem::path& path)
{
    init_bn254_file_crs_factory(path);
    init_grumpkin_file_crs_factory(path);
}

// Initializes the crs using memory buffers
void init_grumpkin_mem_crs_factory(std::vector<curve::Grumpkin::AffineElement> const& points);
void init_bn254_mem_crs_factory(std::vector<bb::g1::affine_element> const& points,
                                bb::g2::affine_element const& g2_point);

// Initializes the crs using files if available, otherwise using the network
void init_grumpkin_net_crs_factory(const std::filesystem::path& path);
void init_bn254_net_crs_factory(const std::filesystem::path& path);

inline void init_net_crs_factory(const std::filesystem::path& path)
{
    init_bn254_net_crs_factory(path);
    init_grumpkin_net_crs_factory(path);
}

std::shared_ptr<factories::CrsFactory<curve::BN254>> get_bn254_crs_factory();
std::shared_ptr<factories::CrsFactory<curve::Grumpkin>> get_grumpkin_crs_factory();

template <typename Curve> std::shared_ptr<factories::CrsFactory<Curve>> get_crs_factory();

} // namespace bb::srs
