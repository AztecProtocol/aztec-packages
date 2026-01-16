#include "global_crs.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/srs/factories/mem_bn254_crs_factory.hpp"
#include "barretenberg/srs/factories/mem_grumpkin_crs_factory.hpp"
#include "barretenberg/srs/factories/native_crs_factory.hpp"

namespace {
std::shared_ptr<bb::srs::factories::CrsFactory<bb::curve::BN254>> bn254_crs_factory;       // NOLINT
std::shared_ptr<bb::srs::factories::CrsFactory<bb::curve::Grumpkin>> grumpkin_crs_factory; // NOLINT
} // namespace

namespace bb::srs {

std::filesystem::path bb_crs_path()
{
    char* crs_path = std::getenv("CRS_PATH");
    if (crs_path != nullptr) {
        return std::filesystem::path(crs_path);
    }
    // Detect home directory for default CRS path
    char* home = std::getenv("HOME");
    std::filesystem::path base = home != nullptr ? std::filesystem::path(home) : "./";
    return base / ".bb-crs";
}

void init_bn254_mem_crs_factory(std::vector<g1::affine_element> const& points, g2::affine_element const& g2_point)
{
    bn254_crs_factory = std::make_shared<factories::MemBn254CrsFactory>(points, g2_point);
}

void init_grumpkin_mem_crs_factory(std::vector<curve::Grumpkin::AffineElement> const& points)
{
    grumpkin_crs_factory = std::make_shared<factories::MemGrumpkinCrsFactory>(points);
}

// Initializes the crs using the memory buffers
void init_bn254_net_crs_factory(const std::filesystem::path& path)
{
    if (bn254_crs_factory != nullptr) {
        return;
    }
    bn254_crs_factory = std::make_shared<factories::NativeBn254CrsFactory>(path);
}

// Initializes crs from a file path this we use in the entire codebase
void init_bn254_file_crs_factory(const std::filesystem::path& path)
{
    if (bn254_crs_factory != nullptr) {
        return;
    }
    bn254_crs_factory = std::make_shared<factories::NativeBn254CrsFactory>(path, /* allow download = false */ false);
}

// Initializes the crs using the memory buffers
void init_grumpkin_net_crs_factory(const std::filesystem::path& path)
{
    if (grumpkin_crs_factory != nullptr) {
        return;
    }
    grumpkin_crs_factory = std::make_shared<factories::NativeGrumpkinCrsFactory>(path);
}

void init_grumpkin_file_crs_factory(const std::filesystem::path& path)
{
    if (grumpkin_crs_factory != nullptr) {
        return;
    }
    grumpkin_crs_factory =
        std::make_shared<factories::NativeGrumpkinCrsFactory>(path, /* allow download = false */ false);
}

std::shared_ptr<factories::CrsFactory<curve::BN254>> get_bn254_crs_factory()
{
    if (!bn254_crs_factory) {
        throw_or_abort("You need to initialize the global CRS with a call to init_crs_factory(...)!");
    }
    return bn254_crs_factory;
}

std::shared_ptr<factories::CrsFactory<curve::Grumpkin>> get_grumpkin_crs_factory()
{
    if (!grumpkin_crs_factory) {
        throw_or_abort("You need to initialize the global CRS with a call to init_grumpkin_crs_factory(...)!");
    }
    return grumpkin_crs_factory;
}

template <> std::shared_ptr<factories::CrsFactory<curve::BN254>> get_crs_factory()
{
    return get_bn254_crs_factory();
}

template <> std::shared_ptr<factories::CrsFactory<curve::Grumpkin>> get_crs_factory()
{
    return get_grumpkin_crs_factory();
}

} // namespace bb::srs
