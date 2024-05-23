#include <gtest/gtest.h>
namespace bb {
template <typename RecursiveFlavor> class ECCVMRecursiveTests : public ::testing::Test {
  public:
    using InnerFlavor = typename RecursiveFlavor::NativeFlavor;
    using InnerBuilder = typename InnerFlavor::CircuitBuilder;
    using InnerProver = ECCVMProver;
    using InnerVerifier = ECCVMVerifier;
    using InnerG1 = InnerFlavor::Commitment;
    using InnerFF = InnerFlavor::FF;
    using InnerBF = InnerFlavor::BF;

    using RecursiveVerifier = ECCVMRecursiveVerifier_<RecursiveFlavor>;

    using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;
    using OuterFlavor = std::conditional_t<IsGoblinUltraBuilder<OuterBuilder>, GoblinUltraFlavor, UltraFlavor>;
    using OuterProver = UltraProver_<OuterFlavor>;
    using OuterVerifier = UltraVerifier_<OuterFlavor>;
    using OuterProverInstance = ProverInstance_<OuterFlavor>;
    static void SetUpTestSuite() { srs::init_grumpkin_crs_factory("../srs_db/grumpkin"); }
    static void test_recursive_verification() {}
}
} // namespace bb