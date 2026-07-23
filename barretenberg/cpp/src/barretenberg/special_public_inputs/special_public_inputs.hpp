// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/public_input_component/public_input_component.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"

namespace bb {

/**
 * @brief Manages the data that is propagated on the public inputs of an application/function circuit
 *
 */
class DefaultIO {
  public:
    using FF = curve::BN254::ScalarField;
    using PublicPairingPoints = PublicInputComponent<PairingPoints<curve::BN254>>;

    static constexpr size_t PUBLIC_INPUTS_SIZE = PairingPoints<curve::BN254>::PUBLIC_INPUTS_SIZE;
    static constexpr bool HasIPA = false;

    PairingPoints<curve::BN254> pairing_inputs;

    /**
     * @brief Reconstructs the IO components from a public inputs array.
     */
    void reconstruct_from_public(const std::vector<FF>& public_inputs)
    {
        BB_ASSERT_GTE(public_inputs.size(),
                      PUBLIC_INPUTS_SIZE,
                      "Public inputs too small for DefaultIO reconstruction. Got " +
                          std::to_string(public_inputs.size()) + " but need at least " +
                          std::to_string(PUBLIC_INPUTS_SIZE));
        // Assumes that the app-io public inputs are at the end of the public_inputs vector
        uint32_t index = static_cast<uint32_t>(public_inputs.size() - PUBLIC_INPUTS_SIZE);
        pairing_inputs = PublicPairingPoints::reconstruct(public_inputs, PublicComponentKey{ index });
    }

    /**
     * @brief Add default IO values to a circuit builder (for native tests)
     */
    template <typename Builder> static void add_default(Builder& builder)
    {
        stdlib::recursion::honk::DefaultIO<Builder>::add_default(builder);
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

    using PublicPairingPoints = PublicInputComponent<PairingPoints<curve::BN254>>;
    using PublicPoint = PublicInputComponent<G1>;

    static constexpr size_t PUBLIC_INPUTS_SIZE = HIDING_KERNEL_PUBLIC_INPUTS_SIZE;
    static constexpr bool HasIPA = false;

    PairingPoints<curve::BN254> pairing_inputs;
    G1 kernel_return_data;
    TableCommitments ecc_op_tables;

    /**
     * @brief Reconstructs the IO components from a public inputs array.
     */
    void reconstruct_from_public(const std::vector<FF>& public_inputs)
    {
        BB_ASSERT_GTE(public_inputs.size(),
                      PUBLIC_INPUTS_SIZE,
                      "Public inputs too small for HidingKernelIO reconstruction. Got " +
                          std::to_string(public_inputs.size()) + " but need at least " +
                          std::to_string(PUBLIC_INPUTS_SIZE));
        // Assumes that the hiding-kernel-io public inputs are at the end of the public_inputs vector
        uint32_t index = static_cast<uint32_t>(public_inputs.size() - PUBLIC_INPUTS_SIZE);

        pairing_inputs = PublicPairingPoints::reconstruct(public_inputs, PublicComponentKey{ index });
        index += PairingPoints<curve::BN254>::PUBLIC_INPUTS_SIZE;
        kernel_return_data = PublicPoint::reconstruct(public_inputs, PublicComponentKey{ index });
        index += G1::PUBLIC_INPUTS_SIZE;
        for (auto& commitment : ecc_op_tables) {
            commitment = PublicPoint::reconstruct(public_inputs, { index });
            index += G1::PUBLIC_INPUTS_SIZE;
        }
    }

    /**
     * @brief Add default IO values to a circuit builder (for native tests)
     */
    template <typename Builder> static void add_default(Builder& builder)
    {
        stdlib::recursion::honk::HidingKernelIO<Builder>::add_default(builder);
    }
};

/**
 * @brief The data that is propagated on the public inputs of a rollup circuit
 */
class RollupIO {
  public:
    using FF = curve::BN254::ScalarField;
    using IpaClaim = OpeningClaim<bb::curve::Grumpkin>;

    using PublicPairingPoints = PublicInputComponent<PairingPoints<curve::BN254>>;
    using PublicIpaClaim = PublicInputComponent<IpaClaim>;

    static constexpr size_t PUBLIC_INPUTS_SIZE = ROLLUP_PUBLIC_INPUTS_SIZE;
    static constexpr bool HasIPA = true;

    PairingPoints<curve::BN254> pairing_inputs;
    IpaClaim ipa_claim;

    /**
     * @brief Reconstructs the IO components from a public inputs array.
     */
    void reconstruct_from_public(const std::vector<FF>& public_inputs)
    {
        BB_ASSERT_GTE(public_inputs.size(),
                      PUBLIC_INPUTS_SIZE,
                      "Public inputs too small for RollupIO reconstruction. Got " +
                          std::to_string(public_inputs.size()) + " but need at least " +
                          std::to_string(PUBLIC_INPUTS_SIZE));
        // Assumes that the rollup-io public inputs are at the end of the public_inputs vector
        uint32_t index = static_cast<uint32_t>(public_inputs.size() - PUBLIC_INPUTS_SIZE);

        pairing_inputs = PublicPairingPoints::reconstruct(public_inputs, PublicComponentKey{ index });
        index += PairingPoints<curve::BN254>::PUBLIC_INPUTS_SIZE;
        ipa_claim = PublicIpaClaim::reconstruct(public_inputs, PublicComponentKey{ index });
    }

    /**
     * @brief Add default IO values to a circuit builder (for native tests)
     */
    template <typename Builder> static void add_default(Builder& builder)
    {
        stdlib::recursion::honk::RollupIO::add_default(builder);
    }
};

} // namespace bb
