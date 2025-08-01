// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"

namespace bb {

class UltraRollupFlavor : public bb::UltraFlavor {
  public:
    static constexpr size_t num_frs_comm = bb::field_conversion::calc_num_bn254_frs<Commitment>();
    static constexpr size_t num_frs_fr = bb::field_conversion::calc_num_bn254_frs<FF>();
    static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS =
        UltraFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS + IPA_PROOF_LENGTH;
    static constexpr size_t BACKEND_PUB_INPUTS_SIZE = PAIRING_POINTS_SIZE + IPA_CLAIM_SIZE;

    using UltraFlavor::UltraFlavor;

    /**
     * @brief The verification key is responsible for storing the commitments to the precomputed (non-witnessk)
     * polynomials used by the verifier.
     *
     * @note Note the discrepancy with what sort of data is stored here vs in the proving key. We may want to resolve
     * that, and split out separate PrecomputedPolynomials/Commitments data for clarity but also for portability of our
     * circuits.
     */
    class VerificationKey : public NativeVerificationKey_<PrecomputedEntities<Commitment>, Transcript> {
      public:
        static constexpr size_t VERIFICATION_KEY_LENGTH = UltraFlavor::VerificationKey::VERIFICATION_KEY_LENGTH;

        virtual ~VerificationKey() = default;

        bool operator==(const VerificationKey&) const = default;
        VerificationKey() = default;
        VerificationKey(const size_t circuit_size, const size_t num_public_inputs)
            : NativeVerificationKey_(circuit_size, num_public_inputs)
        {}

        VerificationKey(const PrecomputedData& precomputed)
        {
            this->log_circuit_size = numeric::get_msb(precomputed.metadata.dyadic_size);
            this->num_public_inputs = precomputed.metadata.num_public_inputs;
            this->pub_inputs_offset = precomputed.metadata.pub_inputs_offset;

            CommitmentKey commitment_key{ precomputed.metadata.dyadic_size };
            for (auto [polynomial, commitment] : zip_view(precomputed.polynomials, this->get_all())) {
                commitment = commitment_key.commit(polynomial);
            }
        }
    };

    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey>;
};

// Serialization methods for UltraRollupFlavor::VerificationKey
inline void read(uint8_t const*& it, UltraRollupFlavor::VerificationKey& vk)
{
    using serialize::read;

    // First, read the field elements from the buffer
    std::vector<bb::fr> field_elements;
    read(it, field_elements);

    // Then use from_field_elements to populate the verification key
    vk.from_field_elements(field_elements);
}

inline void write(std::vector<uint8_t>& buf, UltraRollupFlavor::VerificationKey const& vk)
{
    using serialize::write;

    // First, convert the verification key to field elements
    auto field_elements = vk.to_field_elements();

    // Then write the field elements to the buffer
    write(buf, field_elements);
}

} // namespace bb
