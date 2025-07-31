// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/pairing_points.hpp"

namespace bb {

/**
 * @brief Manages the data that is propagated on the public inputs of an application/function circuit
 *
 */
class DefaultIO {
  public:
    using FF = curve::BN254::ScalarField;

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1478): Can we define this constant as part of
    // PairingPoints (cascading it down from Fq)?
    static constexpr size_t PUBLIC_INPUTS_SIZE = PAIRING_POINTS_SIZE;

    PairingPoints pairing_inputs;

    /**
     * @brief Reconstructs the IO components from a public inputs array.
     *
     * @param public_inputs Public inputs array containing the serialized kernel public inputs.
     */
    void reconstruct_from_public(const std::vector<FF>& public_inputs)
    {
        // Assumes that the app-io public inputs are at the end of the public_inputs vector
        uint32_t index = static_cast<uint32_t>(public_inputs.size() - PUBLIC_INPUTS_SIZE);

        const std::span<const FF, PAIRING_POINTS_SIZE> pairing_point_limbs(public_inputs.data() + index,
                                                                           PAIRING_POINTS_SIZE);
        pairing_inputs = PairingPoints::reconstruct_from_public(pairing_point_limbs);
    }
};

/**
 * @brief Manages the data that is propagated on the public inputs of of a hiding kernel circuit
 */
class HidingKernelIO {
  public:
    using FF = curve::BN254::ScalarField;
    using G1 = curve::BN254::AffineElement;

    // Number of columns that jointly constitute the op_queue, should be the same as the number of wires in the
    // MegaCircuitBuilder
    static constexpr size_t NUM_WIRES = 4;

    // Number of bb::fr field elements used to represent a goblin element in the public inputs
    // The element is of goblin type because the HidingKernel is always employed with a MegaBuilder
    static constexpr size_t G1_PUBLIC_INPUTS_SIZE = FQ_PUBLIC_INPUT_SIZE * 2;
    static constexpr size_t PUBLIC_INPUTS_SIZE = NUM_WIRES * G1_PUBLIC_INPUTS_SIZE + PAIRING_POINTS_SIZE;

    PairingPoints pairing_inputs;
    std::array<G1, NUM_WIRES> ecc_op_tables;

    /**
     * @brief Reconstructs the IO components from a public inputs array.
     *
     * @param public_inputs Public inputs array containing the serialized kernel public inputs.
     */
    void reconstruct_from_public(const std::vector<FF>& public_inputs)
    {
        // Assumes that the hiding-kernel-io public inputs are at the end of the public_inputs vector
        uint32_t index = static_cast<uint32_t>(public_inputs.size() - PUBLIC_INPUTS_SIZE);

        const std::span<const FF, PAIRING_POINTS_SIZE> pairing_inputs_limbs(public_inputs.data() + index,
                                                                            PAIRING_POINTS_SIZE);
        index += PAIRING_POINTS_SIZE;
        pairing_inputs = PairingPoints::reconstruct_from_public(pairing_inputs_limbs);

        for (auto& commitment : ecc_op_tables) {
            const std::span<const FF, G1_PUBLIC_INPUTS_SIZE> ecc_op_table_limbs(public_inputs.data() + index,
                                                                                G1_PUBLIC_INPUTS_SIZE);
            commitment = G1::reconstruct_from_public(ecc_op_table_limbs);
            index += G1_PUBLIC_INPUTS_SIZE;
        }
    }
};

/**
 * @brief The data that is propagated on the public inputs of a rollup circuit
 */
class RollupIO {
  public:
    using FF = curve::BN254::ScalarField;
    using IpaClaim = OpeningClaim<bb::curve::Grumpkin>;

    static constexpr size_t PUBLIC_INPUTS_SIZE = PAIRING_POINTS_SIZE + IPA_CLAIM_SIZE;

    PairingPoints pairing_inputs;
    IpaClaim ipa_claim;

    /**
     * @brief Reconstructs the IO components from a public inputs array.
     *
     * @param public_inputs Public inputs array containing the serialized kernel public inputs.
     */
    void reconstruct_from_public(const std::vector<FF>& public_inputs)
    {
        // Assumes that the app-io public inputs are at the end of the public_inputs vector
        uint32_t index = static_cast<uint32_t>(public_inputs.size() - PUBLIC_INPUTS_SIZE);

        const std::span<const FF, PAIRING_POINTS_SIZE> pairing_inputs_limbs(public_inputs.data() + index,
                                                                            PAIRING_POINTS_SIZE);
        index += PAIRING_POINTS_SIZE;
        const std::span<const FF, IPA_CLAIM_SIZE> ipa_claim_limbs(public_inputs.data() + index, IPA_CLAIM_SIZE);

        pairing_inputs = PairingPoints::reconstruct_from_public(pairing_inputs_limbs);
        ipa_claim = IpaClaim::reconstruct_from_public(ipa_claim_limbs);
    }
};

} // namespace bb
