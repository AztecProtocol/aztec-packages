#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "failure_test_utils.hpp"
#include "ultra_honk.test.hpp"

using namespace bb;

#ifdef STARKNET_GARAGA_FLAVORS
using FlavorTypes = testing::Types<UltraFlavor,
                                   UltraZKFlavor,
                                   UltraKeccakFlavor,
                                   UltraKeccakZKFlavor,
                                   UltraRollupFlavor,
                                   UltraStarknetFlavor,
                                   UltraStarknetZKFlavor>;
#else
using FlavorTypes =
    testing::Types<UltraFlavor, UltraZKFlavor, UltraKeccakFlavor, UltraKeccakZKFlavor, UltraRollupFlavor>;
#endif
template <typename T> using RangeTests = UltraHonkTests<T>;
TYPED_TEST_SUITE(RangeTests, FlavorTypes);
using NonZKFlavorTypes = testing::Types<UltraFlavor, UltraKeccakFlavor, UltraRollupFlavor>;
template <typename T> using RangeNonZKTests = UltraHonkTests<T>;
TYPED_TEST_SUITE(RangeNonZKTests, NonZKFlavorTypes);
TYPED_TEST(RangeTests, SortWidget)
{
    auto circuit_builder = UltraCircuitBuilder();
    fr a = fr::one();
    fr b = fr(2);
    fr c = fr(3);
    fr d = fr(4);

    auto a_idx = circuit_builder.add_variable(a);
    auto b_idx = circuit_builder.add_variable(b);
    auto c_idx = circuit_builder.add_variable(c);
    auto d_idx = circuit_builder.add_variable(d);
    circuit_builder.enforce_small_deltas({ a_idx, b_idx, c_idx, d_idx });

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

TYPED_TEST(RangeTests, SortWithEdgesGate)
{
    fr a = fr::one();
    fr b = fr(2);
    fr c = fr(3);
    fr d = fr(4);
    fr e = fr(5);
    fr f = fr(6);
    fr g = fr(7);
    fr h = fr(8);

    {
        auto circuit_builder = UltraCircuitBuilder();
        auto a_idx = circuit_builder.add_variable(a);
        auto b_idx = circuit_builder.add_variable(b);
        auto c_idx = circuit_builder.add_variable(c);
        auto d_idx = circuit_builder.add_variable(d);
        auto e_idx = circuit_builder.add_variable(e);
        auto f_idx = circuit_builder.add_variable(f);
        auto g_idx = circuit_builder.add_variable(g);
        auto h_idx = circuit_builder.add_variable(h);
        circuit_builder.create_sort_constraint_with_edges(
            { a_idx, b_idx, c_idx, d_idx, e_idx, f_idx, g_idx, h_idx }, a, h);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
    }

    {
        auto circuit_builder = UltraCircuitBuilder();
        auto a_idx = circuit_builder.add_variable(a);
        auto b_idx = circuit_builder.add_variable(b);
        auto c_idx = circuit_builder.add_variable(c);
        auto d_idx = circuit_builder.add_variable(d);
        auto e_idx = circuit_builder.add_variable(e);
        auto f_idx = circuit_builder.add_variable(f);
        auto g_idx = circuit_builder.add_variable(g);
        auto h_idx = circuit_builder.add_variable(h);
        circuit_builder.create_sort_constraint_with_edges(
            { a_idx, b_idx, c_idx, d_idx, e_idx, f_idx, g_idx, h_idx }, a, g);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
    }
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto a_idx = circuit_builder.add_variable(a);
        auto b_idx = circuit_builder.add_variable(b);
        auto c_idx = circuit_builder.add_variable(c);
        auto d_idx = circuit_builder.add_variable(d);
        auto e_idx = circuit_builder.add_variable(e);
        auto f_idx = circuit_builder.add_variable(f);
        auto g_idx = circuit_builder.add_variable(g);
        auto h_idx = circuit_builder.add_variable(h);
        circuit_builder.create_sort_constraint_with_edges(
            { a_idx, b_idx, c_idx, d_idx, e_idx, f_idx, g_idx, h_idx }, b, h);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
    }
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto a_idx = circuit_builder.add_variable(a);
        auto c_idx = circuit_builder.add_variable(c);
        auto d_idx = circuit_builder.add_variable(d);
        auto e_idx = circuit_builder.add_variable(e);
        auto f_idx = circuit_builder.add_variable(f);
        auto g_idx = circuit_builder.add_variable(g);
        auto h_idx = circuit_builder.add_variable(h);
        auto b2_idx = circuit_builder.add_variable(fr(15));
        circuit_builder.create_sort_constraint_with_edges(
            { a_idx, b2_idx, c_idx, d_idx, e_idx, f_idx, g_idx, h_idx }, b, h);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
    }
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto idx =
            TestFixture::add_variables(circuit_builder, { 1,  2,  5,  6,  7,  10, 11, 13, 16, 17, 20, 22, 22, 25,
                                                          26, 29, 29, 32, 32, 33, 35, 38, 39, 39, 42, 42, 43, 45 });
        circuit_builder.create_sort_constraint_with_edges(idx, 1, 45);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
    }
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto idx =
            TestFixture::add_variables(circuit_builder, { 1,  2,  5,  6,  7,  10, 11, 13, 16, 17, 20, 22, 22, 25,
                                                          26, 29, 29, 32, 32, 33, 35, 38, 39, 39, 42, 42, 43, 45 });
        circuit_builder.create_sort_constraint_with_edges(idx, 1, 29);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
    }
}

TYPED_TEST(RangeTests, RangeConstraint)
{
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto indices = TestFixture::add_variables(circuit_builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
        for (size_t i = 0; i < indices.size(); i++) {
            circuit_builder.create_small_range_constraint(indices[i], 8);
        }
        // auto ind = {a_idx,b_idx,c_idx,d_idx,e_idx,f_idx,g_idx,h_idx};
        circuit_builder.enforce_small_deltas(indices);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
    }
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto indices = TestFixture::add_variables(circuit_builder, { 3 });
        for (size_t i = 0; i < indices.size(); i++) {
            circuit_builder.create_small_range_constraint(indices[i], 3);
        }
        // auto ind = {a_idx,b_idx,c_idx,d_idx,e_idx,f_idx,g_idx,h_idx};
        circuit_builder.create_unconstrained_gates(indices);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
    }
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto indices = TestFixture::add_variables(circuit_builder, { 1, 2, 3, 4, 5, 6, 8, 25 });
        for (size_t i = 0; i < indices.size(); i++) {
            circuit_builder.create_small_range_constraint(indices[i], 8);
        }
        circuit_builder.enforce_small_deltas(indices);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
    }
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto indices = TestFixture::add_variables(
            circuit_builder, { 1, 2, 3, 4, 5, 6, 10, 8, 15, 11, 32, 21, 42, 79, 16, 10, 3, 26, 19, 51 });
        for (size_t i = 0; i < indices.size(); i++) {
            circuit_builder.create_small_range_constraint(indices[i], 128);
        }
        circuit_builder.create_unconstrained_gates(indices);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
    }
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto indices = TestFixture::add_variables(
            circuit_builder, { 1, 2, 3, 80, 5, 6, 29, 8, 15, 11, 32, 21, 42, 79, 16, 10, 3, 26, 13, 14 });
        for (size_t i = 0; i < indices.size(); i++) {
            circuit_builder.create_small_range_constraint(indices[i], 79);
        }
        circuit_builder.create_unconstrained_gates(indices);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
    }
    {
        auto circuit_builder = UltraCircuitBuilder();
        auto indices = TestFixture::add_variables(
            circuit_builder, { 1, 0, 3, 80, 5, 6, 29, 8, 15, 11, 32, 21, 42, 79, 16, 10, 3, 26, 13, 14 });
        for (size_t i = 0; i < indices.size(); i++) {
            circuit_builder.create_small_range_constraint(indices[i], 79);
        }
        circuit_builder.create_unconstrained_gates(indices);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
    }
}

TYPED_TEST(RangeTests, RangeWithGates)
{
    auto circuit_builder = UltraCircuitBuilder();
    auto idx = TestFixture::add_variables(circuit_builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
    for (size_t i = 0; i < idx.size(); i++) {
        circuit_builder.create_small_range_constraint(idx[i], 8);
    }

    circuit_builder.create_add_gate(
        { idx[0], idx[1], circuit_builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -3 });
    circuit_builder.create_add_gate(
        { idx[2], idx[3], circuit_builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -7 });
    circuit_builder.create_add_gate(
        { idx[4], idx[5], circuit_builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -11 });
    circuit_builder.create_add_gate(
        { idx[6], idx[7], circuit_builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -15 });

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

TYPED_TEST(RangeTests, RangeWithGatesWhereRangeIsNotAPowerOfTwo)
{
    auto circuit_builder = UltraCircuitBuilder();
    auto idx = TestFixture::add_variables(circuit_builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
    for (size_t i = 0; i < idx.size(); i++) {
        circuit_builder.create_small_range_constraint(idx[i], 12);
    }

    circuit_builder.create_add_gate(
        { idx[0], idx[1], circuit_builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -3 });
    circuit_builder.create_add_gate(
        { idx[2], idx[3], circuit_builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -7 });
    circuit_builder.create_add_gate(
        { idx[4], idx[5], circuit_builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -11 });
    circuit_builder.create_add_gate(
        { idx[6], idx[7], circuit_builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -15 });

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

TYPED_TEST(RangeTests, SortWidgetComplex)
{
    {

        auto circuit_builder = UltraCircuitBuilder();
        std::vector<fr> a = { 1, 3, 4, 7, 7, 8, 11, 14, 15, 15, 18, 19, 21, 21, 24, 25, 26, 27, 30, 32 };
        std::vector<uint32_t> ind;
        for (const fr& val : a)
            ind.emplace_back(circuit_builder.add_variable(val));
        circuit_builder.enforce_small_deltas(ind);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
    }
    {

        auto circuit_builder = UltraCircuitBuilder();
        std::vector<fr> a = { 1, 3, 4, 7, 7, 8, 16, 14, 15, 15, 18, 19, 21, 21, 24, 25, 26, 27, 30, 32 };
        std::vector<uint32_t> ind;
        for (const fr& val : a)
            ind.emplace_back(circuit_builder.add_variable(val));
        circuit_builder.enforce_small_deltas(ind);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

        TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
    }
}

TYPED_TEST(RangeTests, SortWidgetNeg)
{
    auto circuit_builder = UltraCircuitBuilder();
    fr a = fr::one();
    fr b = fr(2);
    fr c = fr(3);
    fr d = fr(8);

    auto a_idx = circuit_builder.add_variable(a);
    auto b_idx = circuit_builder.add_variable(b);
    auto c_idx = circuit_builder.add_variable(c);
    auto d_idx = circuit_builder.add_variable(d);
    circuit_builder.enforce_small_deltas({ a_idx, b_idx, c_idx, d_idx });

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
}

TYPED_TEST(RangeTests, ComposedRangeConstraint)
{
    auto circuit_builder = UltraCircuitBuilder();
    auto c = fr::random_element();
    auto d = uint256_t(c).slice(0, 133);
    auto e = fr(d);
    auto a_idx = circuit_builder.add_variable(fr(e));
    circuit_builder.create_add_gate({ a_idx, circuit_builder.zero_idx(), circuit_builder.zero_idx(), 1, 0, 0, -fr(e) });
    circuit_builder.create_limbed_range_constraint(a_idx, 134);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}
