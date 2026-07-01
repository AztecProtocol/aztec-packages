#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

#include <gtest/gtest.h>

using namespace bb;

// Test parameters: <Flavor, IO>
template <typename Flavor_, typename IO_> struct VKTestParams {
    using Flavor = Flavor_;
    using IO = IO_;
};

#ifdef STARKNET_GARAGA_FLAVORS
using TestTypes =
    testing::Types<VKTestParams<UltraFlavor, stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>,
                   VKTestParams<UltraFlavor, stdlib::recursion::honk::RollupIO>,
                   VKTestParams<UltraKeccakFlavor, stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>,
                   VKTestParams<UltraStarknetFlavor, stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>,
                   VKTestParams<MegaFlavor, stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>>;
#else
using TestTypes =
    testing::Types<VKTestParams<UltraFlavor, stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>,
                   VKTestParams<UltraFlavor, stdlib::recursion::honk::RollupIO>,
                   VKTestParams<UltraKeccakFlavor, stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>,
                   VKTestParams<MegaFlavor, stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>>;
#endif

template <typename Params> class NativeVerificationKeyTests : public ::testing::Test {
  public:
    using Flavor = typename Params::Flavor;
    using IO = typename Params::IO;
    using Builder = typename Flavor::CircuitBuilder;
    using VerificationKey = typename Flavor::VerificationKey;

    VerificationKey create_vk()
    {
        using ProverInstance = ProverInstance_<Flavor>;
        Builder builder;
        IO::add_default(builder);
        auto prover_instance = std::make_shared<ProverInstance>(builder);
        return VerificationKey{ prover_instance->get_precomputed() };
    }

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};
TYPED_TEST_SUITE(NativeVerificationKeyTests, TestTypes);

/**
 * @brief Checks that the hash produced from calling hash() is the same as hash_with_origin_tagging().
 *
 */
TYPED_TEST(NativeVerificationKeyTests, VKHashingConsistency)
{
    using Flavor = typename TypeParam::Flavor;
    using VerificationKey = typename Flavor::VerificationKey;

    VerificationKey vk(TestFixture::create_vk());

    // First method of hashing: using hash().
    fr vk_hash_1 = vk.hash();

    // Second method of hashing: using hash_with_origin_tagging.
    typename Flavor::Transcript transcript;
    fr vk_hash_2 = vk.hash_with_origin_tagging(transcript);
    EXPECT_EQ(vk_hash_1, vk_hash_2);
}

/**
 * @brief Check that size of a ultra honk proof matches the corresponding constant
 * @details If this test FAILS, then the following (non-exhaustive) list should probably be updated as well:
 * - VK length formula in ultra_flavor.hpp, mega_flavor.hpp, etc...
 * - ultra_transcript.test.cpp
 * - constants in yarn-project in: constants.nr, constants.gen.ts, ConstantsGen.sol, lib.nr in
 * bb_proof_verification/src, main.nr of recursive acir_tests programs. with recursive verification circuits
 */
TYPED_TEST(NativeVerificationKeyTests, VKSizeCheck)
{
    using Flavor = typename TypeParam::Flavor;
    using VerificationKey = typename Flavor::VerificationKey;

    VerificationKey vk(TestFixture::create_vk());
    EXPECT_EQ(vk.to_field_elements().size(), VerificationKey::calc_num_data_types());
}

// from_field_elements must require an exact field count, not just enough fields.
TYPED_TEST(NativeVerificationKeyTests, FromFieldElementsRejectsWrongSize)
{
    using Flavor = typename TypeParam::Flavor;
    using VerificationKey = typename Flavor::VerificationKey;

    VerificationKey vk(TestFixture::create_vk());
    const auto fields = vk.to_field_elements();

    VerificationKey roundtrip;
    EXPECT_NO_THROW(roundtrip.from_field_elements(fields));

    auto oversize = fields;
    oversize.push_back(fields.back());
    VerificationKey bad;
    EXPECT_ANY_THROW(bad.from_field_elements(oversize));
}
