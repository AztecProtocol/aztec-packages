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
 * Mirrors the structure of stdlib KernelIO_<N> but works with native types.
 */
template <size_t N> class KernelIOSerde_ {
  public:
    using NativeFF = bb::fr;
    using NativeG1 = curve::BN254::AffineElement;
    using NativeFq = curve::BN254::BaseField;
    using NativePairingPoints = bb::PairingPoints<curve::BN254>;
    using NativeAppReturnDataCommitments = std::array<NativeG1, N>;

    static constexpr size_t PUBLIC_INPUTS_SIZE = kernel_public_inputs_size(N);

    NativePairingPoints pairing_inputs;
    NativeG1 kernel_return_data;
    NativeAppReturnDataCommitments app_return_data;
    NativeFF ecc_op_hash;
    NativeFF output_hn_accum_hash;

    /**
     * @brief Deserialize KernelIO from a proof vector
     * @param proof The proof vector (public inputs are at the beginning)
     * @param num_public_inputs Total number of public inputs in the proof
     * @details KernelIO is at the END of the public inputs section, so we start at
     *          offset (num_public_inputs - PUBLIC_INPUTS_SIZE)
     */
    static KernelIOSerde_ from_proof(const std::vector<NativeFF>& proof, size_t num_public_inputs)
    {
        KernelIOSerde_ result;
        // KernelIO is at the end of public inputs, which are at the start of the proof
        size_t idx = num_public_inputs - PUBLIC_INPUTS_SIZE;

        // Each G1 point is 4 fr elements (2 limbs for x, 2 limbs for y) using 136-bit limb encoding
        auto deserialize_point = [&]() {
            std::span<const NativeFF, NativeG1::PUBLIC_INPUTS_SIZE> limbs(proof.data() + idx,
                                                                          NativeG1::PUBLIC_INPUTS_SIZE);
            idx += NativeG1::PUBLIC_INPUTS_SIZE;
            return FrCodec::deserialize_from_fields<NativeG1>(limbs);
        };

        result.pairing_inputs.P0() = deserialize_point();
        result.pairing_inputs.P1() = deserialize_point();
        result.kernel_return_data = deserialize_point();
        for (auto& app_commitment : result.app_return_data) {
            app_commitment = deserialize_point();
        }
        result.ecc_op_hash = proof[idx++];
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

        // Serialize fq to 2 fr limbs using 136-bit encoding (matching FrCodec)
        auto serialize_fq = [&](const NativeFq& fq_val) {
            constexpr uint64_t NUM_LIMB_BITS = 2 * NUM_LIMB_BITS_IN_FIELD_SIMULATION; // 136 bits
            constexpr uint256_t LIMB_MASK = (uint256_t(1) << NUM_LIMB_BITS) - 1;
            uint256_t val = static_cast<uint256_t>(fq_val);
            proof[idx++] = NativeFF(val & LIMB_MASK);
            proof[idx++] = NativeFF((val >> NUM_LIMB_BITS) & LIMB_MASK);
        };

        auto serialize_point = [&](const NativeG1& point) {
            if (point.is_point_at_infinity()) {
                for (size_t i = 0; i < NativeG1::PUBLIC_INPUTS_SIZE; ++i) {
                    proof[idx++] = NativeFF::zero();
                }
            } else {
                serialize_fq(point.x);
                serialize_fq(point.y);
            }
        };

        serialize_point(pairing_inputs.P0());
        serialize_point(pairing_inputs.P1());
        serialize_point(kernel_return_data);
        for (const auto& app_commitment : app_return_data) {
            serialize_point(app_commitment);
        }
        proof[idx++] = ecc_op_hash;
        proof[idx] = output_hn_accum_hash;
    }
};

using KernelIOSerde = KernelIOSerde_<MAX_APPS_PER_KERNEL>;

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

        // Each G1 point is 4 fr elements (2 limbs for x, 2 limbs for y) using 136-bit limb encoding
        auto deserialize_point = [&]() {
            std::span<const NativeFF, NativeG1::PUBLIC_INPUTS_SIZE> limbs(proof.data() + idx,
                                                                          NativeG1::PUBLIC_INPUTS_SIZE);
            idx += NativeG1::PUBLIC_INPUTS_SIZE;
            return FrCodec::deserialize_from_fields<NativeG1>(limbs);
        };

        result.pairing_inputs.P0() = deserialize_point();
        result.pairing_inputs.P1() = deserialize_point();

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
            if (point.is_point_at_infinity()) {
                for (size_t i = 0; i < NativeG1::PUBLIC_INPUTS_SIZE; ++i) {
                    proof[idx++] = NativeFF::zero();
                }
            } else {
                serialize_fq(point.x);
                serialize_fq(point.y);
            }
        };

        serialize_point(pairing_inputs.P0());
        serialize_point(pairing_inputs.P1());
    }
};

} // namespace bb::stdlib::recursion::honk
