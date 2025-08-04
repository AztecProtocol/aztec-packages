// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/public_input_component/public_input_component.hpp"

namespace bb {

/**
 * @brief Manages the data that is propagated on the public inputs of an application/function circuit
 *
 */
class DefaultIO {
  public:
    using FF = curve::BN254::ScalarField;
    using PublicPairingPoints = PublicInputComponent<PairingPoints>;

    static constexpr size_t PUBLIC_INPUTS_SIZE = DEFAULT_PUBLIC_INPUTS_SIZE;

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

        pairing_inputs = PublicPairingPoints::reconstruct(public_inputs, PublicComponentKey{ index });
    }
};

/**
 * @brief Manages the data that is propagated on the public inputs of of a hiding kernel circuit
 */
class HidingKernelIO {
  public:
    using FF = curve::BN254::ScalarField;
    using G1 = curve::BN254::AffineElement;
    using TableCommitments = std::array<G1, MegaCircuitBuilder::NUM_WIRES>;

    using PublicPairingPoints = PublicInputComponent<PairingPoints>;
    using PublicPoint = PublicInputComponent<G1>;

    static constexpr size_t PUBLIC_INPUTS_SIZE = HIDING_KERNEL_PUBLIC_INPUTS_SIZE;

    PairingPoints pairing_inputs;
    TableCommitments ecc_op_tables;

    /**
     * @brief Reconstructs the IO components from a public inputs array.
     *
     * @param public_inputs Public inputs array containing the serialized kernel public inputs.
     */
    void reconstruct_from_public(const std::vector<FF>& public_inputs)
    {
        // Assumes that the hiding-kernel-io public inputs are at the end of the public_inputs vector
        uint32_t index = static_cast<uint32_t>(public_inputs.size() - PUBLIC_INPUTS_SIZE);

        pairing_inputs = PublicPairingPoints::reconstruct(public_inputs, PublicComponentKey{ index });
        index += PairingPoints::PUBLIC_INPUTS_SIZE;
        for (auto& commitment : ecc_op_tables) {
            commitment = PublicPoint::reconstruct(public_inputs, { index });
            index += G1::PUBLIC_INPUTS_SIZE;
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

    using PublicPairingPoints = PublicInputComponent<PairingPoints>;
    using PublicIpaClaim = PublicInputComponent<IpaClaim>;

    static constexpr size_t PUBLIC_INPUTS_SIZE = ROLLUP_PUBLIC_INPUTS_SIZE;

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

        pairing_inputs = PublicPairingPoints::reconstruct(public_inputs, PublicComponentKey{ index });
        index += PairingPoints::PUBLIC_INPUTS_SIZE;
        ipa_claim = PublicIpaClaim::reconstruct(public_inputs, PublicComponentKey{ index });
    }
};

} // namespace bb
