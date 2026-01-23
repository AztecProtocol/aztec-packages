#pragma once
/**
 * @file bbapi_srs.hpp
 * @brief SRS (Structured Reference String) initialization command definitions for the Barretenberg RPC API.
 *
 * This file contains command structures for initializing BN254 and Grumpkin SRS.
 */
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/named_union.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <vector>

namespace bb::bbapi {

/**
 * @struct SrsInitSrs
 * @brief Initialize BN254 SRS with G1 and G2 points
 */
struct SrsInitSrs {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "SrsInitSrs";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "SrsInitSrsResponse";
        uint8_t dummy = 0; // Empty response needs a dummy field for msgpack
        MSGPACK_FIELDS(dummy);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> points_buf; // G1 points (64 bytes each)
    uint32_t num_points;
    std::vector<uint8_t> g2_point; // G2 point (128 bytes)
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(points_buf, num_points, g2_point);
    bool operator==(const SrsInitSrs&) const = default;
};

/**
 * @struct SrsInitGrumpkinSrs
 * @brief Initialize Grumpkin SRS with Grumpkin points
 */
struct SrsInitGrumpkinSrs {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "SrsInitGrumpkinSrs";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "SrsInitGrumpkinSrsResponse";
        uint8_t dummy = 0; // Empty response needs a dummy field for msgpack
        MSGPACK_FIELDS(dummy);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> points_buf; // Grumpkin affine elements
    uint32_t num_points;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(points_buf, num_points);
    bool operator==(const SrsInitGrumpkinSrs&) const = default;
};

} // namespace bb::bbapi
