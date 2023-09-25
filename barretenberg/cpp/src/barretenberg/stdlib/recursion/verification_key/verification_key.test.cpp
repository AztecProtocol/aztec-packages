#include "verification_key.hpp"

#include "barretenberg/common/test.hpp"
#include "barretenberg/plonk/proof_system/verification_key/verification_key.hpp"
#include "barretenberg/proof_system/circuit_builder/standard_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"

namespace {
auto& engine = numeric::random::get_debug_engine();
} // namespace

using namespace proof_system::plonk;

/**
 * @brief A test fixture that will let us generate VK data and run tests
 * for all builder types
 *
 * @tparam Builder
 */
template <typename Builder> class VerificationKeyFixture : public testing::Test {
  public:
    using Curve = proof_system::plonk::stdlib::bn254<Builder>;
    using RecursVk = proof_system::plonk::stdlib::recursion::verification_key<Curve>;

    static void SetUpTestSuite() { barretenberg::srs::init_crs_factory("../srs_db/ignition"); }

    /**
     * @brief generate a random vk data for use in tests
     *
     * @return verification_key_data randomly generatedv
     */
    static verification_key_data rand_vk_data()
    {
        verification_key_data vk_data;
        vk_data.circuit_type = static_cast<uint32_t>(Builder::CIRCUIT_TYPE);
        vk_data.circuit_size = 1024; // not random - must be power of 2
        vk_data.num_public_inputs = engine.get_random_uint32();
        vk_data.commitments["test1"] = g1::element::random_element();
        vk_data.commitments["test2"] = g1::element::random_element();
        vk_data.commitments["foo1"] = g1::element::random_element();
        vk_data.commitments["foo2"] = g1::element::random_element();
        return vk_data;
    }
};

using CircuitTypes = testing::Types<proof_system::StandardCircuitBuilder, proof_system::UltraCircuitBuilder>;
TYPED_TEST_SUITE(VerificationKeyFixture, CircuitTypes);

TYPED_TEST(VerificationKeyFixture, vk_data_vs_recursion_compress_native)
{
    using RecursVk = typename TestFixture::RecursVk;
    TypeParam builder;

    verification_key_data vk_data = TestFixture::rand_vk_data();
    verification_key_data vk_data_copy = vk_data;

    auto file_crs = std::make_unique<barretenberg::srs::factories::FileCrsFactory<curve::BN254>>("../srs_db/ignition");
    auto file_verifier = file_crs->get_verifier_crs();

    auto native_vk = std::make_shared<verification_key>(std::move(vk_data_copy), file_verifier);
    auto recurs_vk = RecursVk::from_witness(&builder, native_vk);

    EXPECT_EQ(vk_data.compress_native(0), RecursVk::compress_native(native_vk, 0));
    // EXPECT_EQ(vk_data.compress_native(15), RecursVk::compress_native(native_vk, 15));
    // // ne hash indeces still lead to ne compressions
    // EXPECT_NE(vk_data.compress_native(0), RecursVk::compress_native(native_vk, 15));
    // EXPECT_NE(vk_data.compress_native(14), RecursVk::compress_native(native_vk, 15));
}

TYPED_TEST(VerificationKeyFixture, compress_vs_compress_native)
{
    using RecursVk = typename TestFixture::RecursVk;
    TypeParam builder;

    verification_key_data vk_data = TestFixture::rand_vk_data();

    auto file_crs = std::make_unique<barretenberg::srs::factories::FileCrsFactory<curve::BN254>>("../srs_db/ignition");
    auto file_verifier = file_crs->get_verifier_crs();

    auto native_vk = std::make_shared<verification_key>(std::move(vk_data), file_verifier);
    auto recurs_vk = RecursVk::from_witness(&builder, native_vk);

    EXPECT_EQ(recurs_vk->compress(0).get_value(), RecursVk::compress_native(native_vk, 0));
    // EXPECT_EQ(recurs_vk->compress(15).get_value(), RecursVk::compress_native(native_vk, 15));
    // // ne hash indeces still lead to ne compressions
    // EXPECT_NE(recurs_vk->compress(0).get_value(), RecursVk::compress_native(native_vk, 15));
    // EXPECT_NE(recurs_vk->compress(14).get_value(), RecursVk::compress_native(native_vk, 15));
}
