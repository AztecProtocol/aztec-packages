#include "chain_check.hpp"
#include "participant_list.hpp"
#include <barretenberg/common/log.hpp>
#include <barretenberg/common/throw_or_abort.hpp>
#include <barretenberg/ecc/curves/bn254/pairing.hpp>
#include <barretenberg/srs/factories/http_download.hpp>

namespace bb::ignition {

namespace {

using Fq12 = Curve::TargetField;

bool check_pairing(const G1& lhs_g1, const G1& rhs_g1, const G2& rhs_g2)
{
    G1 neg_rhs = -rhs_g1;
    std::array<G1, 2> P = { lhs_g1, neg_rhs };
    std::array<G2, 2> Q = { G2::one(), rhs_g2 };
    Fq12 result = pairing::reduced_ate_pairing_batch(P.data(), Q.data(), 2);
    return result == Fq12::one();
}

ParticipantData fetch_participant_data(const std::string& base_url, const std::string& dir_name)
{
    std::string transcript_url = base_url + "/" + dir_name + "/transcript00.dat";

    // First G1 point: bytes 28-91 (64 bytes after 28-byte manifest)
    const size_t g1_start = MANIFEST_SIZE;
    const size_t g1_end = g1_start + BYTES_PER_G1_POINT - 1;

    // Both G2 points: after manifest + G1 section
    const size_t g2_start = MANIFEST_SIZE + G1_SECTION_SIZE;
    const size_t g2_end = g2_start + 2 * BYTES_PER_G2_POINT - 1;

    auto g1_data = srs::http_download(transcript_url, g1_start, g1_end);
    if (g1_data.size() != BYTES_PER_G1_POINT) {
        throw_or_abort("G1 download size mismatch for " + dir_name + ": got " + std::to_string(g1_data.size()));
    }

    auto g2_data = srs::http_download(transcript_url, g2_start, g2_end);
    if (g2_data.size() != 2 * BYTES_PER_G2_POINT) {
        throw_or_abort("G2 download size mismatch for " + dir_name + ": got " + std::to_string(g2_data.size()));
    }

    ParticipantData pd;
    pd.first_g1 = deserialize_ignition_g1(g1_data.data());
    pd.cumulative_g2 = deserialize_ignition_g2(g2_data.data());
    pd.individual_g2 = deserialize_ignition_g2(g2_data.data() + BYTES_PER_G2_POINT);

    if (!pd.first_g1.on_curve()) {
        throw_or_abort("G1 point not on curve for " + dir_name);
    }
    if (!pd.cumulative_g2.on_curve()) {
        throw_or_abort("Cumulative G2 not on curve for " + dir_name);
    }
    if (!pd.individual_g2.on_curve()) {
        throw_or_abort("Individual G2 not on curve for " + dir_name);
    }

    return pd;
}

} // namespace

std::vector<ParticipantData> download_chain_data(const std::string& base_url)
{
    std::vector<ParticipantData> result;
    result.reserve(NUM_PARTICIPANTS + 1);

    // Download data for all 176 participants
    for (size_t i = 0; i < NUM_PARTICIPANTS; ++i) {
        std::string dir_name(PARTICIPANT_DIRS[i]);
        info("  Downloading participant ", i + 1, "/", NUM_PARTICIPANTS, ": ", dir_name);
        result.push_back(fetch_participant_data(base_url, dir_name));
    }

    // Download sealed data
    info("  Downloading sealed transcript...");
    result.push_back(fetch_participant_data(base_url, "sealed"));

    return result;
}

bool verify_chain(const std::vector<ParticipantData>& chain_data)
{
    if (chain_data.size() < 2) {
        throw_or_abort("Need at least 2 entries for chain verification (participant 0 + sealed)");
    }

    // Base case: verify participant 0's G1 and G2 are internally consistent
    // e(participant[0].g1[0], G2_gen) == e(G1_gen, participant[0].cumulative_g2)
    {
        G1 neg_gen = -G1::one();
        std::array<G1, 2> P = { chain_data[0].first_g1, neg_gen };
        std::array<G2, 2> Q = { G2::one(), chain_data[0].cumulative_g2 };
        Fq12 result = pairing::reduced_ate_pairing_batch(P.data(), Q.data(), 2);
        if (result != Fq12::one()) {
            info("Chain verification FAILED at base case (participant 0)");
            return false;
        }
    }
    info("  Base case (participant 0): PASS");

    // Chain: for each consecutive pair
    for (size_t i = 0; i + 1 < chain_data.size(); ++i) {
        if (!check_pairing(chain_data[i + 1].first_g1, chain_data[i].first_g1, chain_data[i + 1].individual_g2)) {
            info("Chain verification FAILED at link ", i, " -> ", i + 1);
            return false;
        }
    }

    info("  All ", chain_data.size() - 1, " chain links: PASS");
    return true;
}

} // namespace bb::ignition
