// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/crypto/ecdsa/ecdsa.hpp"
#include "barretenberg/crypto/merkle_tree/membership.hpp"
#include "barretenberg/crypto/merkle_tree/memory_store.hpp"
#include "barretenberg/crypto/merkle_tree/merkle_tree.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/encryption/ecdsa/ecdsa.hpp"
#include "barretenberg/stdlib/hash/keccak/keccak.hpp"
#include "barretenberg/stdlib/hash/sha256/sha256.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"
#include "barretenberg/stdlib/primitives/packed_byte_array/packed_byte_array.hpp"
#include "barretenberg/stdlib/protogalaxy_verifier/protogalaxy_recursive_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"

namespace bb {

/**
 * @brief An arbitrary but small-ish structuring that can be used for testing with non-trivial circuits in cases when
 * they overflow
 */
static constexpr TraceStructure SMALL_TEST_STRUCTURE_FOR_OVERFLOWS{ .ecc_op = 1 << 14,
                                                                    .busread = 1 << 14,
                                                                    .lookup = 1 << 14,
                                                                    .pub_inputs = 1 << 14,
                                                                    .arithmetic = 1 << 15,
                                                                    .delta_range = 1 << 14,
                                                                    .elliptic = 1 << 14,
                                                                    .aux = 1 << 14,
                                                                    .poseidon2_external = 1 << 14,
                                                                    .poseidon2_internal = 1 << 15,
                                                                    .overflow = 0 };

class GoblinMockCircuits {
  public:
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Fbase = Curve::BaseField;
    using Point = Curve::AffineElement;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using OpQueue = bb::ECCOpQueue;
    using MegaBuilder = bb::MegaCircuitBuilder;
    using Flavor = bb::MegaFlavor;
    using RecursiveFlavor = bb::MegaRecursiveFlavor_<MegaBuilder>;
    using RecursiveVerifier = bb::stdlib::recursion::honk::UltraRecursiveVerifier_<RecursiveFlavor>;
    using DeciderVerificationKey = bb::DeciderVerificationKey_<Flavor>;
    using RecursiveDeciderVerificationKey =
        ::bb::stdlib::recursion::honk::RecursiveDeciderVerificationKey_<RecursiveFlavor>;
    using RecursiveVerificationKey = RecursiveDeciderVerificationKey::VerificationKey;
    using RecursiveVerifierAccumulator = std::shared_ptr<RecursiveDeciderVerificationKey>;
    using VerificationKey = Flavor::VerificationKey;

    using PairingPoints = stdlib::recursion::PairingPoints<MegaBuilder>;
    static constexpr size_t NUM_WIRES = Flavor::NUM_WIRES;

    struct KernelInput {
        HonkProof proof;
        std::shared_ptr<Flavor::VerificationKey> verification_key;
    };

    /**
     * @brief Populate a builder with some arbitrary but nontrivial constraints
     * @details Although the details of the circuit constructed here are arbitrary, the intent is to mock something a
     * bit more realistic than a circuit comprised entirely of arithmetic gates. E.g. the circuit should respond
     * realistically to efforts to parallelize circuit construction.
     *
     * @param builder
     * @param large If true, construct a "large" circuit (2^19), else a medium circuit (2^17)
     */
    static void construct_mock_app_circuit(MegaBuilder& builder, bool large = false)
    {
        PROFILE_THIS();

        if (large) { // Results in circuit size 2^19
            stdlib::generate_sha256_test_circuit(builder, 9);
            stdlib::generate_ecdsa_verification_test_circuit(builder, 9);
            stdlib::generate_merkle_membership_test_circuit(builder, 12);
        } else { // Results in circuit size 2^17
            stdlib::generate_sha256_test_circuit(builder, 8);
            stdlib::generate_ecdsa_verification_test_circuit(builder, 2);
            stdlib::generate_merkle_membership_test_circuit(builder, 10);
        }

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/911): We require goblin ops to be added to the
        // function circuit because we cannot support zero commtiments. While the builder handles this at
        // DeciderProvingKey creation stage via the add_gates_to_ensure_all_polys_are_non_zero function for other
        // MegaHonk circuits (where we don't explicitly need to add goblin ops), in IVC merge proving happens prior to
        // folding where the absense of goblin ecc ops will result in zero commitments.
        MockCircuits::construct_goblin_ecc_op_circuit(builder);
        PairingPoints::add_default_to_public_inputs(builder);
    }

    /**
     * @brief Populate a builder with some arbitrary but nontrivial constraints
     * @details Although the details of the circuit constructed here are arbitrary, the intent is to mock something a
     * bit more realistic than a circuit comprised entirely of arithmetic gates. E.g. the circuit should respond
     * realistically to efforts to parallelize circuit construction.
     *
     * @param builder
     * @param large If true, construct a "large" circuit (2^19), else a medium circuit (2^17)
     */
    static void construct_mock_function_circuit(MegaBuilder& builder, bool large = false)
    {
        PROFILE_THIS();

        // Determine number of times to execute the below operations that constitute the mock circuit logic. Note that
        // the circuit size does not scale linearly with number of iterations due to e.g. amortization of lookup costs
        const size_t NUM_ITERATIONS_LARGE = 12; // results in circuit size 2^19 (502238 gates)

        if (large) {
            stdlib::generate_sha256_test_circuit(builder, NUM_ITERATIONS_LARGE);
            stdlib::generate_ecdsa_verification_test_circuit(builder, NUM_ITERATIONS_LARGE / 2);
            stdlib::generate_merkle_membership_test_circuit(builder, NUM_ITERATIONS_LARGE);
        } else { // Results in circuit size 2^17 when accumulated via ClientIvc
            stdlib::generate_sha256_test_circuit(builder, 5);
            stdlib::generate_ecdsa_verification_test_circuit(builder, 1);
            stdlib::generate_merkle_membership_test_circuit(builder, 10);
        }
        PairingPoints::add_default_to_public_inputs(builder);
    }

    /**
     * @brief Generate a simple test circuit with some ECC op gates and conventional arithmetic gates
     *
     * @param builder
     */
    static void add_some_ecc_op_gates(MegaBuilder& builder)
    {
        PROFILE_THIS();

        // Add some arbitrary ecc op gates
        for (size_t i = 0; i < 3; ++i) {
            auto point = Point::random_element(&engine);
            auto scalar = FF::random_element(&engine);
            builder.queue_ecc_add_accum(point);
            builder.queue_ecc_mul_accum(point, scalar);
        }
        // queues the result of the preceding ECC
        builder.queue_ecc_eq(); // should be eq and reset
    }

    /**
     * @brief Generate a simple test circuit with some ECC op gates and conventional arithmetic gates
     *
     * @param builder
     */
    static void construct_simple_circuit(MegaBuilder& builder)
    {
        PROFILE_THIS();
        add_some_ecc_op_gates(builder);
        MockCircuits::construct_arithmetic_circuit(builder);
        PairingPoints::add_default_to_public_inputs(builder);
    }

    /**
     * @brief Construct a mock kernel circuit
     * @details Construct an arbitrary circuit meant to represent the aztec private function execution kernel. Recursive
     * folding verification is handled internally by ClientIvc, not in the kernel.
     *
     * @param builder
     * @param function_fold_proof
     * @param kernel_fold_proof
     */
    static void construct_mock_folding_kernel(MegaBuilder& builder)
    {
        PROFILE_THIS();

        // Add operations representing general kernel logic e.g. state updates. Note: these are structured to make
        // the kernel "full" within the dyadic size 2^17
        const size_t NUM_MERKLE_CHECKS = 19;
        const size_t NUM_ECDSA_VERIFICATIONS = 1;
        const size_t NUM_SHA_HASHES = 1;
        stdlib::generate_merkle_membership_test_circuit(builder, NUM_MERKLE_CHECKS);
        stdlib::generate_ecdsa_verification_test_circuit(builder, NUM_ECDSA_VERIFICATIONS);
        stdlib::generate_sha256_test_circuit(builder, NUM_SHA_HASHES);
    }

    /**
     * @brief A minimal version of the mock kernel (recursive verifiers only) for faster testing
     *
     */
    static void construct_mock_kernel_small(MegaBuilder& builder,
                                            const KernelInput& function_accum,
                                            const KernelInput& prev_kernel_accum)
    {
        PROFILE_THIS();
        using PairingPoints = stdlib::recursion::PairingPoints<MegaBuilder>;

        // Execute recursive aggregation of function proof
        auto verification_key = std::make_shared<RecursiveVerificationKey>(&builder, function_accum.verification_key);
        auto proof = bb::convert_native_proof_to_stdlib(&builder, function_accum.proof);
        RecursiveVerifier verifier_1{ &builder, verification_key };
        RecursiveVerifier::Output output_1 = verifier_1.verify_proof(proof);
        PairingPoints points_accumulator = output_1.points_accumulator;
        // Execute recursive aggregation of previous kernel proof if one exists
        if (!prev_kernel_accum.proof.empty()) {
            auto verification_key =
                std::make_shared<RecursiveVerificationKey>(&builder, prev_kernel_accum.verification_key);
            auto proof = bb::convert_native_proof_to_stdlib(&builder, prev_kernel_accum.proof);
            RecursiveVerifier verifier_2{ &builder, verification_key };
            RecursiveVerifier::Output output_2 = verifier_2.verify_proof(proof);
            points_accumulator = output_2.points_accumulator;
        }
        points_accumulator.set_public();
    }
};
} // namespace bb
