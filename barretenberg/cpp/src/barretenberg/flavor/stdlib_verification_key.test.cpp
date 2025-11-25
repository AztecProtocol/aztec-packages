#include "barretenberg/eccvm/eccvm_circuit_builder.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/eccvm_verifier/eccvm_recursive_flavor.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib/translator_vm_verifier/translator_recursive_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

#include <gtest/gtest.h>

using namespace bb;

template <typename Flavor> class StdlibVerificationKeyTests : public ::testing::Test {
  public:
    using NativeFlavor = typename Flavor::NativeFlavor;

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
 * @brief Checks that the hash produced from calling hash() is the same as hash_with_origin_tagging().
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
        if constexpr (HasIPAAccumulator<NativeFlavor>) {
            stdlib::recursion::honk::RollupIO::add_default(builder);
        } else {
            stdlib::recursion::honk::DefaultIO<typename NativeFlavor::CircuitBuilder>::add_default(builder);
        }
        auto prover_instance = std::make_shared<ProverInstance>(builder);
        native_vk = std::make_shared<NativeVerificationKey>(prover_instance->get_precomputed());
    }

    OuterBuilder outer_builder;
    StdlibVerificationKey vk(&outer_builder, native_vk);

    // First method of hashing: using hash().
    FF vk_hash_1 = vk.hash();

    // Second method of hashing: using hash_with_origin_tagging.
    // (ECCVM and Translator recursive flavors don't support hash_with_origin_tagging as their VKs are hardcoded)
    if constexpr (!IsAnyOf<Flavor, TranslatorRecursiveFlavor, ECCVMRecursiveFlavor>) {
        StdlibTranscript transcript;
        FF vk_hash_2 = vk.hash_with_origin_tagging("", transcript);
        EXPECT_EQ(vk_hash_1.get_value(), vk_hash_2.get_value());
    }
}
