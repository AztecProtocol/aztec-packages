#include "native_crs_factory.hpp"
#include "barretenberg/srs/factories/get_bn254_crs.hpp"
#include "barretenberg/srs/factories/get_grumpkin_crs.hpp"
#include "barretenberg/srs/factories/mem_bn254_crs_factory.hpp"
#include "barretenberg/srs/global_crs.hpp"

namespace bb::srs::factories {

/**
 * @brief Initialize a memory crs factory for bn254 based on a known dyadic circuit size
 *
 * @param dyadic_circuit_size power-of-2 circuit size
 * @param allow_download whether to download the crs files if they are not found. Useful for making sure benches and
 * tests do not rely on the network.
 */
MemBn254CrsFactory init_bn254_crs(const std::filesystem::path& path, size_t dyadic_circuit_size, bool allow_download)
{
    auto bn254_g1_data = get_bn254_g1_data(path, dyadic_circuit_size, allow_download);
    auto bn254_g2_data = get_bn254_g2_data(path);
    return { bn254_g1_data, bn254_g2_data };
}

/**
 * @brief Initialize a memory crs factory for grumpkin based on a known dyadic circuit size
 * @details Grumpkin crs is required only for the ECCVM
 *
 * @param dyadic_circuit_size power-of-2 circuit size
 * @param allow_download whether to download the crs files if they are not found. Useful for making sure benches and
 * tests do not rely on the network.
 */
MemGrumpkinCrsFactory init_grumpkin_crs(const std::filesystem::path& path,
                                        size_t eccvm_dyadic_circuit_size,
                                        bool allow_download)
{
    auto grumpkin_g1_data = get_grumpkin_g1_data(path, eccvm_dyadic_circuit_size, allow_download);
    return { grumpkin_g1_data };
}
} // namespace bb::srs::factories
