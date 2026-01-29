#pragma once

#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/honk/types/public_inputs_type.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief **For test purposes only**: Native representation and serde for KernelIO public inputs
 * @details Used for testing and verification with native bb::fr vectors.
 * Mirrors the structure of stdlib KernelIO but works with native types.
 */
class KernelIOSerde {
  public:
    using NativeFF = bb::fr;
    using NativeG1 = curve::BN254::AffineElement;
    using NativeFq = curve::BN254::BaseField;
    using NativePairingPoints = bb::PairingPoints<curve::BN254>;
    using NativeTableCommitments = std::array<NativeG1, MegaCircuitBuilder::NUM_WIRES>;

    static constexpr size_t PUBLIC_INPUTS_SIZE = KERNEL_PUBLIC_INPUTS_SIZE;

    NativePairingPoints pairing_inputs;
    NativeG1 kernel_return_data;
    NativeG1 app_return_data;
    NativeTableCommitments ecc_op_tables;
    NativeFF output_hn_accum_hash;

    /**
     * @brief Deserialize KernelIO from a proof vector
     * @param proof The proof vector (public inputs are at the beginning)
     * @param num_public_inputs Total number of public inputs in the proof
     * @details KernelIO is at the END of the public inputs section, so we start at
     *          offset (num_public_inputs - PUBLIC_INPUTS_SIZE)
     */
    static KernelIOSerde from_proof(const std::vector<NativeFF>& proof, size_t num_public_inputs)
    {
        KernelIOSerde result;
        // KernelIO is at the end of public inputs, which are at the start of the proof
        size_t idx = num_public_inputs - PUBLIC_INPUTS_SIZE;

        // Each G1 point is 4 fr elements (2 limbs for x, 2 limbs for y) using 128-bit limb encoding
        auto deserialize_point = [&]() {
            std::span<const NativeFF, NativeG1::PUBLIC_INPUTS_SIZE> limbs(proof.data() + idx,
                                                                          NativeG1::PUBLIC_INPUTS_SIZE);
            idx += NativeG1::PUBLIC_INPUTS_SIZE;
            return FrCodec::deserialize_from_fields<NativeG1>(limbs);
        };

        result.pairing_inputs.P0 = deserialize_point();
        result.pairing_inputs.P1 = deserialize_point();
        result.kernel_return_data = deserialize_point();
        result.app_return_data = deserialize_point();
        for (auto& commitment : result.ecc_op_tables) {
            commitment = deserialize_point();
        }
        result.output_hn_accum_hash = proof[idx];

        return result;
    }

    /**
     * @brief Serialize KernelIO back to a proof vector
     * @param proof The proof vector to write to
     * @param num_public_inputs Total number of public inputs in the proof
     */
    void to_proof(std::vector<NativeFF>& proof, size_t num_public_inputs) const
    {
        // KernelIO is at the end of public inputs, which are at the start of the proof
        size_t idx = num_public_inputs - PUBLIC_INPUTS_SIZE;

        // Serialize fq to 2 fr limbs using 128-bit encoding (matching FrCodec)
        auto serialize_fq = [&](const NativeFq& fq_val) {
            constexpr uint64_t NUM_LIMB_BITS = 2 * NUM_LIMB_BITS_IN_FIELD_SIMULATION; // 136 bits
            constexpr uint256_t LIMB_MASK = (uint256_t(1) << NUM_LIMB_BITS) - 1;
            uint256_t val = static_cast<uint256_t>(fq_val);
            proof[idx++] = NativeFF(val & LIMB_MASK);
            proof[idx++] = NativeFF((val >> NUM_LIMB_BITS) & LIMB_MASK);
        };

        auto serialize_point = [&](const NativeG1& point) {
            serialize_fq(point.x);
            serialize_fq(point.y);
        };

        serialize_point(pairing_inputs.P0);
        serialize_point(pairing_inputs.P1);
        serialize_point(kernel_return_data);
        serialize_point(app_return_data);
        for (const auto& commitment : ecc_op_tables) {
            serialize_point(commitment);
        }
        proof[idx] = output_hn_accum_hash;
    }
};

/**
 * @brief Native representation and serde for HidingKernelIO public inputs
 * @details Used for testing and verification with native bb::fr vectors.
 * Mirrors the structure of stdlib HidingKernelIO but works with native types.
 * HidingKernelIO is the final kernel output (no accum hash since folding terminates).
 */
class HidingKernelIOSerde {
  public:
    using NativeFF = bb::fr;
    using NativeG1 = curve::BN254::AffineElement;
    using NativeFq = curve::BN254::BaseField;
    using NativePairingPoints = bb::PairingPoints<curve::BN254>;
    using NativeTableCommitments = std::array<NativeG1, MegaCircuitBuilder::NUM_WIRES>;

    static constexpr size_t PUBLIC_INPUTS_SIZE = HIDING_KERNEL_PUBLIC_INPUTS_SIZE;

    NativePairingPoints pairing_inputs;
    NativeG1 kernel_return_data;
    NativeTableCommitments ecc_op_tables;

    /**
     * @brief Deserialize HidingKernelIO from a proof vector
     * @param proof The proof vector (public inputs are at the beginning)
     * @param num_public_inputs Total number of public inputs in the proof
     */
    static HidingKernelIOSerde from_proof(const std::vector<NativeFF>& proof, size_t num_public_inputs)
    {
        HidingKernelIOSerde result;
        size_t idx = num_public_inputs - PUBLIC_INPUTS_SIZE;

        auto deserialize_point = [&]() {
            std::span<const NativeFF, NativeG1::PUBLIC_INPUTS_SIZE> limbs(proof.data() + idx,
                                                                          NativeG1::PUBLIC_INPUTS_SIZE);
            idx += NativeG1::PUBLIC_INPUTS_SIZE;
            return FrCodec::deserialize_from_fields<NativeG1>(limbs);
        };

        result.pairing_inputs.P0 = deserialize_point();
        result.pairing_inputs.P1 = deserialize_point();
        result.kernel_return_data = deserialize_point();
        for (auto& commitment : result.ecc_op_tables) {
            commitment = deserialize_point();
        }

        return result;
    }

    /**
     * @brief Serialize HidingKernelIO back to a proof vector
     * @param proof The proof vector to write to
     * @param num_public_inputs Total number of public inputs in the proof
     */
    void to_proof(std::vector<NativeFF>& proof, size_t num_public_inputs) const
    {
        size_t idx = num_public_inputs - PUBLIC_INPUTS_SIZE;

        auto serialize_fq = [&](const NativeFq& fq_val) {
            constexpr uint64_t NUM_LIMB_BITS = 2 * NUM_LIMB_BITS_IN_FIELD_SIMULATION;
            constexpr uint256_t LIMB_MASK = (uint256_t(1) << NUM_LIMB_BITS) - 1;
            uint256_t val = static_cast<uint256_t>(fq_val);
            proof[idx++] = NativeFF(val & LIMB_MASK);
            proof[idx++] = NativeFF((val >> NUM_LIMB_BITS) & LIMB_MASK);
        };

        auto serialize_point = [&](const NativeG1& point) {
            serialize_fq(point.x);
            serialize_fq(point.y);
        };

        serialize_point(pairing_inputs.P0);
        serialize_point(pairing_inputs.P1);
        serialize_point(kernel_return_data);
        for (const auto& commitment : ecc_op_tables) {
            serialize_point(commitment);
        }
    }
};

/**
 * @brief Native representation and serde for AppIO public inputs
 * @details Used for testing and verification with native bb::fr vectors.
 * Mirrors the structure of stdlib AppIO but works with native types.
 * AppIO contains only pairing points from the app circuit's decider proof verification.
 */
class AppIOSerde {
  public:
    using NativeFF = bb::fr;
    using NativeG1 = curve::BN254::AffineElement;
    using NativeFq = curve::BN254::BaseField;
    using NativePairingPoints = bb::PairingPoints<curve::BN254>;

    static constexpr size_t PUBLIC_INPUTS_SIZE = DEFAULT_PUBLIC_INPUTS_SIZE; // 16 fr elements

    NativePairingPoints pairing_inputs;

    /**
     * @brief Deserialize AppIO from a proof vector
     * @param proof The proof vector (public inputs are at the beginning)
     * @param num_public_inputs Total number of public inputs in the proof
     * @details AppIO is at the END of the public inputs section, so we start at
     *          offset (num_public_inputs - PUBLIC_INPUTS_SIZE)
     */
    static AppIOSerde from_proof(const std::vector<NativeFF>& proof, size_t num_public_inputs)
    {
        AppIOSerde result;
        // AppIO is at the end of public inputs, which are at the start of the proof
        size_t idx = num_public_inputs - PUBLIC_INPUTS_SIZE;

        // Each G1 point is 4 fr elements (2 limbs for x, 2 limbs for y) using 128-bit limb encoding
        auto deserialize_point = [&]() {
            std::span<const NativeFF, NativeG1::PUBLIC_INPUTS_SIZE> limbs(proof.data() + idx,
                                                                          NativeG1::PUBLIC_INPUTS_SIZE);
            idx += NativeG1::PUBLIC_INPUTS_SIZE;
            return FrCodec::deserialize_from_fields<NativeG1>(limbs);
        };

        result.pairing_inputs.P0 = deserialize_point();
        result.pairing_inputs.P1 = deserialize_point();

        return result;
    }

    /**
     * @brief Serialize AppIO back to a proof vector
     * @param proof The proof vector to write to
     * @param num_public_inputs Total number of public inputs in the proof
     */
    void to_proof(std::vector<NativeFF>& proof, size_t num_public_inputs) const
    {
        // AppIO is at the end of public inputs, which are at the start of the proof
        size_t idx = num_public_inputs - PUBLIC_INPUTS_SIZE;

        auto serialize_fq = [&](const NativeFq& fq_val) {
            constexpr uint64_t NUM_LIMB_BITS = 2 * NUM_LIMB_BITS_IN_FIELD_SIMULATION;
            constexpr uint256_t LIMB_MASK = (uint256_t(1) << NUM_LIMB_BITS) - 1;
            uint256_t val = static_cast<uint256_t>(fq_val);
            proof[idx++] = NativeFF(val & LIMB_MASK);
            proof[idx++] = NativeFF((val >> NUM_LIMB_BITS) & LIMB_MASK);
        };

        auto serialize_point = [&](const NativeG1& point) {
            serialize_fq(point.x);
            serialize_fq(point.y);
        };

        serialize_point(pairing_inputs.P0);
        serialize_point(pairing_inputs.P1);
    }
};

} // namespace bb::stdlib::recursion::honk
