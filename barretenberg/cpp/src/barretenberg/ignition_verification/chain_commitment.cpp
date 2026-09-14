#include "chain_commitment.hpp"

namespace bb::ignition {

crypto::Sha256Hash compute_chain_commitment(const std::vector<ParticipantData>& chain_data)
{
    // 64 bytes per G1, 128 bytes per G2, 2 G2s per entry
    static constexpr size_t BYTES_PER_ENTRY = BYTES_PER_G1_POINT + 2 * BYTES_PER_G2_POINT; // 320

    std::vector<uint8_t> buffer(chain_data.size() * BYTES_PER_ENTRY);
    uint8_t* ptr = buffer.data();

    for (const auto& entry : chain_data) {
        G1::serialize_to_buffer(entry.first_g1, ptr, /* write_x_first */ true);
        ptr += BYTES_PER_G1_POINT;
        G2::serialize_to_buffer(entry.cumulative_g2, ptr, /* write_x_first */ true);
        ptr += BYTES_PER_G2_POINT;
        G2::serialize_to_buffer(entry.individual_g2, ptr, /* write_x_first */ true);
        ptr += BYTES_PER_G2_POINT;
    }

    return crypto::sha256(std::span<const uint8_t>(buffer));
}

bool verify_chain_commitment(const std::vector<ParticipantData>& chain_data)
{
    auto computed = compute_chain_commitment(chain_data);
    return computed == EXPECTED_CHAIN_COMMITMENT;
}

} // namespace bb::ignition
