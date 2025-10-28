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

/**
 * @struct SrsInit
 * @brief Initialize BN254 and/or Grumpkin SRS from files or buffers
 *
 * This command allows flexible CRS initialization:
 * - Initialize one or both curves (BN254 and Grumpkin)
 * - Use file paths or raw buffers for each curve
 * - If both path and buffer are provided for a curve, buffer takes precedence
 * - If neither path nor buffer is provided for a curve, that curve is not initialized
 */
struct SrsInit {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "SrsInit";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "SrsInitResponse";
        uint8_t dummy = 0; // Empty response needs a dummy field for msgpack
        MSGPACK_FIELDS(dummy);
        bool operator==(const Response&) const = default;
    };

    // BN254 parameters (optional - initialize if provided)
    std::string bn254_path;                // File path to BN254 CRS (empty = not used)
    std::vector<uint8_t> bn254_points_buf; // G1 points (64 bytes each, empty = not used)
    uint32_t bn254_num_points = 0;         // Number of BN254 G1 points
    std::vector<uint8_t> bn254_g2_point;   // G2 point (128 bytes, empty = not used)

    // Grumpkin parameters (optional - initialize if provided)
    std::string grumpkin_path;                // File path to Grumpkin CRS (empty = not used)
    std::vector<uint8_t> grumpkin_points_buf; // Grumpkin affine elements (empty = not used)
    uint32_t grumpkin_num_points = 0;         // Number of Grumpkin points

    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(bn254_path,
                   bn254_points_buf,
                   bn254_num_points,
                   bn254_g2_point,
                   grumpkin_path,
                   grumpkin_points_buf,
                   grumpkin_num_points);
    bool operator==(const SrsInit&) const = default;
};

} // namespace bb::bbapi
