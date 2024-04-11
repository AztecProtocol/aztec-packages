#include "barretenberg/crypto/generators/generator_data.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm/generated/spike_circuit_builder.hpp"
#include "barretenberg/vm/generated/spike_flavor.hpp"

// Proofs
#include "barretenberg/vm/generated/spike_composer.hpp"
#include "barretenberg/vm/generated/spike_prover.hpp"
#include "barretenberg/vm/generated/spike_verifier.hpp"

#include <gtest/gtest.h>

using namespace bb;
namespace {
auto& engine = numeric::get_debug_randomness();
}

// Test file for testing public inputs evaluations are the same in the verifier and in sumcheck

TEST(SpikeVerifierColumnsCircuitBuilder, VerificationSuccess)
{
    // using FF = SpikeFlavor::FF;
    using Builder = SpikeCircuitBuilder;
    using Row = Builder::Row;
    Builder circuit_builder;

    const size_t circuit_size = 16;
    std::vector<Row> rows;

    // Add to the public input column that is increasing
    for (size_t i = 0; i < circuit_size; i++) {
        Row row{ .Spike_kernel_inputs__is_public = i };
        rows.push_back(row);
    }

    circuit_builder.set_trace(std::move(rows));

    // Create a prover and verifier
    auto composer = SpikeComposer();
    auto prover = composer.create_prover(circuit_builder);
    HonkProof proof = prover.construct_proof();

    auto verifier = composer.create_verifier(circuit_builder);
    bool verified = verifier.verify_proof(proof);

    info("verified: ", verified);
}