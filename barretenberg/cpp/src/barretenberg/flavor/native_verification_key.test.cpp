#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

#include <gtest/gtest.h>

using namespace bb;

#ifdef STARKNET_GARAGA_FLAVORS
using FlavorTypes = testing::Types<UltraFlavor,
                                   UltraKeccakFlavor,
                                   UltraRollupFlavor,
                                   UltraStarknetFlavor,
                                   MegaFlavor,
                                   ECCVMFlavor,
                                   TranslatorFlavor>;
#else
using FlavorTypes =
    testing::Types<UltraFlavor, UltraKeccakFlavor, UltraRollupFlavor, MegaFlavor, ECCVMFlavor, TranslatorFlavor>;
#endif

template <typename Flavor> class NativeVerificationKeyTests : public ::testing::Test {
  public:
    using Builder = typename Flavor::CircuitBuilder;
    using VerificationKey = typename Flavor::VerificationKey;

    VerificationKey create_vk()
    {
        if constexpr (IsUltraOrMegaHonk<Flavor>) {
            using ProverInstance = ProverInstance_<Flavor>;
            Builder builder;
            if constexpr (HasIPAAccumulator<Flavor>) {
                stdlib::recursion::honk::RollupIO::add_default(builder);
            } else {
                stdlib::recursion::honk::DefaultIO<typename Flavor::CircuitBuilder>::add_default(builder);
            }
            auto prover_instance = std::make_shared<ProverInstance>(builder);
            return VerificationKey{ prover_instance->get_precomputed() };
        } else {
            return VerificationKey();
        }
    }

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};
TYPED_TEST_SUITE(NativeVerificationKeyTests, FlavorTypes);

/**
 * @brief Checks that the hash produced from calling hash() is the same as hash_with_origin_tagging().
 *
 */
TYPED_TEST(NativeVerificationKeyTests, VKHashingConsistency)
{
    using Flavor = TypeParam;
    using VerificationKey = typename Flavor::VerificationKey;

    VerificationKey vk(TestFixture::create_vk());

    // First method of hashing: using hash().
    fr vk_hash_1 = vk.hash();

    // Second method of hashing: using hash_with_origin_tagging.
    // (ECCVM and Translator flavors don't support hash_with_origin_tagging as their VKs are hardcoded)
    if constexpr (!IsAnyOf<Flavor, ECCVMFlavor, TranslatorFlavor>) {
        typename Flavor::Transcript transcript;
        fr vk_hash_2 = vk.hash_with_origin_tagging("", transcript);
        EXPECT_EQ(vk_hash_1, vk_hash_2);
    }
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
    using Flavor = TypeParam;
    using VerificationKey = typename Flavor::VerificationKey;

    VerificationKey vk(TestFixture::create_vk());
    EXPECT_EQ(vk.to_field_elements().size(), VerificationKey::calc_num_data_types());
}
