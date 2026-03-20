#pragma once
#include <cstddef>
#include <string>

namespace bb::ignition {

struct VerificationReport {
    // Power-of-tau structure check
    bool structure_check_passed = false;
    size_t g1_points_verified = 0;
    size_t consecutive_pairs_verified = 0;

    // CDN hash cross-check
    bool hash_check_passed = false;
    size_t hash_chunks_verified = 0;
    size_t hash_points_covered = 0;

    // Chain linkage
    bool chain_check_passed = false;
    size_t participants_verified = 0;
    size_t chain_links_verified = 0;

    // Chain commitment (anti-tampering)
    bool chain_commitment_passed = false;
    bool chain_commitment_checked = false;

    // Transcript integrity
    size_t manifests_validated = 0;
    size_t on_curve_g1_checked = 0;
    size_t on_curve_g2_checked = 0;
    size_t blake2b_checksums_verified = 0;
    size_t blake2b_checksums_failed = 0;

    bool overall_passed() const
    {
        bool base = structure_check_passed && hash_check_passed && chain_check_passed;
        bool checksums_ok = (blake2b_checksums_failed == 0);
        bool commitment_ok = !chain_commitment_checked || chain_commitment_passed;
        return base && checksums_ok && commitment_ok;
    }

    std::string to_json() const;
    std::string to_human_readable() const;
};

} // namespace bb::ignition
