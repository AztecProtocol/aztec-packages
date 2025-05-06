#include "native_crs_factory.hpp"
#include "barretenberg/api/get_bn254_crs.hpp"
#include "barretenberg/api/get_grumpkin_crs.hpp"
#include "barretenberg/srs/factories/mem_bn254_crs_factory.hpp"
#include "barretenberg/srs/global_crs.hpp"

namespace bb::srs::factories {

/**
 * @brief Initialize a memory crs factory for bn254 based on a known dyadic circuit size
 *
 * @param dyadic_circuit_size power-of-2 circuit size
 */
MemBn254CrsFactory init_bn254_crs(const std::filesystem::path& path, size_t dyadic_circuit_size, bool allow_download)
{
    // Must +1 for Plonk only!
    auto bn254_g1_data = get_bn254_g1_data(path, dyadic_circuit_size + 1, allow_download);
    auto bn254_g2_data = get_bn254_g2_data(path);
    return { std::move(bn254_g1_data), bn254_g2_data };
}

/**
 * @brief Initialize a memory crs factory for grumpkin based on a known dyadic circuit size
 * @details Grumpkin crs is required only for the ECCVM
 *
 * @param dyadic_circuit_size power-of-2 circuit size
 */
MemGrumpkinCrsFactory init_grumpkin_crs(const std::filesystem::path& path,
                                        size_t eccvm_dyadic_circuit_size,
                                        bool allow_download)
{
    auto grumpkin_g1_data = get_grumpkin_g1_data(path, eccvm_dyadic_circuit_size + 1, allow_download);
    return { std::move(grumpkin_g1_data) };
}
} // namespace bb::srs::factories
