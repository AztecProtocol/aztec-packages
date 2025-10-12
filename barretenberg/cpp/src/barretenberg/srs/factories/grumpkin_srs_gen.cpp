#include "grumpkin_srs_gen.hpp"
#include "barretenberg/common/net.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"

namespace {
const std::string protocol_name = "BARRETENBERG_GRUMPKIN_IPA_CRS";
}

namespace bb::srs {

std::vector<grumpkin::g1::affine_element> generate_grumpkin_srs(size_t num_points)
{
    std::vector<grumpkin::g1::affine_element> srs(num_points);

    parallel_for_range(num_points, [&](size_t start, size_t end) {
        std::vector<uint8_t> hash_input;
        for (size_t point_idx = start; point_idx < end; ++point_idx) {
            bool rational_point_found = false;
            size_t attempt = 0;
            while (!rational_point_found) {
                hash_input.clear();
                // We hash
                // |BARRETENBERG_GRUMPKIN_IPA_CRS|POINT_INDEX_IN_LITTLE_ENDIAN|POINT_ATTEMPT_INDEX_IN_LITTLE_ENDIAN|
                std::copy(protocol_name.begin(), protocol_name.end(), std::back_inserter(hash_input));
                uint64_t point_index_le_order = htonll(static_cast<uint64_t>(point_idx));
                uint64_t point_attempt_le_order = htonll(static_cast<uint64_t>(attempt));
                hash_input.insert(hash_input.end(),
                                  reinterpret_cast<uint8_t*>(&point_index_le_order),
                                  reinterpret_cast<uint8_t*>(&point_index_le_order) + sizeof(uint64_t));
                hash_input.insert(hash_input.end(),
                                  reinterpret_cast<uint8_t*>(&point_attempt_le_order),
                                  reinterpret_cast<uint8_t*>(&point_attempt_le_order) + sizeof(uint64_t));
                auto hash_result = crypto::sha256(hash_input);
                uint256_t hash_result_uint(
                    ntohll(*reinterpret_cast<uint64_t*>(hash_result.data())),
                    ntohll(*reinterpret_cast<uint64_t*>(hash_result.data() + sizeof(uint64_t))),
                    ntohll(*reinterpret_cast<uint64_t*>(hash_result.data() + 2 * sizeof(uint64_t))),
                    ntohll(*reinterpret_cast<uint64_t*>(hash_result.data() + 3 * sizeof(uint64_t))));
                // We try to get a point from the resulting hash
                auto crs_element = grumpkin::g1::affine_element::from_compressed(hash_result_uint);
                // If the points coordinates are (0,0) then the compressed representation didn't land on an actual point
                // (happens half of the time) and we need to continue searching
                if (!crs_element.x.is_zero() || !crs_element.y.is_zero()) {
                    rational_point_found = true;
                    // Note: there used to be a mutex here, however there is no need as this is just a write to a
                    // computed (exclusive to this thread) memory location
                    srs.at(point_idx) = static_cast<grumpkin::g1::affine_element>(crs_element);
                    break;
                }
                attempt += 1;
            }
        }
    });

    return srs;
}

} // namespace bb::srs
