#pragma once

#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief Extended KernelIO with Poseidon2 op table commitments.
 *
 * @details Adds 5 poseidon2_op_table commitments (the merged Poseidon2 op wire columns)
 * alongside the existing 4 ECC op table commitments. Used by ChonkV2 kernels.
 *
 * Layout in public inputs (appended after standard KernelIO fields):
 *   pairing_inputs        (16 fr)
 *   kernel_return_data    (4 fr)
 *   app_return_data       (4 fr)
 *   ecc_op_tables[4]      (16 fr)
 *   poseidon2_op_tables[5](20 fr)  ← NEW
 *   output_hn_accum_hash  (1 fr)
 *   Total: 61 fr elements
 */
class KernelV2IO {
  public:
    using Builder = MegaCircuitBuilder;
    using Curve = stdlib::bn254<Builder>;
    using G1 = Curve::Group;
    using FF = Curve::ScalarField;
    using PairingInputs = stdlib::recursion::PairingPoints<Curve>;
    using EccTableCommitments = std::array<G1, Builder::NUM_WIRES>;       // 4 ECC op wires
    using Poseidon2TableCommitments = std::array<G1, POSEIDON2_OP_WIRE_COUNT>; // 5 Poseidon2 op wires

    using PublicPoint = stdlib::PublicInputComponent<G1>;
    using PublicPairingPoints = stdlib::PublicInputComponent<PairingInputs>;
    using PublicFF = stdlib::PublicInputComponent<FF>;

    PairingInputs pairing_inputs;
    G1 kernel_return_data;
    G1 app_return_data;
    EccTableCommitments ecc_op_tables;
    Poseidon2TableCommitments poseidon2_op_tables; // NEW: merged Poseidon2 op wire commitments
    FF output_hn_accum_hash;

    static constexpr size_t PUBLIC_INPUTS_SIZE = KERNEL_V2_PUBLIC_INPUTS_SIZE;
    static constexpr bool HasIPA = false;

    void reconstruct_from_public(const std::vector<FF>& public_inputs)
    {
        size_t index = public_inputs.size() - PUBLIC_INPUTS_SIZE;

        pairing_inputs = PublicPairingPoints::reconstruct(public_inputs, PublicComponentKey{ index });
        index += PairingInputs::PUBLIC_INPUTS_SIZE;
        kernel_return_data = PublicPoint::reconstruct(public_inputs, PublicComponentKey{ index });
        index += G1::PUBLIC_INPUTS_SIZE;
        app_return_data = PublicPoint::reconstruct(public_inputs, PublicComponentKey{ index });
        index += G1::PUBLIC_INPUTS_SIZE;
        for (auto& table_commitment : ecc_op_tables) {
            table_commitment = PublicPoint::reconstruct(public_inputs, PublicComponentKey{ index });
            index += G1::PUBLIC_INPUTS_SIZE;
        }
        for (auto& table_commitment : poseidon2_op_tables) {
            table_commitment = PublicPoint::reconstruct(public_inputs, PublicComponentKey{ index });
            index += G1::PUBLIC_INPUTS_SIZE;
        }
        output_hn_accum_hash = PublicFF::reconstruct(public_inputs, PublicComponentKey{ index });
        index += FF::PUBLIC_INPUTS_SIZE;
    }

    void set_public()
    {
        Builder* builder = output_hn_accum_hash.get_context();

        pairing_inputs.set_public(builder);
        kernel_return_data.set_public();
        app_return_data.set_public();
        for (auto& table_commitment : ecc_op_tables) {
            table_commitment.set_public();
        }
        for (auto& table_commitment : poseidon2_op_tables) {
            table_commitment.set_public();
        }
        output_hn_accum_hash.set_public();

        builder->finalize_public_inputs();
    }

    static void add_default(Builder& builder)
    {
        KernelV2IO inputs;

        inputs.pairing_inputs = PairingInputs::construct_default();
        inputs.kernel_return_data = DataBusDepot<Builder>::construct_default_commitment(builder);
        inputs.app_return_data = DataBusDepot<Builder>::construct_default_commitment(builder);
        for (auto& table_commitment : inputs.ecc_op_tables) {
            table_commitment = G1(typename G1::BaseField(nullptr, uint256_t(DEFAULT_ECC_COMMITMENT.x)),
                                  typename G1::BaseField(nullptr, uint256_t(DEFAULT_ECC_COMMITMENT.y)),
                                  /*assert_on_curve=*/false);
            table_commitment.convert_constant_to_fixed_witness(&builder);
        }
        for (auto& table_commitment : inputs.poseidon2_op_tables) {
            table_commitment = G1(typename G1::BaseField(nullptr, uint256_t(DEFAULT_ECC_COMMITMENT.x)),
                                  typename G1::BaseField(nullptr, uint256_t(DEFAULT_ECC_COMMITMENT.y)),
                                  /*assert_on_curve=*/false);
            table_commitment.convert_constant_to_fixed_witness(&builder);
        }
        inputs.output_hn_accum_hash = FF::from_witness(&builder, typename FF::native(0));
        inputs.set_public();
    }
};

/**
 * @brief Extended HidingKernelIO with Poseidon2 op table commitments.
 *
 * @details Adds 5 poseidon2_op_table commitments for the hiding kernel in ChonkV2.
 *
 * Layout:
 *   pairing_inputs        (16 fr)
 *   kernel_return_data    (4 fr)
 *   ecc_op_tables[4]      (16 fr)
 *   poseidon2_op_tables[5](20 fr)  ← NEW
 *   Total: 56 fr elements
 */
template <class Builder_> class HidingKernelV2IO {
  public:
    using Builder = Builder_;
    using Curve = stdlib::bn254<Builder>;
    using G1 = Curve::Group;
    using FF = Curve::ScalarField;
    using PairingInputs = stdlib::recursion::PairingPoints<Curve>;
    using EccTableCommitments = std::array<G1, Builder::NUM_WIRES>;
    using Poseidon2TableCommitments = std::array<G1, POSEIDON2_OP_WIRE_COUNT>;

    using PublicPoint = stdlib::PublicInputComponent<G1>;
    using PublicPairingPoints = stdlib::PublicInputComponent<PairingInputs>;

    PairingInputs pairing_inputs;
    G1 kernel_return_data;
    EccTableCommitments ecc_op_tables;
    Poseidon2TableCommitments poseidon2_op_tables; // NEW

    static constexpr size_t PUBLIC_INPUTS_SIZE = HIDING_KERNEL_V2_PUBLIC_INPUTS_SIZE;
    static constexpr bool HasIPA = false;

    void reconstruct_from_public(const std::vector<FF>& public_inputs)
    {
        size_t index = public_inputs.size() - PUBLIC_INPUTS_SIZE;
        pairing_inputs = PublicPairingPoints::reconstruct(public_inputs, PublicComponentKey{ index });
        index += PairingInputs::PUBLIC_INPUTS_SIZE;
        kernel_return_data = PublicPoint::reconstruct(public_inputs, PublicComponentKey{ index });
        index += G1::PUBLIC_INPUTS_SIZE;
        for (auto& commitment : ecc_op_tables) {
            commitment = PublicPoint::reconstruct(public_inputs, PublicComponentKey{ index });
            index += G1::PUBLIC_INPUTS_SIZE;
        }
        for (auto& commitment : poseidon2_op_tables) {
            commitment = PublicPoint::reconstruct(public_inputs, PublicComponentKey{ index });
            index += G1::PUBLIC_INPUTS_SIZE;
        }
    }

    void set_public()
    {
        Builder* builder = ecc_op_tables[0].get_context();

        pairing_inputs.set_public(builder);
        kernel_return_data.set_public();
        for (auto& commitment : ecc_op_tables) {
            commitment.set_public();
        }
        for (auto& commitment : poseidon2_op_tables) {
            commitment.set_public();
        }

        builder->finalize_public_inputs();
    }

    static void add_default(Builder& builder)
    {
        HidingKernelV2IO inputs;
        inputs.pairing_inputs = PairingInputs::construct_default();
        inputs.kernel_return_data = G1(typename G1::BaseField(nullptr, uint256_t(DEFAULT_ECC_COMMITMENT.x)),
                                       typename G1::BaseField(nullptr, uint256_t(DEFAULT_ECC_COMMITMENT.y)),
                                       /*assert_on_curve=*/false);
        inputs.kernel_return_data.convert_constant_to_fixed_witness(&builder);
        for (auto& table_commitment : inputs.ecc_op_tables) {
            table_commitment = G1(typename G1::BaseField(nullptr, uint256_t(DEFAULT_ECC_COMMITMENT.x)),
                                  typename G1::BaseField(nullptr, uint256_t(DEFAULT_ECC_COMMITMENT.y)),
                                  /*assert_on_curve=*/false);
            table_commitment.convert_constant_to_fixed_witness(&builder);
        }
        for (auto& table_commitment : inputs.poseidon2_op_tables) {
            table_commitment = G1(typename G1::BaseField(nullptr, uint256_t(DEFAULT_ECC_COMMITMENT.x)),
                                  typename G1::BaseField(nullptr, uint256_t(DEFAULT_ECC_COMMITMENT.y)),
                                  /*assert_on_curve=*/false);
            table_commitment.convert_constant_to_fixed_witness(&builder);
        }
        inputs.set_public();
    };
};

} // namespace bb::stdlib::recursion::honk
