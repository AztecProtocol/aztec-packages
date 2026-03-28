#pragma once
/**
 * @file bbapi_srs.hpp
 * @brief SRS (Structured Reference String) initialization command definitions for the Barretenberg RPC API.
 *
 * This file contains command structures for initializing BN254 and Grumpkin SRS.
 */
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/named_union.hpp"
#include <cstdint>
#include <vector>

namespace bb::bbapi {

/**
 * @struct BbSrsInitSrs
 * @brief Initialize BN254 SRS with G1 and G2 points
 */
struct BbSrsInitSrs {

    struct Response {
        uint8_t dummy = 0; // Empty response needs a dummy field for msgpack
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> points_buf; // G1 points (32 bytes each, compressed)
    uint32_t num_points;
    std::vector<uint8_t> g2_point; // G2 point (128 bytes)
    Response execute(BbRequest& request) &&;
    bool operator==(const BbSrsInitSrs&) const = default;
};

/**
 * @struct BbSrsInitGrumpkinSrs
 * @brief Initialize Grumpkin SRS with Grumpkin points
 */
struct BbSrsInitGrumpkinSrs {

    struct Response {
        uint8_t dummy = 0; // Empty response needs a dummy field for msgpack
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> points_buf; // Grumpkin affine elements
    uint32_t num_points;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbSrsInitGrumpkinSrs&) const = default;
};

} // namespace bb::bbapi
