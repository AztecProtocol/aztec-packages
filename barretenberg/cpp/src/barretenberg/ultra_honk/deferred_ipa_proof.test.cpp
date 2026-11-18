#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

#include <gtest/gtest.h>

using namespace bb;

// RollupIO::add_default computes the IPA proof in the background; through the builder, and through a prover instance
// built before it was resolved, it equals the proof that create_valid_ipa_claim_and_proof computes inline.
TEST(DeferredIpaProof, EqualsSynchronousProof)
{
    using RecursiveIPA = IPA<stdlib::grumpkin<UltraCircuitBuilder>>;
    srs::init_file_crs_factory(srs::bb_crs_path());
    const auto [polynomial, challenge] = RecursiveIPA::sample_random_opening();

    UltraCircuitBuilder synchronous_builder;
    const HonkProof expected =
        RecursiveIPA::create_valid_ipa_claim_and_proof(synchronous_builder, polynomial, challenge).second;

    UltraCircuitBuilder builder;
    stdlib::recursion::honk::RollupIO::add_default(builder, polynomial, challenge);
    EXPECT_EQ(builder.pending_ipa_proof.valid(), rollup_experimental_optimizations_enabled());

    ProverInstance_<UltraFlavor> prover_instance(builder);
    EXPECT_TRUE(prover_instance.has_ipa_proof());
    EXPECT_EQ(prover_instance.resolve_ipa_proof(), expected);

    EXPECT_EQ(builder.resolve_ipa_proof(), expected);
    EXPECT_EQ(builder.resolve_ipa_proof(), expected);
    EXPECT_FALSE(builder.pending_ipa_proof.valid());
}
