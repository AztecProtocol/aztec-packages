#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"

#include <gtest/gtest.h>

using namespace bb;

template <typename Flavor> class NativeVerificationKeyTests : public ::testing::Test {
  public:
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

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

#ifdef STARKNET_GARAGA_FLAVORS
using FlavorTypes = testing::Types<UltraFlavor, UltraKeccakFlavor, UltraRollupFlavor, UltraStarknetFlavor, MegaFlavor>;
#else
using FlavorTypes = testing::Types<UltraFlavor, UltraKeccakFlavor, UltraRollupFlavor, MegaFlavor>;
#endif
TYPED_TEST_SUITE(NativeVerificationKeyTests, FlavorTypes);

/**
 * @brief Checks that the hash produced from calling to_field_elements and then add_to_hash_buffer is the same as the
 * hash() call and also the same as the add_to_transcript.
 *
 */
TYPED_TEST(NativeVerificationKeyTests, VKHashingConsistency)
{
    using Flavor = TypeParam;
    using Builder = typename Flavor::CircuitBuilder;
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;

    // Create random circuit to create a vk.
    Builder builder;
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    auto proving_key = std::make_shared<DeciderProvingKey>(builder);
    VerificationKey vk{ proving_key->proving_key };

    // First method of hashing: using to_field_elements and add_to_hash_buffer.
    std::vector<fr> vk_field_elements = vk.to_field_elements();
    NativeTranscript transcript;
    for (const auto& field_element : vk_field_elements) {
        transcript.add_to_hash_buffer("vk_element", field_element);
    }
    fr vkey_hash_1 = transcript.get_challenge<fr>("vk_hash");
    // Second method of hashing: using hash().
    fr vkey_hash_2 = vk.hash();
    EXPECT_EQ(vkey_hash_1, vkey_hash_2);
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1427): Solidity verifier does not fiat shamir the full
    // verification key. This will be fixed in a followup PR.
    if constexpr (!IsAnyOf<Flavor, UltraKeccakFlavor>) {
        // Third method of hashing: using add_to_transcript.
        typename Flavor::Transcript transcript_2;
        vk.add_to_transcript("", transcript_2);
        fr vkey_hash_3 = transcript_2.template get_challenge<fr>("vk_hash");
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
    using Builder = typename Flavor::CircuitBuilder;

    Builder builder;
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    // Construct a UH proof and ensure its size matches expectation; if not, the constant may need to be updated
    auto proving_key = std::make_shared<DeciderProvingKey_<Flavor>>(builder);
    typename Flavor::VerificationKey verification_key(proving_key->proving_key);
    EXPECT_EQ(verification_key.to_field_elements().size(), Flavor::VerificationKey::VERIFICATION_KEY_LENGTH);
}
