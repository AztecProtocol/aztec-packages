#include "transcript_loader.hpp"
#include <barretenberg/common/throw_or_abort.hpp>
#include <barretenberg/ecc/curves/bn254/g1.hpp>
#include <barretenberg/ecc/curves/bn254/g2.hpp>
#include <cstring>
#include <fstream>

namespace bb::ignition {

void ignition_to_big_endian(const uint8_t* src, uint8_t* dst)
{
    // Ignition: [word0(8)][word1(8)][word2(8)][word3(8)] where word0 is least significant
    // Big-endian: [word3(8)][word2(8)][word1(8)][word0(8)] where word3 is most significant
    std::memcpy(dst, src + 24, 8);
    std::memcpy(dst + 8, src + 16, 8);
    std::memcpy(dst + 16, src + 8, 8);
    std::memcpy(dst + 24, src, 8);
}

G1 deserialize_ignition_g1(const uint8_t* data)
{
    // Convert both coordinates from Ignition mixed-endian to standard big-endian
    uint8_t buf[64];
    ignition_to_big_endian(data, buf);           // x coordinate
    ignition_to_big_endian(data + 32, buf + 32); // y coordinate

    // Deserialize as x-first big-endian (matches CDN / barretenberg's from_buffer convention)
    return G1::serialize_from_buffer(buf, /* write_x_first */ true);
}

G2 deserialize_ignition_g2(const uint8_t* data)
{
    // G2 coordinates are fq2 (two fq components: c0, c1), each 32 bytes in Ignition format
    // G2 point layout in Ignition: x.c0(32), x.c1(32), y.c0(32), y.c1(32)
    // Each component is in Ignition mixed-endian format
    uint8_t buf[128];
    ignition_to_big_endian(data, buf);           // x.c0
    ignition_to_big_endian(data + 32, buf + 32); // x.c1
    ignition_to_big_endian(data + 64, buf + 64); // y.c0
    ignition_to_big_endian(data + 96, buf + 96); // y.c1

    return G2::serialize_from_buffer(buf, /* write_x_first */ true);
}

TranscriptManifest parse_manifest(const uint8_t* data)
{
    TranscriptManifest m{};
    // All manifest fields are 4 bytes, big-endian
    auto read_u32 = [](const uint8_t* p) -> uint32_t {
        return (static_cast<uint32_t>(p[0]) << 24) | (static_cast<uint32_t>(p[1]) << 16) |
               (static_cast<uint32_t>(p[2]) << 8) | static_cast<uint32_t>(p[3]);
    };

    m.transcript_number = read_u32(data);
    m.total_transcripts = read_u32(data + 4);
    m.total_g1_points = read_u32(data + 8);
    m.total_g2_points = read_u32(data + 12);
    m.local_g1_points = read_u32(data + 16);
    m.local_g2_points = read_u32(data + 20);
    m.start_from = read_u32(data + 24);

    return m;
}

void validate_manifest(const TranscriptManifest& manifest, uint32_t expected_transcript_number)
{
    if (manifest.transcript_number != expected_transcript_number) {
        throw_or_abort("Manifest transcript number mismatch: expected " + std::to_string(expected_transcript_number) +
                       " got " + std::to_string(manifest.transcript_number));
    }
    if (manifest.total_transcripts != NUM_TRANSCRIPTS) {
        throw_or_abort("Manifest total_transcripts != 20: " + std::to_string(manifest.total_transcripts));
    }
    if (manifest.total_g1_points != TOTAL_G1_POINTS) {
        throw_or_abort("Manifest total_g1_points != 100800000: " + std::to_string(manifest.total_g1_points));
    }
    if (manifest.total_g2_points != 1) {
        throw_or_abort("Manifest total_g2_points != 1: " + std::to_string(manifest.total_g2_points));
    }
    if (manifest.local_g1_points != POINTS_PER_TRANSCRIPT) {
        throw_or_abort("Manifest local_g1_points != 5040000: " + std::to_string(manifest.local_g1_points));
    }
    uint32_t expected_local_g2 = (expected_transcript_number == 0) ? 2 : 0;
    if (manifest.local_g2_points != expected_local_g2) {
        throw_or_abort("Manifest local_g2_points mismatch: expected " + std::to_string(expected_local_g2) + " got " +
                       std::to_string(manifest.local_g2_points));
    }
    uint32_t expected_start = expected_transcript_number * POINTS_PER_TRANSCRIPT;
    if (manifest.start_from != expected_start) {
        throw_or_abort("Manifest start_from mismatch: expected " + std::to_string(expected_start) + " got " +
                       std::to_string(manifest.start_from));
    }
}

std::vector<G1> load_transcript_g1(const std::filesystem::path& path)
{
    std::ifstream file(path, std::ios::binary);
    if (!file) {
        throw_or_abort("Cannot open transcript file: " + path.string());
    }

    // Read manifest
    std::array<uint8_t, MANIFEST_SIZE> manifest_buf{};
    file.read(reinterpret_cast<char*>(manifest_buf.data()), MANIFEST_SIZE);
    if (!file) {
        throw_or_abort("Failed to read manifest from: " + path.string());
    }

    auto manifest = parse_manifest(manifest_buf.data());

    // Read G1 points section (size derived from manifest, not hardcoded)
    size_t g1_byte_count = static_cast<size_t>(manifest.local_g1_points) * BYTES_PER_G1_POINT;
    std::vector<uint8_t> g1_data(g1_byte_count);
    file.read(reinterpret_cast<char*>(g1_data.data()), static_cast<std::streamsize>(g1_byte_count));
    if (!file) {
        throw_or_abort("Failed to read G1 section from: " + path.string());
    }

    // Deserialize all G1 points
    std::vector<G1> points(manifest.local_g1_points);
    for (size_t i = 0; i < manifest.local_g1_points; ++i) {
        points[i] = deserialize_ignition_g1(g1_data.data() + i * BYTES_PER_G1_POINT);
        if (!points[i].on_curve()) {
            throw_or_abort("G1 point " + std::to_string(manifest.start_from + i) + " not on curve in " + path.string());
        }
    }

    return points;
}

std::pair<G2, G2> load_transcript_g2(const std::filesystem::path& path)
{
    std::ifstream file(path, std::ios::binary);
    if (!file) {
        throw_or_abort("Cannot open transcript file: " + path.string());
    }

    // Read manifest to determine G1 section size, then skip to G2 section
    std::array<uint8_t, MANIFEST_SIZE> manifest_buf{};
    file.read(reinterpret_cast<char*>(manifest_buf.data()), MANIFEST_SIZE);
    if (!file) {
        throw_or_abort("Failed to read manifest from: " + path.string());
    }
    auto manifest = parse_manifest(manifest_buf.data());
    size_t g1_byte_count = static_cast<size_t>(manifest.local_g1_points) * BYTES_PER_G1_POINT;
    size_t g2_offset = MANIFEST_SIZE + g1_byte_count;
    file.seekg(static_cast<std::streamoff>(g2_offset));
    if (!file) {
        throw_or_abort("Failed to seek to G2 section in: " + path.string());
    }

    // Read both G2 points (256 bytes total)
    std::array<uint8_t, 2 * BYTES_PER_G2_POINT> g2_data{};
    file.read(reinterpret_cast<char*>(g2_data.data()), 2 * BYTES_PER_G2_POINT);
    if (!file) {
        throw_or_abort("Failed to read G2 section from: " + path.string());
    }

    G2 cumulative = deserialize_ignition_g2(g2_data.data());
    G2 individual = deserialize_ignition_g2(g2_data.data() + BYTES_PER_G2_POINT);

    if (!cumulative.on_curve()) {
        throw_or_abort("Cumulative G2 point not on curve in: " + path.string());
    }
    if (!individual.on_curve()) {
        throw_or_abort("Individual G2 point not on curve in: " + path.string());
    }

    return { cumulative, individual };
}

} // namespace bb::ignition
