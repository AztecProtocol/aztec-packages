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
#include <limits>
#include <vector>

namespace bb::srs {
namespace {

constexpr size_t NO_FAILURE = std::numeric_limits<size_t>::max();

// Keeps the smallest failing index, so the reported failure does not depend on thread scheduling.
void record_failure(std::atomic<size_t>& slot, size_t value)
{
    size_t current = slot.load(std::memory_order_relaxed);
    while (value < current && !slot.compare_exchange_weak(current, value, std::memory_order_relaxed)) {
    }
}

struct Bn254Pins {
    static constexpr const char* NAME = "BN254";
    static constexpr size_t CHUNK_POINTS = SRS_CHUNK_SIZE_POINTS;
    // The short tail chunk after the last full chunk is not accepted.
    static constexpr size_t MAX_POINTS = SRS_NUM_FULL_CHUNKS * SRS_CHUNK_SIZE_POINTS;
    static constexpr size_t ENCODED_POINT_BYTES = 32;
    static const std::array<uint8_t, 32>& hash(size_t chunk) { return BN254_G1_CHUNK_HASHES[chunk]; }
    static bool valid(const g1::affine_element& point) { return !point.is_point_at_infinity() && point.on_curve(); }
    static void encode(const g1::affine_element& point, uint8_t* out)
    {
        uint256_t compressed(point.x);
        if (uint256_t(point.y).get_bit(0)) {
            compressed.data[3] |= 0x8000000000000000ULL;
        }
        write(out, compressed);
    }
};

struct GrumpkinPins {
    static constexpr const char* NAME = "Grumpkin";
    static constexpr size_t CHUNK_POINTS = GRUMPKIN_G1_CHUNK_SIZE_POINTS;
    static constexpr size_t MAX_POINTS = GRUMPKIN_G1_NUM_POINTS;
    static constexpr size_t ENCODED_POINT_BYTES = 64;
    static const std::array<uint8_t, 32>& hash(size_t chunk) { return GRUMPKIN_G1_CHUNK_HASHES[chunk]; }
    static bool valid(const curve::Grumpkin::AffineElement& point) { return !point.is_point_at_infinity(); }
    static void encode(const curve::Grumpkin::AffineElement& point, uint8_t* out) { write(out, point); }
};

template <typename Pins, typename AffineElement> void verify_points(std::span<const AffineElement> points)
{
    if (points.empty() || points.size() > Pins::MAX_POINTS || points.size() % Pins::CHUNK_POINTS != 0) {
        throw_or_abort(format(Pins::NAME,
                              " SRS: ",
                              points.size(),
                              " points is not a whole number of ",
                              Pins::CHUNK_POINTS,
                              "-point chunks between 1 and ",
                              Pins::MAX_POINTS,
                              " points"));
    }

    const size_t num_chunks = points.size() / Pins::CHUNK_POINTS;
    std::atomic<size_t> first_bad_point{ NO_FAILURE };
    std::atomic<size_t> first_bad_chunk{ NO_FAILURE };
    parallel_for([&](ThreadChunk thread_chunk) {
        const auto chunks = thread_chunk.range(num_chunks);
        if (chunks.empty()) {
            return;
        }
        std::vector<uint8_t> encoded(Pins::CHUNK_POINTS * Pins::ENCODED_POINT_BYTES);
        for (size_t c : chunks) {
            const size_t begin = c * Pins::CHUNK_POINTS;
            bool chunk_points_valid = true;
            for (size_t i = 0; i < Pins::CHUNK_POINTS; ++i) {
                const auto& point = points[begin + i];
                if (!Pins::valid(point)) {
                    record_failure(first_bad_point, begin + i);
                    chunk_points_valid = false;
                    break;
                }
                Pins::encode(point, encoded.data() + (i * Pins::ENCODED_POINT_BYTES));
            }
            if (chunk_points_valid && crypto::sha256(std::span<const uint8_t>(encoded)) != Pins::hash(c)) {
                record_failure(first_bad_chunk, c);
            }
        }
    });

    // Thrown here, not inside parallel_for: an exception must not escape a worker thread.
    if (const size_t bad = first_bad_point.load(); bad != NO_FAILURE) {
        throw_or_abort(format(Pins::NAME, " SRS: point ", bad, " is the point at infinity or is not on the curve"));
    }
    if (const size_t bad = first_bad_chunk.load(); bad != NO_FAILURE) {
        throw_or_abort(format(Pins::NAME,
                              " SRS: points ",
                              bad * Pins::CHUNK_POINTS,
                              " to ",
                              ((bad + 1) * Pins::CHUNK_POINTS) - 1,
                              " do not match the pinned SHA-256 hash of chunk ",
                              bad));
    }
}

} // namespace

void verify_bn254_g1_points(std::span<const g1::affine_element> points)
{
    verify_points<Bn254Pins>(points);
}

void verify_grumpkin_g1_points(std::span<const curve::Grumpkin::AffineElement> points)
{
    verify_points<GrumpkinPins>(points);
}

} // namespace bb::srs
