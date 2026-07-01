#include "barretenberg/eccvm/eccvm_circuit_builder.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/primitives/field/field_conversion.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

#include <gtest/gtest.h>

using namespace bb;

namespace {
/**
 * @brief Test helper: Serialize stdlib VK to field elements and hash with poseidon2.
 * @details This replicates the removed StdlibVerificationKey_::hash() method for testing purposes.
 */
template <typename VK> auto compute_stdlib_vk_hash(const VK& vk)
{
    using FF = typename VK::FF;
    using Builder = typename VK::Builder;
    using Codec = stdlib::StdlibCodec<FF>;

    auto serialize_to_field_buffer = []<typename T>(const T& input, std::vector<FF>& buffer) {
        std::vector<FF> input_fields = Codec::template serialize_to_fields<T>(input);
        buffer.insert(buffer.end(), input_fields.begin(), input_fields.end());
    };

    std::vector<FF> elements;
    serialize_to_field_buffer(vk.log_circuit_size, elements);
    serialize_to_field_buffer(vk.num_public_inputs, elements);
    serialize_to_field_buffer(vk.pub_inputs_offset, elements);

    for (const auto& commitment : vk.get_all()) {
        serialize_to_field_buffer(commitment, elements);
    }

    return stdlib::poseidon2<Builder>::hash(elements);
}
} // namespace

template <typename Flavor> class StdlibVerificationKeyTests : public ::testing::Test {
  public:
    using NativeFlavor = typename Flavor::NativeFlavor;

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using FlavorTypes = testing::Types<UltraRecursiveFlavor_<UltraCircuitBuilder>,
                                   UltraRecursiveFlavor_<MegaCircuitBuilder>,
                                   MegaRecursiveFlavor_<MegaCircuitBuilder>>;
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
    using ProverInstance = ProverInstance_<NativeFlavor>;
    using InnerBuilder = typename NativeFlavor::CircuitBuilder;

    InnerBuilder builder;
    stdlib::recursion::honk::DefaultIO<typename NativeFlavor::CircuitBuilder>::add_default(builder);
    auto prover_instance = std::make_shared<ProverInstance>(builder);
    native_vk = std::make_shared<NativeVerificationKey>(prover_instance->get_precomputed());

    OuterBuilder outer_builder;
    StdlibVerificationKey vk(&outer_builder, native_vk);

    // First method of hashing: serialize to fields and hash with poseidon2.
    FF vk_hash_1 = compute_stdlib_vk_hash(vk);

    // Second method of hashing: using hash_with_origin_tagging.
    StdlibTranscript transcript;
    FF vk_hash_2 = vk.hash_with_origin_tagging(transcript);
    EXPECT_EQ(vk_hash_1.get_value(), vk_hash_2.get_value());
}

// The span constructor must require an exact field count, not just enough fields.
TYPED_TEST(StdlibVerificationKeyTests, SpanConstructorRejectsWrongSize)
{
    using Flavor = TypeParam;
    using NativeFlavor = typename Flavor::NativeFlavor;
    using NativeVerificationKey = typename NativeFlavor::VerificationKey;
    using StdlibVerificationKey = typename Flavor::VerificationKey;
    using OuterBuilder = typename Flavor::CircuitBuilder;
    using FF = stdlib::field_t<OuterBuilder>;
    using Codec = stdlib::StdlibCodec<FF>;
    using ProverInstance = ProverInstance_<NativeFlavor>;
    using InnerBuilder = typename NativeFlavor::CircuitBuilder;

    InnerBuilder builder;
    stdlib::recursion::honk::DefaultIO<InnerBuilder>::add_default(builder);
    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto native_vk = std::make_shared<NativeVerificationKey>(prover_instance->get_precomputed());

    OuterBuilder outer_builder;
    StdlibVerificationKey vk(&outer_builder, native_vk);

    std::vector<FF> fields;
    auto append = [&]<typename T>(const T& input) {
        std::vector<FF> input_fields = Codec::template serialize_to_fields<T>(input);
        fields.insert(fields.end(), input_fields.begin(), input_fields.end());
    };
    append(vk.log_circuit_size);
    append(vk.num_public_inputs);
    append(vk.pub_inputs_offset);
    for (const auto& commitment : vk.get_all()) {
        append(commitment);
    }

    EXPECT_NO_THROW(StdlibVerificationKey{ std::span<FF>(fields) });

    std::vector<FF> oversize = fields;
    oversize.push_back(fields.back());
    EXPECT_ANY_THROW(StdlibVerificationKey{ std::span<FF>(oversize) });
}
