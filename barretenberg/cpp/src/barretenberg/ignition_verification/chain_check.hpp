#pragma once
#include "transcript_loader.hpp"
#include <string>
#include <vector>

namespace bb::ignition {

// Number of participants in the Ignition ceremony
static constexpr size_t NUM_PARTICIPANTS = 176;

/**
 * @brief Data needed from each participant for chain verification.
 * Only the first G1 point and both G2 points from transcript 0.
 */
struct ParticipantData {
    G1 first_g1;      // First G1 point (s_i · G1_gen)
    G2 cumulative_g2; // First G2 (s_i · G2_gen) — cumulative toxic waste
    G2 individual_g2; // Second G2 (z_i · G2_gen) — participant's individual secret
};

/**
 * @brief Download participant chain data from S3 via HTTP Range requests.
 *
 * For each of the 176 participants + sealed, fetches the first G1 point and both G2 points
 * from transcript00.dat. Total download is ~55KB.
 *
 * @param base_url S3 base URL (e.g., "http://aztec-ignition.s3.eu-west-2.amazonaws.com/MAIN+IGNITION")
 * @return Vector of 177 entries: 176 participants + sealed
 */
std::vector<ParticipantData> download_chain_data(const std::string& base_url);

/**
 * @brief Verify the full chain of 176 participant contributions plus sealed.
 *
 * Checks:
 * 1. Base case: participant 0's G1 and G2 are internally consistent
 *    e(participant[0].g1[0], G2_gen) == e(G1_gen, participant[0].cumulative_g2)
 * 2. Chain: for each consecutive pair (i, i+1):
 *    e(participant[i+1].g1[0], G2_gen) == e(participant[i].g1[0], participant[i+1].individual_g2)
 * 3. Sealed extends the last participant (same equation, sealed as i+1)
 *
 * @param chain_data 177 entries: participants[0..175] + sealed[176]
 * @return true if chain is valid
 */
bool verify_chain(const std::vector<ParticipantData>& chain_data);

} // namespace bb::ignition
