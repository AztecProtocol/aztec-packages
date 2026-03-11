// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/flavor/flavor_concepts.hpp"
#include "barretenberg/flavor/multi_mega_flavor.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb {

/**
 * @brief Verifier for MultiMega flavors using interleaved commitments.
 * @details Inherits from UltraVerifier_ to reuse compute_log_n, compute_padding_indicator_array,
 *          and verify_proof structure. Overrides reduce_to_pairing_check with interleaved claim batching.
 *
 * @tparam Flavor_ MultiMegaFlavor, MultiMegaZKFlavor, or recursive variants
 * @tparam IO Public input type (DefaultIO for native, stdlib variants for recursive)
 */
template <IsMultiMegaFlavor Flavor_, class IO = DefaultIO>
class MultiHonkVerifier_ : public UltraVerifier_<Flavor_, IO> {
    using Base = UltraVerifier_<Flavor_, IO>;

  public:
    using Flavor = Flavor_;
    using typename Base::Commitment;
    using typename Base::Curve;
    using typename Base::FF;
    using typename Base::Instance;
    using typename Base::PairingPoints;
    using typename Base::Proof;
    using typename Base::Transcript;

    using ReductionResult = typename Base::ReductionResult;
    using Output = typename Base::Output;

    static constexpr bool IsRecursive = Base::IsRecursive;

    explicit MultiHonkVerifier_(const std::shared_ptr<typename Base::VKAndHash>& vk_and_hash,
                                const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>())
        : Base(vk_and_hash, transcript)
    {}

    /**
     * @brief Reduce proof to pairing check using interleaved claim batching.
     */
    [[nodiscard("Reduction result should be verified")]] ReductionResult reduce_to_pairing_check(const Proof& proof);

    /**
     * @brief Verify the proof.
     */
    Output verify_proof(const Proof& proof);

    /**
     * @brief Get interleaved commitments.
     */
    const typename Flavor::InterleavedCommitments& get_interleaved_commitments() const
    {
        return this->verifier_instance->interleaved_commitments;
    }

    /**
     * @brief Get calldata commitment (for databus consistency check in Chonk).
     */
    const Commitment& get_calldata_commitment() const
    {
        return this->verifier_instance->interleaved_commitments.interleaved_calldata;
    }

    /**
     * @brief Get ECC op wire commitments as an array (for merge protocol in Chonk).
     */
    auto get_ecc_op_wires() const { return this->verifier_instance->witness_commitments.get_ecc_op_wires().get_copy(); }
};

using MultiHonkVerifier = MultiHonkVerifier_<MultiMegaFlavor>;

} // namespace bb
