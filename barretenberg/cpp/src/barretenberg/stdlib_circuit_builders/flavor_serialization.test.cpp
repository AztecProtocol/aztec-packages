#include "barretenberg/common/serialize.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_delta.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/sumcheck/sumcheck_round.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

#include <gtest/gtest.h>

using namespace bb;

template <typename Flavor> class FlavorSerializationTests : public ::testing::Test {
  public:
    using Builder = typename Flavor::CircuitBuilder;
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;

  protected:
    static void SetUpTestSuite() { bb::srs::init_crs_factory("../srs_db/ignition"); }
};

using FlavorTypes = testing::Types<UltraFlavor, UltraKeccakFlavor, MegaFlavor>;
TYPED_TEST_SUITE(FlavorSerializationTests, FlavorTypes);

// Test msgpack serialization/deserialization of verification keys
TYPED_TEST(FlavorSerializationTests, VerificationKeySerialization)
{
    using Builder = typename TestFixture::Builder;
    using DeciderProvingKey = typename TestFixture::DeciderProvingKey;
    using VerificationKey = typename TestFixture::VerificationKey;

    Builder builder;

    // Add some arbitrary arithmetic gates that utilize public inputs
    MockCircuits::add_arithmetic_gates_with_public_inputs(builder, /*num_gates=*/100);

    auto proving_key = std::make_shared<DeciderProvingKey>(builder);
    VerificationKey original_vkey{ proving_key->proving_key };

    // Set the pcs ptr to null since this will not be reconstructed correctly from buffer
    original_vkey.pcs_verification_key = nullptr;

    // Populate some non-zero values in the databus_propagation_data to ensure its being handled
    if constexpr (IsMegaBuilder<Builder>) {
        original_vkey.databus_propagation_data.app_return_data_public_input_idx = 2;
        original_vkey.databus_propagation_data.kernel_return_data_public_input_idx = 4;
        original_vkey.databus_propagation_data.is_kernel = 1;
    }

    // Serialize and deserialize the verification key
    std::vector<uint8_t> vkey_buffer = to_buffer(original_vkey);
    VerificationKey deserialized_vkey = from_buffer<VerificationKey>(vkey_buffer);

    // Ensure the original is equal to the reconstructed
    EXPECT_EQ(original_vkey, deserialized_vkey);
}
