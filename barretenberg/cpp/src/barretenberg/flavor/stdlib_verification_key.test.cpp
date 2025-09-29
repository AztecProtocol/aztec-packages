#include "barretenberg/eccvm/eccvm_circuit_builder.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/eccvm_verifier/eccvm_recursive_flavor.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/translator_vm_verifier/translator_recursive_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

#include <gtest/gtest.h>

using namespace bb;

template <typename Flavor> class StdlibVerificationKeyTests : public ::testing::Test {
  public:
    using NativeFlavor = typename Flavor::NativeFlavor;
    void set_default_pairing_points_and_ipa_claim_and_proof(typename NativeFlavor::CircuitBuilder& builder)
    {
        stdlib::recursion::PairingPoints<typename NativeFlavor::CircuitBuilder>::add_default_to_public_inputs(builder);
        if constexpr (HasIPAAccumulator<NativeFlavor>) {
            auto [stdlib_opening_claim, ipa_proof] =
                IPA<stdlib::grumpkin<typename NativeFlavor::CircuitBuilder>>::create_random_valid_ipa_claim_and_proof(
                    builder);
            stdlib_opening_claim.set_public();
            builder.ipa_proof = ipa_proof;
        }
    }

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using FlavorTypes = testing::Types<UltraRecursiveFlavor_<UltraCircuitBuilder>,
                                   UltraRecursiveFlavor_<MegaCircuitBuilder>,
                                   UltraRollupRecursiveFlavor_<UltraCircuitBuilder>,
                                   MegaRecursiveFlavor_<MegaCircuitBuilder>,
                                   ECCVMRecursiveFlavor,
                                   TranslatorRecursiveFlavor>;
TYPED_TEST_SUITE(StdlibVerificationKeyTests, FlavorTypes);

/**
 * @brief Checks that the hash produced from calling to_field_elements and then add_to_independent_hash_buffer is the
 * same as the hash() call and also the same as the hash_through_transcript.
 *
 */
TYPED_TEST(StdlibVerificationKeyTests, VKHashingConsistency)
{
    using Flavor = TypeParam;
    using NativeFlavor = typename Flavor::NativeFlavor;
    using NativeVerificationKey = typename NativeFlavor::VerificationKey;
    using StdlibTranscript = typename Flavor::Transcript;
    using StdlibVerificationKey = typename Flavor::VerificationKey;
    using OuterBuilder = typename Flavor::CircuitBuilder;
    using FF = stdlib::field_t<OuterBuilder>;

    // Create random circuit to create a vk.
    std::shared_ptr<NativeVerificationKey> native_vk;
    if constexpr (IsAnyOf<Flavor, TranslatorRecursiveFlavor, ECCVMRecursiveFlavor>) {
        native_vk = std::make_shared<NativeVerificationKey>();
    } else {
        using ProverInstance = ProverInstance_<NativeFlavor>;
        using InnerBuilder = typename NativeFlavor::CircuitBuilder;

        InnerBuilder builder;
        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
        auto prover_instance = std::make_shared<ProverInstance>(builder);
        native_vk = std::make_shared<NativeVerificationKey>(prover_instance->get_precomputed());
    }

    OuterBuilder outer_builder;
    StdlibVerificationKey vk(&outer_builder, native_vk);

    // First method of hashing: using to_field_elements and add_to_hash_buffer.
    std::vector<FF> vk_field_elements = vk.to_field_elements();
    StdlibTranscript transcript;
    for (const auto& field_element : vk_field_elements) {
        transcript.add_to_independent_hash_buffer("vk_element", field_element);
    }
    FF vk_hash_1 = transcript.hash_independent_buffer();
    // Second method of hashing: using hash().
    FF vk_hash_2 = vk.hash();
    EXPECT_EQ(vk_hash_1.get_value(), vk_hash_2.get_value());
    // Third method of hashing: using hash_through_transcript.
    if constexpr (!IsAnyOf<Flavor, TranslatorRecursiveFlavor, ECCVMRecursiveFlavor>) {
        StdlibTranscript transcript_2;
        FF vk_hash_3 = vk.hash_through_transcript("", transcript_2);
        EXPECT_EQ(vk_hash_2.get_value(), vk_hash_3.get_value());
    }
}
