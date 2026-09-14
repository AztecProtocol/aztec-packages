#include "chain_check.hpp"
#include "chain_commitment.hpp"
#include "checksum_check.hpp"
#include "hash_check.hpp"
#include "participant_list.hpp"
#include "report.hpp"
#include "structure_check.hpp"
#include "transcript_loader.hpp"
#include <barretenberg/common/log.hpp>
#include <barretenberg/srs/factories/bn254_crs_data.hpp>
#include <barretenberg/srs/factories/bn254_g1_chunk_hashes.hpp>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <optional>
#include <string>

using namespace bb::ignition;

namespace {

void print_usage(const char* argv0)
{
    std::cerr << "Usage: " << argv0 << " <command> [options]\n\n"
              << "Commands:\n"
              << "  verify-structure <transcript_dir>   Verify power-of-tau structure of sealed transcripts\n"
              << "  verify-chain                        Verify 176-participant chain linkage (downloads from S3)\n"
              << "  verify-all <transcript_dir>         Run all verification checks\n"
              << "  compute-chain-commitment            Download chain data and print SHA-256 commitment\n\n"
              << "Arguments:\n"
              << "  transcript_dir  Directory containing sealed transcript00.dat through transcript19.dat\n\n"
              << "The transcript files can be downloaded from:\n"
              << "  https://aztec-ignition.s3.eu-west-2.amazonaws.com/MAIN+IGNITION/sealed/transcript00.dat\n"
              << "  (through transcript19.dat)\n";
}

std::vector<std::filesystem::path> get_transcript_paths(const std::filesystem::path& dir)
{
    std::vector<std::filesystem::path> paths;
    paths.reserve(NUM_TRANSCRIPTS);
    for (size_t i = 0; i < NUM_TRANSCRIPTS; ++i) {
        char filename[32];
        snprintf(filename, sizeof(filename), "transcript%02zu.dat", i);
        auto path = dir / filename;
        if (!std::filesystem::exists(path)) {
            throw_or_abort("Missing transcript file: " + path.string());
        }
        paths.emplace_back(std::move(path));
    }
    return paths;
}

struct StructureResult {
    VerificationReport report;
    G2 sealed_g2; // Pass to chain check for cross-validation
};

StructureResult run_structure_check(const std::filesystem::path& transcript_dir)
{
    VerificationReport report;
    auto paths = get_transcript_paths(transcript_dir);

    // Load G2 tau point from transcript 0 (first G2 = cumulative = tau·G2_gen for the sealed output)
    info("Loading G2 point from transcript 0...");
    auto [g2_cumulative, g2_individual] = load_transcript_g2(paths[0]);
    report.on_curve_g2_checked = 2;

    // Cross-check: sealed G2 must match the hardcoded CDN G2 in bn254_crs_data.hpp
    auto cdn_g2 = bb::srs::get_bn254_g2_crs_element();
    if (g2_cumulative != cdn_g2) {
        throw_or_abort("Sealed transcript G2 does not match CDN G2 from bn254_crs_data.hpp — "
                       "the ceremony output and barretenberg's hardcoded G2 are inconsistent");
    }
    info("  Sealed G2 matches CDN G2 (bn254_crs_data.hpp)");

    // Verify BLAKE2B checksums (catches corrupted downloads before expensive pairing work)
    info("Verifying BLAKE2B transcript checksums...");
    for (size_t i = 0; i < NUM_TRANSCRIPTS; ++i) {
        bool ok = verify_transcript_checksum(paths[i]);
        if (ok) {
            report.blake2b_checksums_verified++;
        } else {
            report.blake2b_checksums_failed++;
            info("  BLAKE2B checksum FAILED for transcript ", i);
        }
    }
    if (report.blake2b_checksums_failed == 0) {
        info("  All ", report.blake2b_checksums_verified, " BLAKE2B checksums valid");
    } else {
        info("  ", report.blake2b_checksums_failed, " checksum failures — transcript files may be corrupted");
    }

    // Validate manifests
    info("Validating manifests...");
    for (size_t i = 0; i < NUM_TRANSCRIPTS; ++i) {
        std::ifstream file(paths[i], std::ios::binary);
        std::array<uint8_t, MANIFEST_SIZE> buf{};
        file.read(reinterpret_cast<char*>(buf.data()), MANIFEST_SIZE);
        auto manifest = parse_manifest(buf.data());
        validate_manifest(manifest, static_cast<uint32_t>(i));
        report.manifests_validated++;
    }
    info("  All ", report.manifests_validated, " manifests valid");

    // Run power-of-tau verification
    info("Verifying power-of-tau structure (", TOTAL_G1_POINTS, " points across ", NUM_TRANSCRIPTS, " transcripts)...");
    bool structure_ok = verify_power_of_tau(
        paths, g2_cumulative, [](size_t done, size_t total) { info("  Chunk ", done, "/", total, " complete"); });

    report.structure_check_passed = structure_ok;
    report.g1_points_verified = TOTAL_G1_POINTS;
    report.on_curve_g1_checked = TOTAL_G1_POINTS;
    report.consecutive_pairs_verified = TOTAL_G1_POINTS - 1;

    if (structure_ok) {
        info("Power-of-tau structure: PASS");
    } else {
        info("Power-of-tau structure: FAIL");
    }

    // CDN hash cross-check
    info("Re-deriving CDN chunk hashes from verified data...");
    // We need the first 33,554,432 points. Load from transcripts (first ~6.7 transcripts).
    std::vector<G1> first_points;
    const size_t cdn_points_needed = bb::srs::SRS_TOTAL_POINTS - 1; // 33,554,432
    first_points.reserve(cdn_points_needed);
    for (size_t t = 0; t < NUM_TRANSCRIPTS && first_points.size() < cdn_points_needed; ++t) {
        auto chunk = load_transcript_g1(paths[t]);
        size_t take = std::min(chunk.size(), cdn_points_needed - first_points.size());
        first_points.insert(first_points.end(), chunk.begin(), chunk.begin() + static_cast<ptrdiff_t>(take));
        info("  Loaded transcript ", t, " for hash check (", first_points.size(), "/", cdn_points_needed, " points)");
    }

    size_t hash_mismatches = verify_cdn_chunk_hashes(first_points);
    report.hash_check_passed = (hash_mismatches == 0);
    report.hash_chunks_verified = bb::srs::SRS_NUM_CHUNKS;
    report.hash_points_covered = bb::srs::SRS_TOTAL_POINTS;

    if (hash_mismatches == 0) {
        info("CDN hash cross-check: PASS (", bb::srs::SRS_NUM_CHUNKS, " chunks match bn254_g1_chunk_hashes.hpp)");
    } else {
        info("CDN hash cross-check: FAIL (", hash_mismatches, " chunk mismatches)");
    }

    return { report, g2_cumulative };
}

VerificationReport run_chain_check(VerificationReport report,
                                   const std::filesystem::path& transcript_dir = {},
                                   const std::optional<G2>& structure_g2 = std::nullopt)
{
    info("\nVerifying chain linkage (176 participants + sealed)...");
    info("  Downloading participant data from S3 via Range requests (~55KB)...");

    auto chain_data = download_chain_data(std::string(S3_BASE_URL));
    report.on_curve_g2_checked += chain_data.size() * 2; // cumulative + individual per participant

    // Verify chain data against hardcoded commitment (anti-tampering)
    info("  Verifying chain data commitment...");
    report.chain_commitment_checked = true;
    report.chain_commitment_passed = verify_chain_commitment(chain_data);
    if (report.chain_commitment_passed) {
        info("  Chain commitment: PASS");
    } else {
        info("  Chain commitment: FAIL (chain data does not match hardcoded hash)");
    }

    // Cross-check: if we have local transcripts, verify the sealed first G1 point
    // from the Range request matches the first point in the local sealed transcript.
    if (!transcript_dir.empty()) {
        auto local_paths = get_transcript_paths(transcript_dir);
        // Read just the first G1 point from local transcript00.dat
        std::ifstream file(local_paths[0], std::ios::binary);
        file.seekg(MANIFEST_SIZE); // skip manifest
        std::array<uint8_t, BYTES_PER_G1_POINT> g1_buf{};
        file.read(reinterpret_cast<char*>(g1_buf.data()), BYTES_PER_G1_POINT);
        G1 local_first_g1 = deserialize_ignition_g1(g1_buf.data());

        const auto& sealed = chain_data.back();
        if (sealed.first_g1 != local_first_g1) {
            throw_or_abort("Chain sealed.first_g1 (from Range request) != local transcript00.dat first G1 — "
                           "S3 served inconsistent data between full download and Range request");
        }
        info("  Sealed G1 cross-check: Range request matches local transcript");
    }

    // Cross-check: sealed cumulative G2 from chain must match the G2 used in structure check
    if (structure_g2.has_value()) {
        const auto& sealed = chain_data.back();
        if (sealed.cumulative_g2 != structure_g2.value()) {
            throw_or_abort("Chain sealed.cumulative_g2 (from Range request) != G2 from local sealed transcript — "
                           "the chain and structure checks used different G2 points");
        }
        info("  Sealed G2 cross-check: chain G2 matches structure check G2");
    }

    info("  Verifying chain...");
    bool chain_ok = verify_chain(chain_data);
    report.chain_check_passed = chain_ok;
    report.participants_verified = NUM_PARTICIPANTS;
    report.chain_links_verified = chain_data.size() - 1; // 176 links (0→1, 1→2, ..., 175→sealed)

    if (chain_ok) {
        info("Chain linkage: PASS");
    } else {
        info("Chain linkage: FAIL");
    }

    return report;
}

} // namespace

int main(int argc, char* argv[])
{
    if (argc < 2) {
        print_usage(argv[0]);
        return 1;
    }

    std::string command = argv[1];

    try {
        if (command == "verify-structure" || command == "verify-all") {
            if (argc < 3) {
                std::cerr << "Error: " << command << " requires <transcript_dir> argument\n";
                print_usage(argv[0]);
                return 1;
            }

            std::filesystem::path transcript_dir = argv[2];
            auto [report, sealed_g2] = run_structure_check(transcript_dir);

            if (command == "verify-all") {
                report = run_chain_check(report, transcript_dir, sealed_g2);
            } else {
                // Structure-only mode: mark chain as not run (but don't fail overall)
                report.chain_check_passed = true;
            }

            std::cout << "\n" << report.to_human_readable() << std::endl;

            if (argc > 3 && std::string(argv[3]) == "--json") {
                std::cout << report.to_json() << std::endl;
            }

            return report.overall_passed() ? 0 : 1;

        } else if (command == "verify-chain") {
            VerificationReport report;
            report.structure_check_passed = true; // skip structure for chain-only
            report.hash_check_passed = true;
            report = run_chain_check(report);

            std::cout << "\n" << report.to_human_readable() << std::endl;
            return report.chain_check_passed ? 0 : 1;

        } else if (command == "compute-chain-commitment") {
            info("Downloading chain data from S3...");
            auto chain_data = download_chain_data(std::string(S3_BASE_URL));
            auto hash = compute_chain_commitment(chain_data);

            std::cout << "Chain commitment (SHA-256 over " << chain_data.size() << " entries, "
                      << chain_data.size() * 320 << " bytes):\n";
            std::cout << "{ ";
            for (size_t i = 0; i < hash.size(); ++i) {
                char buf[8];
                snprintf(buf, sizeof(buf), "0x%02x", hash[i]);
                std::cout << buf;
                if (i + 1 < hash.size()) {
                    std::cout << ", ";
                }
            }
            std::cout << " }\n";
            return 0;

        } else {
            std::cerr << "Unknown command: " << command << "\n";
            print_usage(argv[0]);
            return 1;
        }
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        return 1;
    }
}
