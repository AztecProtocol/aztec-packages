
#include "barretenberg/stdlib/eccvm_verifier/verifier_commitment_key.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include <gtest/gtest.h>
namespace bb {
template <typename Curve> class RecursiveVeriferCommitmentKeyTest : public testing::Test {
  public:
    using Builder = typename Curve::Builder;
    using NativeEmbeddedCurve = Builder::EmbeddedCurve;
    using native_VK = VerifierCommitmentKey<NativeEmbeddedCurve>;
    using VK = VerifierCommitmentKey<Curve>;
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    /**
     * @brief Instantiante a recursive verifier commitment key from a Grumpkin native key and check consistency.
     *
     */
    static void test_equality()
    {
        size_t num_points = 4096;
        Builder builder;
        native_VK native_vk(num_points);
        VK recursive_vk(&builder, num_points, native_vk);
        EXPECT_EQ(native_vk.get_g1_identity(), recursive_vk.get_g1_identity().get_value());
        auto native_monomial_points = native_vk.get_monomial_points();
        auto recursive_monomial_points = recursive_vk.get_monomial_points();

        // The recursive verifier commitment key only stores the SRS so we verify against the even indices of the native
        // key
        for (size_t i = 0; i < num_points; i += 1) {
            EXPECT_EQ(native_monomial_points[i], recursive_monomial_points[i].get_value());
        }
    }
};

using Curves = testing::Types<stdlib::grumpkin<UltraCircuitBuilder>, stdlib::grumpkin<MegaCircuitBuilder>>;

TYPED_TEST_SUITE(RecursiveVeriferCommitmentKeyTest, Curves);

TYPED_TEST(RecursiveVeriferCommitmentKeyTest, EqualityTest)
{
    TestFixture::test_equality();
};
} // namespace bb
