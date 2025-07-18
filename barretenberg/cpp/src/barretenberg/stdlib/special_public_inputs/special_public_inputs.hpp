// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/public_input_component/public_input_component.hpp"
namespace bb::stdlib::recursion::honk {

/**
 * @brief Manages the data that is propagated on the public inputs of a kernel circuit
 *
 */
class KernelIO {
  public:
    using Builder = MegaCircuitBuilder;   // kernel builder is always Mega
    using Curve = stdlib::bn254<Builder>; // curve is always bn254
    using G1 = typename Curve::Group;
    using FF = typename Curve::ScalarField;
    using PairingInputs = stdlib::recursion::PairingPoints<Builder>;

    using PublicPoint = stdlib::PublicInputComponent<G1>;
    using PublicPairingPoints = stdlib::PublicInputComponent<PairingInputs>;

    PairingInputs pairing_inputs; // Inputs {P0, P1} to an EC pairing check
    G1 kernel_return_data;        // Commitment to the return data of a kernel circuit
    G1 app_return_data;           // Commitment to the return data of an app circuit
    // G1 ecc_op_table;
    // FF pg_acc_hash;

    // Total size of the kernel IO public inputs
    static constexpr size_t PUBLIC_INPUTS_SIZE =
        PairingInputs::PUBLIC_INPUTS_SIZE + G1::PUBLIC_INPUTS_SIZE + G1::PUBLIC_INPUTS_SIZE;

    /**
     * @brief Reconstructs the IO components from a public inputs array.
     *
     * @param public_inputs Public inputs array containing the serialized kernel public inputs.
     */
    void reconstruct_from_public(const std::vector<FF>& public_inputs)
    {
        // Assumes that the kernel-io public inputs are at the end of the public_inputs vector
        uint32_t index = static_cast<uint32_t>(public_inputs.size() - PUBLIC_INPUTS_SIZE);

        pairing_inputs = PublicPairingPoints::reconstruct(public_inputs, PublicComponentKey{ index });
        index += PairingInputs::PUBLIC_INPUTS_SIZE;
        kernel_return_data = PublicPoint::reconstruct(public_inputs, PublicComponentKey{ index });
        index += G1::PUBLIC_INPUTS_SIZE;
        app_return_data = PublicPoint::reconstruct(public_inputs, PublicComponentKey{ index });
        index += G1::PUBLIC_INPUTS_SIZE;
        // ecc_op_table = PublicPoint::reconstruct(public_inputs, PublicComponentKey{ index });
        // index += G1::PUBLIC_INPUTS_SIZE;
        // pg_acc_hash = FF::reconstruct(public_inputs, PublicComponentKey{ index });
    }

    /**
     * @brief Set each IO component to be a public input of the underlying circuit.
     *
     */
    void set_public()
    {
        pairing_inputs.set_public();
        kernel_return_data.set_public();
        app_return_data.set_public();
        // ecc_op_table.set_public();
        // pg_acc_hash.set_public();

        // Finalize the public inputs to ensure no more public inputs can be added hereafter.
        Builder* builder = pairing_inputs.P0.get_context();
        builder->finalize_public_inputs();
    }
};

/**
 * @brief Manages the data that is propagated on the public inputs of an application/function circuit
 *
 */
template <typename Builder> class DefaultIO {
  public:
    using Curve = stdlib::bn254<Builder>; // curve is always bn254
    using FF = typename Curve::ScalarField;
    using PairingInputs = stdlib::recursion::PairingPoints<Builder>;

    using PublicPairingPoints = stdlib::PublicInputComponent<PairingInputs>;

    PairingInputs pairing_inputs;

    // Total size of the IO public inputs
    static constexpr size_t PUBLIC_INPUTS_SIZE = PairingInputs::PUBLIC_INPUTS_SIZE;

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

    /**
     * @brief Set each IO component to be a public input of the underlying circuit.
     *
     */
    void set_public()
    {
        pairing_inputs.set_public();

        // Finalize the public inputs to ensure no more public inputs can be added hereafter.
        Builder* builder = pairing_inputs.P0.get_context();
        builder->finalize_public_inputs();
    }

    class Native {
      public:
        using PairingPoints = bb::PairingPoints;
        using FF = Curve::ScalarFieldNative;

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
};

/**
 * @brief The data that is propagated on the public inputs of an application/function circuit
 */
using AppIO = DefaultIO<MegaCircuitBuilder>; // app IO is always Mega

/**
 * @brief Manages the data that is propagated on the public inputs of of a hiding kernel circuit
 *
 * @note It is important that the inputs are (ecc_op_table, pairing_inputs). This is because the output of ClientIVC
 * will be verified with an UltraVerifier, which expects the last public input to always be the pairing inputs.
 *
 */
template <class Builder> class HidingKernelIO {
  public:
    using Flavor = MegaFlavor;
    using Curve = stdlib::bn254<Builder>; // curve is always bn254
    using G1 = Curve::Group;
    using FF = Curve::ScalarField;
    using PairingInputs = stdlib::recursion::PairingPoints<Builder>;

    using PublicPoint = stdlib::PublicInputComponent<G1>;
    using PublicPairingPoints = stdlib::PublicInputComponent<PairingInputs>;

    std::array<G1, Flavor::NUM_WIRES>
        ecc_op_tables;            // commitments to merged tables obtain from final Merge verification
    PairingInputs pairing_inputs; // Inputs {P0, P1} to an EC pairing check

    // Total size of the IO public inputs
    static constexpr size_t PUBLIC_INPUTS_SIZE =
        PairingInputs::PUBLIC_INPUTS_SIZE + Flavor::NUM_WIRES * G1::PUBLIC_INPUTS_SIZE;

    /**
     * @brief Reconstructs the IO components from a public inputs array.
     *
     * @param public_inputs Public inputs array containing the serialized kernel public inputs.
     */
    void reconstruct_from_public(const std::vector<FF>& public_inputs)
    {
        // Assumes that the app-io public inputs are at the end of the public_inputs vector
        uint32_t index = static_cast<uint32_t>(public_inputs.size() - PUBLIC_INPUTS_SIZE);
        for (auto& commitment : ecc_op_tables) {
            commitment = PublicPoint::reconstruct(public_inputs, PublicComponentKey{ index });
            index += G1::PUBLIC_INPUTS_SIZE;
        }
        pairing_inputs = PublicPairingPoints::reconstruct(public_inputs, PublicComponentKey{ index });
    }

    /**
     * @brief Set each IO component to be a public input of the underlying circuit.
     *
     */
    void set_public()
    {
        for (auto& commitment : ecc_op_tables) {
            commitment.set_public();
        }
        pairing_inputs.set_public();

        // Finalize the public inputs to ensure no more public inputs can be added hereafter.
        Builder* builder = pairing_inputs.P0.get_context();
        builder->finalize_public_inputs();
    }

    class Native {
      public:
        using FF = Curve::ScalarFieldNative;
        using PairingPoints = bb::PairingPoints;
        using G1 = Curve::AffineElementNative;

        static constexpr size_t G1_PUBLIC_INPUTS_SIZE = Curve::Group::PUBLIC_INPUTS_SIZE;

        std::array<G1, Flavor::NUM_WIRES> ecc_op_tables;
        PairingPoints pairing_inputs;

        /**
         * @brief Reconstructs the IO components from a public inputs array.
         *
         * @param public_inputs Public inputs array containing the serialized kernel public inputs.
         */
        void reconstruct_from_public(const std::vector<FF>& public_inputs)
        {
            // Assumes that the hiding-kernel-io public inputs are at the end of the public_inputs vector
            uint32_t index = static_cast<uint32_t>(public_inputs.size() - PUBLIC_INPUTS_SIZE);

            for (auto& commitment : ecc_op_tables) {
                const std::span<const FF, G1_PUBLIC_INPUTS_SIZE> ecc_op_table_limbs(public_inputs.data() + index,
                                                                                    G1_PUBLIC_INPUTS_SIZE);
                commitment = G1::reconstruct_from_public(ecc_op_table_limbs);
                index += G1_PUBLIC_INPUTS_SIZE;
            }

            const std::span<const FF, PAIRING_POINTS_SIZE> pairing_inputs_limbs(public_inputs.data() + index,
                                                                                PAIRING_POINTS_SIZE);

            pairing_inputs = PairingPoints::reconstruct_from_public(pairing_inputs_limbs);
        }
    };
};

/**
 * @brief The data that is propagated on the public inputs of a rollup circuit
 */
class RollupIO {
  public:
    using Builder = UltraCircuitBuilder;  // rollup circuits are always Ultra
    using Curve = stdlib::bn254<Builder>; // curve is always bn254
    using FF = stdlib::bn254<Builder>::ScalarField;
    using PairingInputs = stdlib::recursion::PairingPoints<Builder>;
    using IpaClaim = OpeningClaim<stdlib::grumpkin<Builder>>;

    using PublicPairingPoints = stdlib::PublicInputComponent<PairingInputs>;
    using PublicIpaClaim = stdlib::PublicInputComponent<IpaClaim>;

    PairingInputs pairing_inputs;
    IpaClaim ipa_claim;

    // Total size of the IO public inputs
    static constexpr size_t PUBLIC_INPUTS_SIZE = PairingInputs::PUBLIC_INPUTS_SIZE + IpaClaim::PUBLIC_INPUTS_SIZE;

    /**
     * @brief Reconstructs the IO components from a public inputs array.
     *
     * @param public_inputs Public inputs array containing the serialized kernel public inputs.
     */
    void reconstruct_from_public(const std::vector<FF>& public_inputs)
    {
        uint32_t index = static_cast<uint32_t>(public_inputs.size() - PUBLIC_INPUTS_SIZE);
        pairing_inputs = PublicPairingPoints::reconstruct(public_inputs, PublicComponentKey{ index });
        index += PairingInputs::PUBLIC_INPUTS_SIZE;
        ipa_claim = PublicIpaClaim::reconstruct(public_inputs, PublicComponentKey{ index });
    }

    /**
     * @brief Set each IO component to be a public input of the underlying circuit.
     *
     */
    void set_public()
    {
        pairing_inputs.set_public();
        ipa_claim.set_public();

        // Finalize the public inputs to ensure no more public inputs can be added hereafter.
        Builder* builder = pairing_inputs.P0.get_context();
        builder->finalize_public_inputs();
    }

    class Native {
      public:
        using FF = Curve::ScalarFieldNative;
        using PairingPoints = bb::PairingPoints;
        using IpaClaim = OpeningClaim<bb::curve::Grumpkin>;

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
            index += PairingInputs::PUBLIC_INPUTS_SIZE;
            const std::span<const FF, IPA_CLAIM_SIZE> ipa_claim_limbs(public_inputs.data() + index, IPA_CLAIM_SIZE);

            pairing_inputs = PairingPoints::reconstruct_from_public(pairing_inputs_limbs);
            ipa_claim = IpaClaim::reconstruct_from_public(ipa_claim_limbs);
        }
    };
};

} // namespace bb::stdlib::recursion::honk
