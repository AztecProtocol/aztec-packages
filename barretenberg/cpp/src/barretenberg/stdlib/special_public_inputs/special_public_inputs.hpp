// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: d1307bdee7f2ee0e737c19b77a26204a8dbafafc }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
//
// Special public inputs designed propagate data between Chonk and Rollup circuits.
//
// These structures are binding several Chonk components:
//   - KernelIO:        Standard kernel outputs (pairing points, databus, ecc_op_hash, accum hash)
//   - HidingKernelIO:  Final kernel outputs (no accum hash since folding terminates)
//   - AppIO/DefaultIO: App circuit outputs (just pairing points)
//   - RollupIO:        Rollup circuit outputs (pairing points + IPA claim)
//
#pragma once

#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/databus/databus.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/primitives/public_input_component/public_input_component.hpp"
namespace bb::stdlib::recursion::honk {

// Default coordinates of commitment to an ecc op table
// These are the coordinates that come from committing to the ecc ops that are added to the op_queue by finalize_circuit
static constexpr bb::fq DEFAULT_ECC_COMMITMENT_X("0x08434fa4480433735e7aeaccecb911eb7a06165ad70e5ced6ac6848296e59279");
static constexpr bb::fq DEFAULT_ECC_COMMITMENT_Y("0x0a13a1839ab95ef15be8d0710b2c8aa47cea0b0e62a8596e68cc0fd54a6ae73d");
static constexpr bb::curve::BN254::AffineElement DEFAULT_ECC_COMMITMENT(DEFAULT_ECC_COMMITMENT_X,
                                                                        DEFAULT_ECC_COMMITMENT_Y);

/**
 * @brief Construct commitments to empty subtables
 *
 * @details In the first iteration of the Merge, the verifier sets the commitments to the previous full state of the
 * op_queue equal to the commitments to the empty tables. This ensures that prover cannot lie, as the starting point
 * of the merge is fixed.
 *
 * @param builder
 * @return std::array<typename bn254<Builder>::Group, Builder::NUM_WIRES>
 */
template <typename Builder>
std::array<typename bn254<Builder>::Group, Builder::NUM_WIRES> empty_ecc_op_tables(Builder& builder)
{
    std::array<typename bn254<Builder>::Group, Builder::NUM_WIRES> empty_tables;
    for (auto& table_commitment : empty_tables) {
        table_commitment = bn254<Builder>::Group::constant_infinity(&builder);
        // Sanity check: Verify the native value is actually at infinity
        BB_ASSERT(table_commitment.get_value().is_point_at_infinity(),
                  "empty_ecc_op_tables: T_prev must be initialized to point at infinity");
    }

    return empty_tables;
}

/**
 * @brief Manages the data that is propagated on the public inputs of a kernel circuit.
 *
 * @tparam N Number of app return-data commitments carried by the kernel public inputs.
 */
template <size_t N> class KernelIO_ {
  public:
    using Builder = MegaCircuitBuilder;   // kernel builder is always Mega
    using Curve = stdlib::bn254<Builder>; // curve is always bn254
    using G1 = Curve::Group;
    using FF = Curve::ScalarField;
    using PairingInputs = stdlib::recursion::PairingPoints<Curve>;
    using TableCommitments = std::array<G1, Builder::NUM_WIRES>;
    using AppReturnDataCommitments = std::array<G1, N>;

    using PublicPoint = stdlib::PublicInputComponent<G1>;
    using PublicPairingPoints = stdlib::PublicInputComponent<PairingInputs>;
    using PublicFF = stdlib::PublicInputComponent<FF>;

    PairingInputs pairing_inputs;             // Inputs {P0, P1} to an EC pairing check
    G1 kernel_return_data;                    // Commitment to the return data of a kernel circuit
    AppReturnDataCommitments app_return_data; // Commitment to each verified app circuit's return data
    FF ecc_op_hash;                           // Running Poseidon2 hash over ECC op column commitments
    FF output_hn_accum_hash;                  // hash of the output HN verifier accumulator

    // Total size of the kernel IO public inputs
    static constexpr size_t PUBLIC_INPUTS_SIZE = kernel_public_inputs_size(N);
    static constexpr bool HasIPA = false;

    /**
     * @brief Reconstructs the IO components from a public inputs array.
     *
     * @param public_inputs Public inputs array containing the serialized kernel public inputs.
     */
    void reconstruct_from_public(const std::vector<FF>& public_inputs)
    {
        BB_ASSERT_GTE(
            public_inputs.size(), PUBLIC_INPUTS_SIZE, "Public inputs too small for HidingKernelIO reconstruction");
        // Assumes that the kernel-io public inputs are at the end of the public_inputs vector
        size_t index = public_inputs.size() - PUBLIC_INPUTS_SIZE;

        pairing_inputs = PublicPairingPoints::reconstruct(public_inputs, PublicComponentKey{ index });
        index += PairingInputs::PUBLIC_INPUTS_SIZE;
        kernel_return_data = PublicPoint::reconstruct(public_inputs, PublicComponentKey{ index });
        index += G1::PUBLIC_INPUTS_SIZE;
        for (auto& app_commitment : app_return_data) {
            app_commitment = PublicPoint::reconstruct(public_inputs, PublicComponentKey{ index });
            index += G1::PUBLIC_INPUTS_SIZE;
        }
        ecc_op_hash = PublicFF::reconstruct(public_inputs, PublicComponentKey{ index });
        index += FF::PUBLIC_INPUTS_SIZE;
        output_hn_accum_hash = PublicFF::reconstruct(public_inputs, PublicComponentKey{ index });
        index += FF::PUBLIC_INPUTS_SIZE;
    }

    /**
     * @brief Set each IO component to be a public input of the underlying circuit.
     *
     */
    void set_public()
    {
        Builder* builder = output_hn_accum_hash.get_context();

        pairing_inputs.set_public(builder);
        kernel_return_data.set_public();
        for (auto& app_commitment : app_return_data) {
            app_commitment.set_public();
        }
        ecc_op_hash.set_public();
        output_hn_accum_hash.set_public();

        // Finalize the public inputs to ensure no more public inputs can be added hereafter.
        builder->finalize_public_inputs();
    }

    /**
     * @brief Add default public inputs when they are not present
     *
     */
    static void add_default(Builder& builder)
    {
        KernelIO_ inputs;

        inputs.pairing_inputs = PairingInputs::construct_default();
        inputs.kernel_return_data = DataBusDepot<Builder>::construct_default_commitment(builder);
        for (auto& app_commitment : inputs.app_return_data) {
            app_commitment = DataBusDepot<Builder>::construct_default_commitment(builder);
        }
        inputs.ecc_op_hash = FF::from_witness(&builder, typename FF::native(0));
        inputs.output_hn_accum_hash = FF::from_witness(&builder, typename FF::native(0));
        inputs.set_public();
    }
};

using KernelIO = KernelIO_<MAX_APPS_PER_KERNEL>;

/**
 * @brief Manages the data that is propagated on the public inputs of an application/function circuit
 *
 */
template <typename Builder_> class DefaultIO {
  public:
    using Builder = Builder_;
    using Curve = stdlib::bn254<Builder>; // curve is always bn254
    using FF = Curve::ScalarField;
    using PairingInputs = stdlib::recursion::PairingPoints<Curve>;

    using PublicPairingPoints = stdlib::PublicInputComponent<PairingInputs>;

    PairingInputs pairing_inputs;

    // Total size of the IO public inputs
    static constexpr size_t PUBLIC_INPUTS_SIZE = DEFAULT_PUBLIC_INPUTS_SIZE;
    static constexpr bool HasIPA = false;

    /**
     * @brief Reconstructs the IO components from a public inputs array.
     *
     * @param public_inputs Public inputs array containing the serialized kernel public inputs.
     */
    void reconstruct_from_public(const std::vector<FF>& public_inputs)
    {
        BB_ASSERT_GTE(
            public_inputs.size(), PUBLIC_INPUTS_SIZE, "Public inputs too small for AppCircuitIO reconstruction");
        // Assumes that the app-io public inputs are at the end of the public_inputs vector
        size_t index = public_inputs.size() - PUBLIC_INPUTS_SIZE;
        pairing_inputs = PublicPairingPoints::reconstruct(public_inputs, PublicComponentKey{ index });
    }

    /**
     * @brief Set each IO component to be a public input of the underlying circuit.
     *
     */
    void set_public()
    {
        Builder* builder = validate_context<Builder>(pairing_inputs);
        BB_ASSERT_NEQ(builder, nullptr, "Trying to set constant PairingPoints to public.");

        pairing_inputs.set_public();

        // Finalize the public inputs to ensure no more public inputs can be added hereafter.
        builder->finalize_public_inputs();
    }

    /**
     * @brief Add default public inputs when they are not present
     *
     */
    static void add_default(Builder& builder)
    {
        PairingInputs::set_default_to_public(&builder);
        builder.finalize_public_inputs();
    };
};

/**
 * @brief The data that is propagated on the public inputs of an application/function circuit
 */
using AppIO = DefaultIO<MegaCircuitBuilder>; // app IO is always Mega

/**
 * @brief The data that is propagated on the public inputs of the inner GoblinAvmRecursiveVerifier circuit
 */
template <typename Builder_> class GoblinAvmIO {
  public:
    using Builder = Builder_;
    using Curve = stdlib::bn254<Builder>; // curve is always bn254
    using FF = Curve::ScalarField;
    using PairingInputs = stdlib::recursion::PairingPoints<Curve>;

    using PublicFF = stdlib::PublicInputComponent<FF>;
    using PublicPairingPoints = stdlib::PublicInputComponent<PairingInputs>;

    FF transcript_hash; // The final state of the transcript of the AVM recursive verifier
    PairingInputs pairing_inputs;

    // Total size of the IO public inputs
    static constexpr size_t PUBLIC_INPUTS_SIZE = GOBLIN_AVM_PUBLIC_INPUTS_SIZE;
    static constexpr bool HasIPA = false;

    /**
     * @brief Reconstructs the IO components from a public inputs array.
     *
     * @param public_inputs Public inputs array containing the serialized kernel public inputs.
     */
    void reconstruct_from_public(const std::vector<FF>& public_inputs)
    {
        BB_ASSERT_GTE(
            public_inputs.size(), PUBLIC_INPUTS_SIZE, "Public inputs too small for GoblinAvmIO reconstruction");
        // Assumes that the GoblinAvm-io public inputs are at the end of the public_inputs vector
        size_t index = public_inputs.size() - PUBLIC_INPUTS_SIZE;
        transcript_hash = PublicFF::reconstruct(public_inputs, PublicComponentKey{ index });
        index += FF::PUBLIC_INPUTS_SIZE;
        pairing_inputs = PublicPairingPoints::reconstruct(public_inputs, PublicComponentKey{ index });
    }

    /**
     * @brief Set each IO component to be a public input of the underlying circuit.
     *
     */
    void set_public()
    {
        Builder* builder = validate_context<Builder>(pairing_inputs);

        transcript_hash.set_public();
        pairing_inputs.set_public();

        // Finalize the public inputs to ensure no more public inputs can be added hereafter.
        builder->finalize_public_inputs();
    }
};

/**
 * @brief Manages the data that is propagated on the public inputs of a hiding kernel circuit
 */
template <class Builder_> class HidingKernelIO {
  public:
    using Builder = Builder_;
    using Curve = stdlib::bn254<Builder>; // curve is always bn254
    using G1 = Curve::Group;
    using FF = Curve::ScalarField;
    using PairingInputs = stdlib::recursion::PairingPoints<Curve>;
    using TableCommitments = std::array<G1, NUM_WIRES>;

    using PublicPoint = stdlib::PublicInputComponent<G1>;
    using PublicPairingPoints = stdlib::PublicInputComponent<PairingInputs>;

    PairingInputs pairing_inputs;   // Inputs {P0, P1} to an EC pairing check
    G1 kernel_return_data;          // Commitment to the return data of the tail kernel circuit
    TableCommitments ecc_op_tables; // commitments to the full merged op queue tables, obtained from the
                                    // batched merge verification performed inside the hiding kernel

    // Total size of the IO public inputs
    static constexpr size_t PUBLIC_INPUTS_SIZE = HIDING_KERNEL_PUBLIC_INPUTS_SIZE;
    static constexpr bool HasIPA = false;

    /**
     * @brief Reconstructs the IO components from a public inputs array.
     *
     * @param public_inputs Public inputs array containing the serialized kernel public inputs.
     */
    void reconstruct_from_public(const std::vector<FF>& public_inputs)
    {
        BB_ASSERT_GTE(
            public_inputs.size(), PUBLIC_INPUTS_SIZE, "Public inputs too small for HidingKernelIO reconstruction");
        // Assumes that the hiding-kernel-io public inputs are at the end of the public_inputs vector
        size_t index = public_inputs.size() - PUBLIC_INPUTS_SIZE;
        pairing_inputs = PublicPairingPoints::reconstruct(public_inputs, PublicComponentKey{ index });
        index += PairingInputs::PUBLIC_INPUTS_SIZE;
        kernel_return_data = PublicPoint::reconstruct(public_inputs, PublicComponentKey{ index });
        index += G1::PUBLIC_INPUTS_SIZE;
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
        Builder* builder = ecc_op_tables[0].get_context();

        pairing_inputs.set_public(builder);
        kernel_return_data.set_public();
        for (auto& commitment : ecc_op_tables) {
            commitment.set_public();
        }

        // Finalize the public inputs to ensure no more public inputs can be added hereafter.
        builder->finalize_public_inputs();
    }

    /**
     * @brief Add default public inputs when they are not present
     *
     */
    static void add_default(Builder& builder)
    {
        HidingKernelIO inputs;
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
        inputs.set_public();
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
    using PairingInputs = stdlib::recursion::PairingPoints<Curve>;
    using IpaClaim = OpeningClaim<stdlib::grumpkin<Builder>>;

    using PublicPairingPoints = stdlib::PublicInputComponent<PairingInputs>;
    using PublicIpaClaim = stdlib::PublicInputComponent<IpaClaim>;

    PairingInputs pairing_inputs;
    IpaClaim ipa_claim;

    // Total size of the IO public inputs
    static constexpr size_t PUBLIC_INPUTS_SIZE = ROLLUP_PUBLIC_INPUTS_SIZE;
    static constexpr bool HasIPA = true;

    /**
     * @brief Reconstructs the IO components from a public inputs array.
     *
     * @param public_inputs Public inputs array containing the serialized kernel public inputs.
     */
    void reconstruct_from_public(const std::vector<FF>& public_inputs)
    {
        BB_ASSERT_GTE(public_inputs.size(), PUBLIC_INPUTS_SIZE, "Public inputs too small for RollupIO reconstruction");
        size_t index = public_inputs.size() - PUBLIC_INPUTS_SIZE;
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
        Builder* builder = ipa_claim.commitment.get_context();

        pairing_inputs.set_public(builder);
        ipa_claim.set_public();

        // Finalize the public inputs to ensure no more public inputs can be added hereafter.
        builder->finalize_public_inputs();
    }

    /**
     * @brief Add default public inputs when they are not present
     *
     */
    static void add_default(Builder& builder)
    {
        RollupIO inputs;
        inputs.pairing_inputs = PairingInputs::construct_default();
        auto [stdlib_opening_claim, ipa_proof] =
            IPA<grumpkin<Builder>>::create_random_valid_ipa_claim_and_proof(builder);
        inputs.ipa_claim = stdlib_opening_claim;
        inputs.set_public();

        builder.ipa_proof = ipa_proof;
    };
};
} // namespace bb::stdlib::recursion::honk
