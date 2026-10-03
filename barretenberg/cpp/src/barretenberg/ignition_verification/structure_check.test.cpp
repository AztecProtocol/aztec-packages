#include "structure_check.hpp"
#include "transcript_loader.hpp"
#include <barretenberg/ecc/curves/bn254/bn254.hpp>
#include <barretenberg/ecc/curves/bn254/pairing.hpp>
#include <barretenberg/numeric/random/engine.hpp>
#include <filesystem>
#include <fstream>
#include <gtest/gtest.h>

using namespace bb::ignition;
using Fr = Curve::ScalarField;

namespace {

/**
 * @brief Write a synthetic transcript file in Ignition format.
 * @param path Output path
 * @param points G1 points to write
 * @param transcript_number Transcript index (0-19)
 * @param g2_cumulative Optional G2 point (written for transcript 0)
 * @param g2_individual Optional second G2 point (written for transcript 0)
 */
void write_synthetic_transcript(const std::filesystem::path& path,
                                const std::vector<G1>& points,
                                uint32_t transcript_number,
                                const G2* g2_cumulative = nullptr,
                                const G2* g2_individual = nullptr)
{
    std::ofstream file(path, std::ios::binary);
    ASSERT_TRUE(file.good());

    auto write_u32_be = [&](uint32_t val) {
        uint8_t buf[4] = { static_cast<uint8_t>(val >> 24),
                           static_cast<uint8_t>(val >> 16),
                           static_cast<uint8_t>(val >> 8),
                           static_cast<uint8_t>(val) };
        file.write(reinterpret_cast<const char*>(buf), 4);
    };

    // Manifest (28 bytes)
    uint32_t total_points = static_cast<uint32_t>(points.size()); // simplified for test
    uint32_t local_g2 = (transcript_number == 0 && g2_cumulative != nullptr) ? 2 : 0;
    write_u32_be(transcript_number);
    write_u32_be(1);            // total_transcripts (1 for test)
    write_u32_be(total_points); // total_g1
    write_u32_be(1);            // total_g2
    write_u32_be(total_points); // local_g1
    write_u32_be(local_g2);
    write_u32_be(0); // start_from

    // Write G1 points in Ignition format (x-first, mixed-endian)
    for (const auto& point : points) {
        // Serialize to big-endian first
        uint8_t be_buf[64];
        G1::serialize_to_buffer(point, be_buf, /* write_x_first */ true);

        // Convert each coordinate from big-endian to Ignition mixed-endian
        // (reverse the 8-byte word order within each 32-byte coordinate)
        auto big_endian_to_ignition = [](const uint8_t* be, uint8_t* ig) {
            std::memcpy(ig, be + 24, 8);
            std::memcpy(ig + 8, be + 16, 8);
            std::memcpy(ig + 16, be + 8, 8);
            std::memcpy(ig + 24, be, 8);
        };

        uint8_t ig_buf[64];
        big_endian_to_ignition(be_buf, ig_buf);           // x
        big_endian_to_ignition(be_buf + 32, ig_buf + 32); // y
        file.write(reinterpret_cast<const char*>(ig_buf), 64);
    }

    // Write G2 points if transcript 0
    if (transcript_number == 0 && g2_cumulative != nullptr && g2_individual != nullptr) {
        auto write_g2_ignition = [&](const G2& g2) {
            uint8_t be_buf[128];
            G2::serialize_to_buffer(g2, be_buf, /* write_x_first */ true);

            auto big_endian_to_ignition = [](const uint8_t* be, uint8_t* ig) {
                std::memcpy(ig, be + 24, 8);
                std::memcpy(ig + 8, be + 16, 8);
                std::memcpy(ig + 16, be + 8, 8);
                std::memcpy(ig + 24, be, 8);
            };

            uint8_t ig_buf[128];
            // fq2 has c0 and c1, each 32 bytes
            big_endian_to_ignition(be_buf, ig_buf);           // x.c0
            big_endian_to_ignition(be_buf + 32, ig_buf + 32); // x.c1
            big_endian_to_ignition(be_buf + 64, ig_buf + 64); // y.c0
            big_endian_to_ignition(be_buf + 96, ig_buf + 96); // y.c1
            file.write(reinterpret_cast<const char*>(ig_buf), 128);
        };
        write_g2_ignition(*g2_cumulative);
        write_g2_ignition(*g2_individual);
    }

    // Write dummy BLAKE2B hash (64 zero bytes — we don't verify it)
    std::array<uint8_t, 64> dummy_hash{};
    file.write(reinterpret_cast<const char*>(dummy_hash.data()), 64);
}

} // namespace

TEST(IgnitionStructureCheck, SyntheticSRSPasses)
{
    // Generate a small valid power-of-tau SRS: [τ·G, τ²·G, ..., τ^N·G]
    constexpr size_t N = 100;
    auto& engine = bb::numeric::get_debug_randomness();
    Fr tau = Fr::random_element(&engine);

    std::vector<G1> points(N);
    Fr tau_power = tau;
    for (size_t i = 0; i < N; ++i) {
        points[i] = G1::one() * tau_power;
        tau_power *= tau;
    }

    G2 g2_tau = G2::one() * tau;

    // Write to a temporary transcript file
    auto tmp_dir = std::filesystem::temp_directory_path() / "ignition_test_structure";
    std::filesystem::create_directories(tmp_dir);
    auto transcript_path = tmp_dir / "transcript00.dat";
    write_synthetic_transcript(transcript_path, points, 0, &g2_tau, &g2_tau);

    // Verify: should pass
    // We need to override the manifest validation since our synthetic data has non-standard counts.
    // Instead, load the points directly and use the non-chunked path.
    auto loaded = load_transcript_g1(transcript_path);
    ASSERT_EQ(loaded.size(), N);

    // Verify each loaded point matches
    tau_power = tau;
    for (size_t i = 0; i < N; ++i) {
        G1 expected = G1::one() * tau_power;
        EXPECT_EQ(loaded[i], expected) << "Point " << i << " mismatch after roundtrip";
        tau_power *= tau;
    }

    // Clean up
    std::filesystem::remove_all(tmp_dir);
}

TEST(IgnitionStructureCheck, SyntheticPairingCheckPasses)
{
    // Small power-of-tau: verify the batch pairing check works
    constexpr size_t N = 50;
    auto& engine = bb::numeric::get_debug_randomness();
    Fr tau = Fr::random_element(&engine);

    std::vector<G1> points(N);
    Fr tau_power = tau;
    for (size_t i = 0; i < N; ++i) {
        points[i] = G1::one() * tau_power;
        tau_power *= tau;
    }

    G2 g2_tau = G2::one() * tau;

    // Write as transcript and run verify_power_of_tau
    auto tmp_dir = std::filesystem::temp_directory_path() / "ignition_test_pairing";
    std::filesystem::create_directories(tmp_dir);
    auto transcript_path = tmp_dir / "transcript00.dat";
    write_synthetic_transcript(transcript_path, points, 0, &g2_tau, &g2_tau);

    bool result = verify_power_of_tau({ transcript_path }, g2_tau);
    EXPECT_TRUE(result) << "Valid synthetic SRS should pass power-of-tau check";

    // Clean up
    std::filesystem::remove_all(tmp_dir);
}

TEST(IgnitionStructureCheck, MutatedPointFails)
{
    // Same as above but mutate one point — should fail
    constexpr size_t N = 50;
    auto& engine = bb::numeric::get_debug_randomness();
    Fr tau = Fr::random_element(&engine);

    std::vector<G1> points(N);
    Fr tau_power = tau;
    for (size_t i = 0; i < N; ++i) {
        points[i] = G1::one() * tau_power;
        tau_power *= tau;
    }

    // Mutate point 25 to a random point
    points[25] = G1::one() * Fr::random_element(&engine);

    G2 g2_tau = G2::one() * tau;

    auto tmp_dir = std::filesystem::temp_directory_path() / "ignition_test_mutated";
    std::filesystem::create_directories(tmp_dir);
    auto transcript_path = tmp_dir / "transcript00.dat";
    write_synthetic_transcript(transcript_path, points, 0, &g2_tau, &g2_tau);

    bool result = verify_power_of_tau({ transcript_path }, g2_tau);
    EXPECT_FALSE(result) << "Mutated SRS should fail power-of-tau check";

    // Clean up
    std::filesystem::remove_all(tmp_dir);
}
