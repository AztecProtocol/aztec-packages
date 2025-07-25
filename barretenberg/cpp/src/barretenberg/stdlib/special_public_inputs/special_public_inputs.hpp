// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/pairing_points.hpp"
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
    using G1 = Curve::Group;
    using FF = Curve::ScalarField;
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
    using FF = Curve::ScalarField;
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

    /**
     * @brief Add default public inputs when they are not present
     *
     */
    static void add_default(Builder& builder) { PairingInputs::add_default_to_public_inputs(builder); };
};

/**
 * @brief The data that is propagated on the public inputs of an application/function circuit
 */
using AppIO = DefaultIO<MegaCircuitBuilder>; // app IO is always Mega

/**
 * @brief Manages the data that is propagated on the public inputs of a hiding kernel circuit
 */
template <class Builder_> class HidingKernelIO {
  public:
    using Builder = Builder_;
    using Curve = stdlib::bn254<Builder>; // curve is always bn254
    using G1 = Curve::Group;
    using FF = Curve::ScalarField;
    using PairingInputs = stdlib::recursion::PairingPoints<Builder>;

    using PublicPoint = stdlib::PublicInputComponent<G1>;
    using PublicPairingPoints = stdlib::PublicInputComponent<PairingInputs>;

    PairingInputs pairing_inputs; // Inputs {P0, P1} to an EC pairing check
    std::array<G1, Builder::NUM_WIRES>
        ecc_op_tables; // commitments to merged tables obtained from final Merge verification

    // Total size of the IO public inputs
    static constexpr size_t PUBLIC_INPUTS_SIZE =
        PairingInputs::PUBLIC_INPUTS_SIZE + Builder::NUM_WIRES * G1::PUBLIC_INPUTS_SIZE;

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
        index += PairingInputs::PUBLIC_INPUTS_SIZE;
        for (auto& commitment : ecc_op_tables) {
            commitment = PublicPoint::reconstruct(public_inputs, PublicComponentKey{ index });
            index += G1::PUBLIC_INPUTS_SIZE;
        }
    }

    /**
     * @brief Set each IO component to be a public input of the underlying circuit.
     *
     */
    void set_public()
    {
        pairing_inputs.set_public();
        for (auto& commitment : ecc_op_tables) {
            commitment.set_public();
        }

        // Finalize the public inputs to ensure no more public inputs can be added hereafter.
        Builder* builder = pairing_inputs.P0.get_context();
        builder->finalize_public_inputs();
    }

    static std::array<G1, Builder::NUM_WIRES> default_ecc_op_tables(Builder& builder, bool set_infinity = true)
    {
        std::array<G1, Builder::NUM_WIRES> defaults;
        for (auto& table : defaults) {
            // We need to branch because this function is used in two places: when we set default public inputs in
            // circuits that already have pairing inputs but no ecc op tables, and when we set default ecc op tables for
            // a MegaVerifier that verifies only one Merge. In the first case, we need to set the point to something
            // different from the the point at infinity because we currently don't handle the reconstruction of the
            // point at infinity from the public inputs. In the second case, we need to set the ecc op tables to the
            // point at infinity because the merge verification will merge the new operations into the empty table. Note
            // that the case of adding defaults to circuits that already have pairing inputs works only because a
            // circuit that needs to propagate ecc op tables either comes at the end of various layers of Goblin (in
            // CIVC), in which case there are ecc op tables to propagate, or at the beginning of Goblin, in which case
            // it doesn't matter what gets propagated, as the verifier will disregard that value and use the point at
            // infinity.
            // TODO(): Can we handle the point at infinity in the public inputs?
            if (set_infinity) {
                table = G1::point_at_infinity(&builder);
            } else {
                table = G1::one(&builder);
            }
        }

        return defaults;
    }

    /**
     * @brief Add default public inputs when they are not present
     *
     */
    static void add_default(Builder& builder)
    {
        PairingInputs::add_default_to_public_inputs(builder);
        for (size_t idx = 0; idx < Builder::NUM_WIRES; idx++) {
            G1 point = G1::one(&builder);
            point.set_public();
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

    /**
     * @brief Add default public inputs when they are not present
     *
     */
    static void add_default(Builder& builder)
    {
        PairingInputs::add_default_to_public_inputs(builder);
        auto [stdlib_opening_claim, ipa_proof] = IPA<grumpkin<Builder>>::create_fake_ipa_claim_and_proof(builder);
        stdlib_opening_claim.set_public();
        builder.ipa_proof = ipa_proof;
    };
};

} // namespace bb::stdlib::recursion::honk
