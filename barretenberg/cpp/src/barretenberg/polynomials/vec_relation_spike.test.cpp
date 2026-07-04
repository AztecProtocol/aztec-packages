// Compile-time + native-parity tests for using `VectorField` as the element type of `Univariate<...>` and
// relation accumulators. Each test pins one abstraction layer (Univariate ops, edge extension, relation
// instantiation), so a missing Vec API or a regression in the relation set surfaces at a known callsite.
//
// Lives in `polynomials/` to keep the lower-level tests off the relations + flavor link surface.

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/fields/vector_field.hpp"
#include "barretenberg/flavor/generated/mega_flavor_generated.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/relation_types.hpp"
#include "barretenberg/relations/ultra_arithmetic_relation.hpp"

#include <array>
#include <gtest/gtest.h>

namespace {

using bb::fr;
using Vec = bb::VectorField<bb::Bn254FrParams>;

Vec random_vec()
{
    std::array<fr, 5> a;
    for (auto& v : a) {
        v = fr::random_element();
    }
    return Vec(a);
}

Vec broadcast(const fr& s)
{
    return Vec::broadcast(s);
}

TEST(VecRelationSpike, UnivariateVecDefaultAndScalarCtor)
{
    using UVec = bb::Univariate<Vec, 6>;
    UVec a;               // default
    UVec b{ Vec::one() }; // explicit Univariate(const Vec&) — all slots = Vec::one()
    (void)a;
    (void)b;
    SUCCEED();
}

TEST(VecRelationSpike, UnivariateVecArithmetic)
{
    using UVec = bb::Univariate<Vec, 6>;
    std::array<Vec, 6> av{ random_vec(), random_vec(), random_vec(), random_vec(), random_vec(), random_vec() };
    std::array<Vec, 6> bv{ random_vec(), random_vec(), random_vec(), random_vec(), random_vec(), random_vec() };
    UVec a{ av };
    UVec b{ bv };
    auto sum = a + b;
    auto diff = a - b;
    auto prod = a * b;
    (void)sum;
    (void)diff;
    (void)prod;
    SUCCEED();
}

// `extend_to<K>` is what `Sumcheck::extend_edges` calls on each (eval@0, eval@1) edge before relation
// algebra runs; the SimdLane path goes through the same code with `Vec` substituted for `FF`.
TEST(VecRelationSpike, UnivariateVecExtendTo)
{
    std::array<Vec, 2> base{ random_vec(), random_vec() };
    bb::Univariate<Vec, 2> u2{ base };
    auto extended = u2.template extend_to<6>();
    (void)extended;
    SUCCEED();
}

// Running the same algebraic expression on `Univariate<Vec>` built from `broadcast(scalar)` should yield
// a Vec result whose every lane equals the scalar result.
TEST(VecRelationSpike, UnivariateVecBroadcastParity)
{
    using UFF = bb::Univariate<fr, 6>;
    using UVec = bb::Univariate<Vec, 6>;

    std::array<fr, 6> a_arr;
    std::array<fr, 6> b_arr;
    for (size_t k = 0; k < 6; ++k) {
        a_arr[k] = fr::random_element();
        b_arr[k] = fr::random_element();
    }
    UFF a_ff{ a_arr };
    UFF b_ff{ b_arr };

    std::array<Vec, 6> a_vec_arr;
    std::array<Vec, 6> b_vec_arr;
    for (size_t k = 0; k < 6; ++k) {
        a_vec_arr[k] = broadcast(a_arr[k]);
        b_vec_arr[k] = broadcast(b_arr[k]);
    }
    UVec a_vec{ a_vec_arr };
    UVec b_vec{ b_vec_arr };

    auto result_ff = a_ff * b_ff + a_ff - b_ff;
    auto result_vec = a_vec * b_vec + a_vec - b_vec;

    for (size_t k = 0; k < 6; ++k) {
        auto lanes = result_vec.evaluations[k].to_array();
        for (size_t L = 0; L < 5; ++L) {
            EXPECT_EQ(lanes[L], result_ff.evaluations[k]) << "k=" << k << " lane=" << L;
        }
    }
}

// Compile-time check that `Vec` is a valid `FF` substitute for relation templates.
TEST(VecRelationSpike, ArithmeticRelationImplInstantiates)
{
    using Rel = bb::ArithmeticRelationImpl<Vec>;
    static_assert(std::is_same_v<typename Rel::FF, Vec>);
    static_assert(Rel::SUBRELATION_PARTIAL_LENGTHS[0] == 6);
    static_assert(Rel::SUBRELATION_PARTIAL_LENGTHS[1] == 5);
    SUCCEED();
}

// Force instantiation of `accumulate<Vec>` through the codegen entity container
// `MegaFlavor_Generated::AllEntities<Univariate<Vec,K>>` -- the same path the SimdLane uses. Runs on native
// (Vec is the scalar fallback), so this only proves compile feasibility; SIMD correctness is covered by
// `VectorFieldTest` on WASM and end-to-end by the WASM proving tests.
TEST(VecRelationSpike, RelationsInstantiateWithVecElement)
{
    using UVec = bb::Univariate<Vec, 8>;
    bb::MegaFlavor_Generated::AllEntities<UVec> in;
    bb::RelationParameters<Vec> params;
    const Vec scaling = Vec::broadcast(fr::random_element());

    typename bb::Relation<bb::ArithmeticRelationImpl<Vec>>::SumcheckTupleOfUnivariatesOverSubrelations arith_acc{};
    bb::ArithmeticRelationImpl<Vec>::accumulate(arith_acc, in, params, scaling);

    // Permutation exercises the `RelationParameters<Vec>` View path (beta/gamma/public_input_delta).
    typename bb::Relation<bb::UltraPermutationRelationImpl<Vec>>::SumcheckTupleOfUnivariatesOverSubrelations perm_acc{};
    bb::UltraPermutationRelationImpl<Vec>::accumulate(perm_acc, in, params, scaling);

    SUCCEED();
}

// `Univariate<Vec>::is_zero()` must mean "every coefficient zero on every lane" -- the relation skip-batch
// decision (`selector.is_zero()`) is only safe when the selector is identically zero across all packed rows.
TEST(VecRelationSpike, UnivariateVecIsZeroMeansAllLanesAllCoeffs)
{
    using UVec = bb::Univariate<Vec, 4>;
    const std::array<Vec, 4> zeros{ Vec::zero(), Vec::zero(), Vec::zero(), Vec::zero() };

    EXPECT_TRUE((UVec{ zeros }).is_zero());

    // One coefficient with one non-zero lane -- must NOT be reported as identically zero.
    {
        std::array<Vec, 4> arr = zeros;
        const std::array<fr, 5> lanes{ fr::zero(), fr::zero(), fr::one(), fr::zero(), fr::zero() };
        arr[2] = Vec(lanes);
        EXPECT_FALSE((UVec{ arr }).is_zero());
    }

    // One coefficient with every lane non-zero.
    {
        std::array<Vec, 4> arr = zeros;
        arr[0] = Vec::broadcast(fr::one());
        EXPECT_FALSE((UVec{ arr }).is_zero());
    }
}

} // namespace
