#include "crs_integrity.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "bn254_g1_chunk_hashes.hpp"
#include "grumpkin_crs_data.hpp"
#include <atomic>
#include <vector>

namespace bb::srs {
namespace {

using Pin = std::array<uint8_t, 32>;

/**
 * @brief Throw unless `points` fills the first `points.size() / chunk_points` chunks and each chunk, encoded, hashes
 * to its pin.
 * @param encode Writes `encoded_point_bytes` bytes for a point and returns false if the point is not acceptable.
 */
template <typename Point, typename Encode>
void verify_chunks(const char* name,
                   std::span<const Point> points,
                   std::span<const Pin> pins,
                   size_t chunk_points,
                   size_t encoded_point_bytes,
                   const Encode& encode)
{
    const size_t num_chunks = points.size() / chunk_points;
    if (points.empty() || points.size() % chunk_points != 0 || num_chunks > pins.size()) {
        throw_or_abort(format(name,
                              " SRS: ",
                              points.size(),
                              " points is not between 1 and ",
                              pins.size(),
                              " whole chunks of ",
                              chunk_points,
                              " points"));
    }

    std::atomic<bool> matches{ true };
    parallel_for([&](ThreadChunk thread_chunk) {
        const auto chunks = thread_chunk.range(num_chunks);
        // Most workers get no chunk; they must not allocate the buffer.
        if (chunks.empty()) {
            return;
        }
        std::vector<uint8_t> encoded(chunk_points * encoded_point_bytes);
        for (size_t c : chunks) {
            bool valid = true;
            for (size_t i = 0; valid && i < chunk_points; ++i) {
                valid = encode(points[(c * chunk_points) + i], encoded.data() + (i * encoded_point_bytes));
            }
            if (!valid || crypto::sha256(std::span<const uint8_t>(encoded)) != pins[c]) {
                matches.store(false, std::memory_order_relaxed);
            }
        }
    });
    // Thrown here, not inside parallel_for: an exception must not escape a worker thread.
    if (!matches.load()) {
        throw_or_abort(format(name, " SRS: the points do not match the pinned SHA-256 chunk hashes"));
    }
}

} // namespace

void verify_bn254_g1_points(std::span<const g1::affine_element> points)
{
    // The pin after the last full chunk covers a short tail, which is not accepted.
    const auto pins = std::span<const Pin>(BN254_G1_CHUNK_HASHES).first(SRS_NUM_FULL_CHUNKS);
    verify_chunks("BN254", points, pins, SRS_CHUNK_SIZE_POINTS, 32, [](const g1::affine_element& point, uint8_t* out) {
        if (point.is_point_at_infinity() || !point.on_curve()) {
            return false;
        }
        uint256_t compressed(point.x);
        if (uint256_t(point.y).get_bit(0)) {
            compressed.data[3] |= 0x8000000000000000ULL;
        }
        write(out, compressed);
        return true;
    });
}

void verify_grumpkin_g1_points(std::span<const curve::Grumpkin::AffineElement> points)
{
    verify_chunks("Grumpkin",
                  points,
                  std::span<const Pin>(GRUMPKIN_G1_CHUNK_HASHES),
                  GRUMPKIN_G1_CHUNK_SIZE_POINTS,
                  64,
                  [](const curve::Grumpkin::AffineElement& point, uint8_t* out) {
                      write(out, point);
                      return true;
                  });
}

} // namespace bb::srs
