// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/public_input_component/public_input_component.hpp"
namespace bb::stdlib::recursion::honk {

// WORKTODO: Give this file/directory a better name!

class KernelIO {
  public:
    using Builder = MegaCircuitBuilder;   // kernel builder is always Mega
    using Curve = stdlib::bn254<Builder>; // curve is always bn254
    using G1 = typename Curve::Group;
    using FF = typename Curve::ScalarField;
    using PairingInputs = stdlib::recursion::PairingPoints<Builder>;

    using PublicPoint = stdlib::PublicInputComponent<G1>;
    using PublicPairingPoints = stdlib::PublicInputComponent<PairingInputs>;
    using PublicKey = PublicComponentKey;

    PairingInputs pairing_inputs;
    G1 kernel_return_data;
    G1 app_return_data;
    G1 ecc_op_table;
    FF pg_acc_hash;

    /**
     * @brief Reconstructs the IO components from a public inputs array.
     *
     * @param public_inputs Public inputs array containing the serialized kernel public inputs.
     * @param start_idx Index at which the kernel public inputs are to be extracted.
     */
    void reconstruct_from_public(const std::vector<FF>& public_inputs, uint32_t start_idx = 0)
    {
        uint32_t index = start_idx;
        pairing_inputs = PublicPairingPoints::reconstruct(public_inputs, PublicKey{ index });
        index += PairingInputs::PUBLIC_INPUTS_SIZE;
        kernel_return_data = PublicPoint::reconstruct(public_inputs, PublicKey{ index });
        index += G1::PUBLIC_INPUTS_SIZE;
        app_return_data = PublicPoint::reconstruct(public_inputs, PublicKey{ index });
        index += G1::PUBLIC_INPUTS_SIZE;
        ecc_op_table = PublicPoint::reconstruct(public_inputs, PublicKey{ index });
        index += G1::PUBLIC_INPUTS_SIZE;
        pg_acc_hash = public_inputs[index];
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
        ecc_op_table.set_public();
        pg_acc_hash.set_public();
    }
};

} // namespace bb::stdlib::recursion::honk
