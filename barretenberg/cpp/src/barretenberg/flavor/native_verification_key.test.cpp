#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"

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

    void set_default_pairing_points_and_ipa_claim_and_proof(typename Flavor::CircuitBuilder& builder)
    {
        stdlib::recursion::PairingPoints<typename Flavor::CircuitBuilder>::add_default_to_public_inputs(builder);
        if constexpr (HasIPAAccumulator<Flavor>) {
            auto [stdlib_opening_claim, ipa_proof] =
                IPA<stdlib::grumpkin<typename Flavor::CircuitBuilder>>::create_fake_ipa_claim_and_proof(builder);
            stdlib_opening_claim.set_public();
            builder.ipa_proof = ipa_proof;
        }
    }

    VerificationKey create_vk()
    {
        if constexpr (IsUltraOrMegaHonk<Flavor>) {
            using DeciderProvingKey = DeciderProvingKey_<Flavor>;
            Builder builder;
            set_default_pairing_points_and_ipa_claim_and_proof(builder);
            auto proving_key = std::make_shared<DeciderProvingKey>(builder);
            return VerificationKey{ proving_key->get_precomputed() };
        } else {
            return VerificationKey();
        }
    }

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};
TYPED_TEST_SUITE(NativeVerificationKeyTests, FlavorTypes);

/**
 * @brief Checks that the hash produced from calling to_field_elements and then add_to_independent_hash_buffer is the
 * same as the hash() call and also the same as the add_hash_to_transcript.
 *
 */
TYPED_TEST(NativeVerificationKeyTests, VKHashingConsistency)
{
    using Flavor = TypeParam;
    using VerificationKey = typename Flavor::VerificationKey;

    VerificationKey vk(TestFixture::create_vk());

    // First method of hashing: using to_field_elements and add_to_hash_buffer.
    std::vector<fr> vk_field_elements = vk.to_field_elements();
    NativeTranscript transcript;
    for (const auto& field_element : vk_field_elements) {
        transcript.add_to_independent_hash_buffer("vk_element", field_element);
    }
    fr vkey_hash_1 = transcript.hash_independent_buffer("vk_hash");
    // Second method of hashing: using hash().
    fr vkey_hash_2 = vk.hash();
    EXPECT_EQ(vkey_hash_1, vkey_hash_2);
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1427): Solidity verifier does not fiat shamir the full
    // verification key. This will be fixed in a followup PR.
    if constexpr (!IsAnyOf<Flavor, UltraKeccakFlavor>) {
        // Third method of hashing: using add_hash_to_transcript.
        typename Flavor::Transcript transcript_2;
        fr vkey_hash_3 = vk.add_hash_to_transcript("", transcript_2);
        EXPECT_EQ(vkey_hash_2, vkey_hash_3);
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
    EXPECT_EQ(vk.to_field_elements().size(), VerificationKey::VERIFICATION_KEY_LENGTH);
}
