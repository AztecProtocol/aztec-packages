#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/crypto/ecdsa/ecdsa.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/encryption/ecdsa/ecdsa.hpp"
#include "barretenberg/stdlib/hash/keccak/keccak.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/hash/sha256/sha256.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb {

/**
 * @brief Generate a test circuit using SHA256 compression (sha256_block)
 *
 * @details Creates circuit constraints by iteratively calling sha256_block,
 * feeding the output as h_init for the next iteration. This tests the
 * primitive exposed to ACIR (Sha256Compression opcode).
 */
template <typename Builder> void generate_sha256_test_circuit(Builder& builder, size_t num_iterations)
{
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;

    // SHA-256 initial hash values (FIPS 180-4 section 5.3.3)
    constexpr std::array<uint32_t, 8> H_INIT = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                                 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };

    // Initialize h_init as witnesses
    std::array<field_ct, 8> h_init;
    for (size_t i = 0; i < 8; i++) {
        h_init[i] = witness_ct(&builder, H_INIT[i]);
    }

    // Create a block of zeros as witnesses
    std::array<field_ct, 16> block;
    for (size_t i = 0; i < 16; i++) {
        block[i] = witness_ct(&builder, 0);
    }

    // Iterate: feed output of compression back as h_init for next round
    for (size_t i = 0; i < num_iterations; i++) {
        h_init = stdlib::SHA256<Builder>::sha256_block(h_init, block);
    }
}

/**
 * @brief Generate a test circuit that computes a single poseidon2 hash over a vector of `num_inputs` field elements.
 */
template <typename Builder> void generate_poseidon2_hash_test_circuit(Builder& builder, size_t num_inputs)
{
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;

    std::vector<field_ct> inputs;
    inputs.reserve(num_inputs);
    for (size_t i = 0; i < num_inputs; i++) {
        inputs.emplace_back(witness_ct(&builder, bb::fr(i + 1)));
    }

    auto out = stdlib::poseidon2<Builder>::hash(inputs);
    out.set_public();
}

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
    using RecursiveVerifier = bb::UltraVerifier_<RecursiveFlavor, bb::stdlib::recursion::honk::DefaultIO<MegaBuilder>>;
    using VerifierInstance = VerifierInstance_<Flavor>;
    using RecursiveVerifierInstance = VerifierInstance_<RecursiveFlavor>;
    using RecursiveVKAndHash = RecursiveVerifierInstance::VKAndHash;
    using RecursiveVerifierAccumulator = std::shared_ptr<RecursiveVerifierInstance>;
    using VerificationKey = Flavor::VerificationKey;

    static constexpr size_t NUM_WIRES = Flavor::NUM_WIRES;

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
        BB_BENCH();

        if (large) { // Results in circuit size 2^19
            generate_sha256_test_circuit<MegaBuilder>(builder, 9);
            stdlib::generate_ecdsa_verification_test_circuit(builder, 8);
        } else { // Results in circuit size 2^17
            generate_sha256_test_circuit<MegaBuilder>(builder, 8);
            stdlib::generate_ecdsa_verification_test_circuit(builder, 2);
        }
    }

    /**
     * @brief Generate a simple test circuit with some ECC op gates and conventional arithmetic gates
     *
     * @param builder
     */
    static void add_some_ecc_op_gates(MegaBuilder& builder)
    {
        BB_BENCH();

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
     * @brief Add some randomness into the op queue.
     */
    static void randomise_op_queue(MegaBuilder& builder, size_t num_ops)
    {

        for (size_t i = 0; i < num_ops; ++i) {
            builder.queue_ecc_random_op();
        }
    }

    /**
     * @brief Generate a simple test circuit with some ECC op gates and conventional arithmetic gates
     *
     * @param builder
     */
    static void construct_simple_circuit(MegaBuilder& builder)
    {
        BB_BENCH();

        add_some_ecc_op_gates(builder);
        MockCircuits::construct_arithmetic_circuit(builder);
        bb::stdlib::recursion::honk::DefaultIO<MegaBuilder>::add_default(builder);
    }

    static void construct_and_merge_mock_circuits(Goblin& goblin, const size_t num_circuits = 3)
    {
        for (size_t idx = 0; idx < num_circuits - 1; ++idx) {
            MegaCircuitBuilder builder{ goblin.op_queue };
            construct_simple_circuit(builder);
            goblin.op_queue->merge();
        }
        MegaCircuitBuilder builder{ goblin.op_queue };
        GoblinMockCircuits::construct_simple_circuit(builder);
        // The final subtable plays the role of the hiding kernel, whose merge subtable has a fixed size that the
        // merge verifier hard-codes the shift size from. Pad with ecc ops up to that size, leaving room for the
        // trailing ZK random ops.
        const size_t target_size = bb::HIDING_KERNEL_ULTRA_OPS - TranslatorCircuitBuilder::NUM_RANDOM_OPS_END;
        BB_ASSERT_LTE(goblin.op_queue->get_current_subtable_size(), target_size);
        while (goblin.op_queue->get_current_subtable_size() < target_size) {
            builder.queue_ecc_add_accum(Point::random_element(&engine));
        }
        // Add random ops at END for Translator ZK
        randomise_op_queue(builder, TranslatorCircuitBuilder::NUM_RANDOM_OPS_END);
    }

    /**
     * @brief Construct a mock kernel circuit
     * @details Construct an arbitrary circuit meant to represent the aztec private function execution kernel. Recursive
     * folding verification is handled internally by Chonk, not in the kernel.
     *
     * @param builder
     * @param function_fold_proof
     * @param kernel_fold_proof
     */
    static void construct_mock_folding_kernel(MegaBuilder& builder)
    {
        BB_BENCH();

        // Add operations representing general kernel logic e.g. state updates. Note: these are structured to make
        // the kernel "full" within the dyadic size 2^17
        const size_t NUM_ECDSA_VERIFICATIONS = 2;
        const size_t NUM_SHA_HASHES = 10;
        stdlib::generate_ecdsa_verification_test_circuit(builder, NUM_ECDSA_VERIFICATIONS);
        generate_sha256_test_circuit<MegaBuilder>(builder, NUM_SHA_HASHES);
    }
};
} // namespace bb
