
#include <gtest/gtest.h>

// #include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "proof.hpp"

using namespace bb;

namespace {
auto& engine = bb::numeric::get_debug_randomness();
}

/**
 * @brief A test demonstrating that a stdlib Proof can be serialized and deserialized correctly.
 *
 */
TEST(ProofTest, Basic)
{
    using Builder = MegaCircuitBuilder;
    using Proof = bb::stdlib::Proof<Builder>;
    using NativeProof = bb::HonkProof;

    // Create a mock native proof with some random field elements
    const size_t proof_size = 10;
    NativeProof native_proof;
    for (size_t i = 0; i < proof_size; ++i) {
        native_proof.push_back(fr::random_element(&engine));
    }

    // Construct a stdlib proof from the native proof
    Builder builder;
    Proof proof(builder, native_proof);

    // Verify the sizes match
    EXPECT_EQ(proof.size(), native_proof.size());

    // Verify the proof returned by get_value() matches the original
    EXPECT_EQ(proof.get_value(), native_proof);
}
