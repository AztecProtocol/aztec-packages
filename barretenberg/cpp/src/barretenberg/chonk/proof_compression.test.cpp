#include <gtest/gtest.h>

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/ultra_honk/proof_compression.hpp"

using namespace bb;

class ChonkProofCompressionTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using CircuitProducer = PrivateFunctionExecutionMockCircuitProducer;
};

TEST_F(ChonkProofCompressionTests, CompressDecompressRoundtrip)
{
    // Generate a valid Chonk proof
    const size_t NUM_APP_CIRCUITS = 1;
    CircuitProducer circuit_producer(NUM_APP_CIRCUITS);
    const size_t num_circuits = circuit_producer.total_num_circuits;
    Chonk ivc{ num_circuits };
    TestSettings settings{ .log2_num_gates = 5 };

    for (size_t j = 0; j < num_circuits; ++j) {
        circuit_producer.construct_and_accumulate_next_circuit(ivc, settings);
    }

    ChonkProof original_proof = ivc.prove();
    auto vk_and_hash = ivc.get_hiding_kernel_vk_and_hash();

    auto original_flat = original_proof.to_field_elements();

    info("Original proof size: ", original_flat.size(), " Fr elements (", original_flat.size() * 32, " bytes)");

    // Compress
    auto compressed = ProofCompressor::compress_chonk_proof(original_proof);

    info("Compressed proof size: ", compressed.size(), " bytes");
    info("Compression ratio: ",
         static_cast<double>(original_flat.size() * 32) / static_cast<double>(compressed.size()),
         "x");

    // Decompress
    size_t mega_num_pub_inputs =
        original_proof.mega_proof.size() - ChonkProof::HIDING_KERNEL_PROOF_LENGTH_WITHOUT_PUBLIC_INPUTS;
    ChonkProof decompressed = ProofCompressor::decompress_chonk_proof(compressed, mega_num_pub_inputs);

    // Verify element-by-element roundtrip
    auto decompressed_flat = decompressed.to_field_elements();
    ASSERT_EQ(decompressed_flat.size(), original_flat.size()) << "Decompressed proof size mismatch";
    for (size_t i = 0; i < original_flat.size(); i++) {
        ASSERT_EQ(decompressed_flat[i], original_flat[i]) << "Mismatch at element " << i;
    }

    // Verify sub-proof sizes match
    ASSERT_EQ(decompressed.mega_proof.size(), original_proof.mega_proof.size()) << "mega_proof size mismatch";
    ASSERT_EQ(decompressed.goblin_proof.merge_proof.size(), original_proof.goblin_proof.merge_proof.size())
        << "merge_proof size mismatch";
    ASSERT_EQ(decompressed.goblin_proof.eccvm_proof.size(), original_proof.goblin_proof.eccvm_proof.size())
        << "eccvm_proof size mismatch";
    ASSERT_EQ(decompressed.goblin_proof.ipa_proof.size(), original_proof.goblin_proof.ipa_proof.size())
        << "ipa_proof size mismatch";
    ASSERT_EQ(decompressed.goblin_proof.translator_proof.size(), original_proof.goblin_proof.translator_proof.size())
        << "translator_proof size mismatch";

    // Verify the decompressed proof
    ChonkNativeVerifier verifier(vk_and_hash);
    bool verified = verifier.verify(decompressed);
    EXPECT_TRUE(verified) << "Decompressed proof failed verification";

    info("Chonk roundtrip test PASSED");
}
