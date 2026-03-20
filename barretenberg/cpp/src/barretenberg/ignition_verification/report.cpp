#include "report.hpp"
#include <sstream>

namespace bb::ignition {

std::string VerificationReport::to_json() const
{
    // Hand-rolled JSON to avoid pulling in nlohmann/json as a link dependency.
    // This is a one-time verification tool; a full JSON library is overkill.
    std::ostringstream ss;
    ss << "{\n";
    ss << "  \"results\": {\n";

    ss << "    \"power_of_tau\": {\n";
    ss << "      \"status\": \"" << (structure_check_passed ? "PASS" : "FAIL") << "\",\n";
    ss << "      \"method\": \"batch_random_linear_combination\",\n";
    ss << "      \"security_bits\": 254,\n";
    ss << "      \"g1_points_verified\": " << g1_points_verified << ",\n";
    ss << "      \"consecutive_pairs_verified\": " << consecutive_pairs_verified << "\n";
    ss << "    },\n";

    ss << "    \"cdn_hash_cross_check\": {\n";
    ss << "      \"status\": \"" << (hash_check_passed ? "PASS" : "FAIL") << "\",\n";
    ss << "      \"method\": \"re-derived SHA-256 chunk hashes from verified S3 data\",\n";
    ss << "      \"chunks_verified\": " << hash_chunks_verified << ",\n";
    ss << "      \"points_covered\": " << hash_points_covered << "\n";
    ss << "    },\n";

    ss << "    \"chain_linkage\": {\n";
    ss << "      \"status\": \"" << (chain_check_passed ? "PASS" : "FAIL") << "\",\n";
    ss << "      \"participants\": " << participants_verified << ",\n";
    ss << "      \"pairings_verified\": " << chain_links_verified << ",\n";
    ss << "      \"commitment_check\": \""
       << (chain_commitment_checked ? (chain_commitment_passed ? "PASS" : "FAIL") : "SKIPPED") << "\"\n";
    ss << "    },\n";

    ss << "    \"transcript_integrity\": {\n";
    ss << "      \"manifests_valid\": " << manifests_validated << ",\n";
    ss << "      \"blake2b_checksums_verified\": " << blake2b_checksums_verified << ",\n";
    ss << "      \"blake2b_checksums_failed\": " << blake2b_checksums_failed << ",\n";
    ss << "      \"on_curve_g1_checked\": " << on_curve_g1_checked << ",\n";
    ss << "      \"on_curve_g2_checked\": " << on_curve_g2_checked << "\n";
    ss << "    }\n";

    ss << "  },\n";
    ss << "  \"overall\": \"" << (overall_passed() ? "PASS" : "FAIL") << "\"\n";
    ss << "}\n";

    return ss.str();
}

std::string VerificationReport::to_human_readable() const
{
    std::ostringstream ss;
    ss << "=== Ignition SRS Verification Report ===\n\n";

    ss << "Power-of-tau structure: " << (structure_check_passed ? "PASS" : "FAIL") << "\n";
    ss << "  " << g1_points_verified << " G1 points loaded\n";
    ss << "  " << consecutive_pairs_verified << " consecutive pairs verified\n\n";

    ss << "CDN hash cross-check:  " << (hash_check_passed ? "PASS" : "FAIL") << "\n";
    ss << "  " << hash_chunks_verified << " SHA-256 chunks re-derived and matched\n";
    ss << "  " << hash_points_covered << " points covered\n\n";

    ss << "Chain linkage:         " << (chain_check_passed ? "PASS" : "FAIL") << "\n";
    ss << "  " << participants_verified << " participants verified\n";
    ss << "  " << chain_links_verified << " chain links checked\n";
    ss << "  Commitment check: " << (chain_commitment_checked ? (chain_commitment_passed ? "PASS" : "FAIL") : "SKIPPED")
       << "\n\n";

    ss << "Transcript integrity:\n";
    ss << "  " << manifests_validated << " manifests validated\n";
    ss << "  " << blake2b_checksums_verified << " BLAKE2B checksums verified";
    if (blake2b_checksums_failed > 0) {
        ss << " (" << blake2b_checksums_failed << " FAILED)";
    }
    ss << "\n";
    ss << "  " << on_curve_g1_checked << " G1 on-curve checks\n";
    ss << "  " << on_curve_g2_checked << " G2 on-curve checks\n\n";

    ss << "OVERALL: " << (overall_passed() ? "PASS" : "FAIL") << "\n";

    return ss.str();
}

} // namespace bb::ignition
