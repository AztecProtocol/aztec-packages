// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"

namespace bb {

class UltraRollupFlavor : public bb::UltraFlavor {
  public:
    static constexpr size_t num_frs_comm = FrCodec::calc_num_fields<Commitment>();
    static constexpr size_t num_frs_fr = FrCodec::calc_num_fields<FF>();
    static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS(size_t virtual_log_n = VIRTUAL_LOG_N)
    {
        return UltraFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS(virtual_log_n) + IPA_PROOF_LENGTH;
    }
    static constexpr size_t BACKEND_PUB_INPUTS_SIZE = RollupIO::PUBLIC_INPUTS_SIZE;

    using UltraFlavor::UltraFlavor;

    // Reuse UltraFlavor's VerificationKey (same codec and hash function)
    using VerificationKey = UltraFlavor::VerificationKey;

    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey>;
    using VKAndHash = VKAndHash_<FF, VerificationKey>;
};

} // namespace bb
