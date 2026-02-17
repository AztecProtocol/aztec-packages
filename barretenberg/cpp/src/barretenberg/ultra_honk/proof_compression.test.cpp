#include <gtest/gtest.h>

#include "barretenberg/common/log.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/ultra_honk/proof_compression.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

using namespace bb;

class ProofCompressionTests : public ::testing::Test {
  public:
    using Flavor = MegaFlavor;
    using Builder = Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor, DefaultIO>;
    using VerificationKey = Flavor::VerificationKey;
    using ProverInstance = ProverInstance_<Flavor>;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(ProofCompressionTests, CompressDecompressRoundtrip)
{
    Builder builder;
    GoblinMockCircuits::construct_simple_circuit(builder);

    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    auto vk_and_hash = std::make_shared<Flavor::VKAndHash>(verification_key);

    Prover prover(prover_instance, verification_key);
    HonkProof original_proof = prover.construct_proof();

    size_t log_n = Flavor::VIRTUAL_LOG_N;
    size_t num_public_inputs = original_proof.size() - ProofLength::Honk<Flavor>::LENGTH_WITHOUT_PUB_INPUTS(log_n);

    info("Original proof size: ", original_proof.size(), " Fr elements (", original_proof.size() * 32, " bytes)");

    auto compressed = ProofCompressor::compress_proof<Flavor>(original_proof, num_public_inputs, log_n);

    info("Compressed proof size: ", compressed.size(), " bytes");
    info("Compression ratio: ",
         static_cast<double>(original_proof.size() * 32) / static_cast<double>(compressed.size()),
         "x");

    size_t num_commitments = Flavor::NUM_WITNESS_ENTITIES + (log_n - 1) + 2;
    info("  Commitments: ", num_commitments, " (saved ", num_commitments * 3 * 32, " bytes from point compression)");

    HonkProof decompressed = ProofCompressor::decompress_proof<Flavor>(compressed, num_public_inputs, log_n);

    ASSERT_EQ(decompressed.size(), original_proof.size()) << "Decompressed proof size mismatch";
    for (size_t i = 0; i < original_proof.size(); i++) {
        ASSERT_EQ(decompressed[i], original_proof[i]) << "Mismatch at element " << i;
    }

    Verifier verifier(vk_and_hash);
    bool verified = verifier.verify_proof(decompressed).result;
    EXPECT_TRUE(verified) << "Decompressed proof failed verification";

    info("Roundtrip test PASSED");
}
