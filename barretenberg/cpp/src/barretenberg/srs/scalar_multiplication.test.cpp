/**
 * @file scalar_multiplication.test.cpp
 * @brief Tests of our implementation of Pippenger's multi-scalar multiplication algorithm.
 *
 * @details This file is here with the SRS code, rather than being next to the Pippenger implementation, to avoid a
 * cyclic dependency between our srs and ecc modules. Namely, srs depends on ecc via the FileCrs constructor that
 * constructs a Pippenger point table. It may make sense to create a function in the ecc module that initializes a CRS,
 * but for now a low-impact solution (to a newly-encountered linker error) is to move this test file, as it was the sole
 * reason for for ecc to depend on srs.
 */

#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <cstddef>
#include <vector>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

template <typename Curve> class ScalarMultiplicationTests : public ::testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using Curves = ::testing::Types<curve::BN254, curve::Grumpkin>;

TYPED_TEST_SUITE(ScalarMultiplicationTests, Curves);

TYPED_TEST(ScalarMultiplicationTests, AddAffinePoints)
{
    using Curve = TypeParam;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using Fq = typename Curve::BaseField;

    constexpr size_t num_points = 20;
    AffineElement* points = (AffineElement*)(aligned_alloc(64, sizeof(AffineElement) * (num_points)));
    Fq* scratch_space = (Fq*)(aligned_alloc(64, sizeof(Fq) * (num_points * 2)));
    Fq* lambda = (Fq*)(aligned_alloc(64, sizeof(Fq) * (num_points * 2)));

    Element* points_copy = (Element*)(aligned_alloc(64, sizeof(Element) * (num_points)));
    for (size_t i = 0; i < num_points; ++i) {
        points[i] = AffineElement(Element::random_element());
        points_copy[i].x = points[i].x;
        points_copy[i].y = points[i].y;
        points_copy[i].z = Fq::one();
    }

    size_t count = num_points - 1;
    for (size_t i = num_points - 2; i < num_points; i -= 2) {
        points_copy[count--] = points_copy[i] + points_copy[i + 1];
        points_copy[count + 1] = points_copy[count + 1].normalize();
    }

    scalar_multiplication::MSM<Curve>::add_affine_points(points, num_points, scratch_space);
    for (size_t i = num_points - 1; i > num_points - 1 - (num_points / 2); --i) {
        EXPECT_EQ((points[i].x == points_copy[i].x), true);
        EXPECT_EQ((points[i].y == points_copy[i].y), true);
    }
    aligned_free(lambda);
    aligned_free(points);
    aligned_free(points_copy);
    aligned_free(scratch_space);
}

TYPED_TEST(ScalarMultiplicationTests, EndomorphismSplit)
{
    using Curve = TypeParam;
    using Group = typename Curve::Group;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;
    using Fq = typename Curve::BaseField;

    Fr scalar = Fr::random_element();

    Element expected = Group::one * scalar;

    // we want to test that we can split a scalar into two half-length components, using the same location in memory.
    Fr* k1_t = &scalar;
    Fr* k2_t = (Fr*)&scalar.data[2];

    Fr::split_into_endomorphism_scalars(scalar, *k1_t, *k2_t);
    Fr k1{ (*k1_t).data[0], (*k1_t).data[1], 0, 0 };
    Fr k2{ (*k2_t).data[0], (*k2_t).data[1], 0, 0 };
#if !defined(__clang__) && defined(__GNUC__)
#pragma GCC diagnostic pop
#endif
    Element result;
    Element t1 = Group::affine_one * k1;
    AffineElement generator = Group::affine_one;
    Fq beta = Fq::cube_root_of_unity();
    generator.x = generator.x * beta;
    generator.y = -generator.y;
    Element t2 = generator * k2;
    result = t1 + t2;

    EXPECT_EQ(result == expected, true);
}

TYPED_TEST(ScalarMultiplicationTests, RadixSort)
{
    using Curve = TypeParam;
    using Fr = typename Curve::ScalarField;

    // check that our radix sort correctly sorts!
    constexpr size_t target_degree = 1 << 8;
    const size_t num_rounds = scalar_multiplication::MSM<Curve>::get_num_rounds(target_degree);
    Fr* scalars = (Fr*)(aligned_alloc(64, sizeof(Fr) * target_degree));

    Fr source_scalar = Fr::random_element();
    for (size_t i = 0; i < target_degree; ++i) {
        source_scalar.self_sqr();
        Fr::__copy(source_scalar, scalars[i]);
    }

    size_t bits_per_slice = scalar_multiplication::MSM<Curve>::get_optimal_log_num_buckets(target_degree);

    for (size_t i = 0; i < num_rounds; ++i) {

        std::vector<uint64_t> scalar_slices(target_degree);
        std::vector<uint64_t> sorted_scalar_slices(target_degree);

        for (size_t j = 0; j < target_degree; ++j) {
            scalar_slices[j] = scalar_multiplication::MSM<Curve>::get_scalar_slice(scalars[j], i, bits_per_slice);
            sorted_scalar_slices[j] = scalar_slices[j];
        }
        scalar_multiplication::process_buckets_count_zero_entries(
            &sorted_scalar_slices[0], target_degree, static_cast<uint32_t>(bits_per_slice));

        const auto find_entry = [scalar_slices, num_entries = target_degree](auto x) {
            for (size_t k = 0; k < num_entries; ++k) {
                if (scalar_slices[k] == x) {
                    return true;
                }
            }
            return false;
        };
        for (size_t j = 0; j < target_degree; ++j) {
            EXPECT_EQ(find_entry(sorted_scalar_slices[j]), true);
            if (j > 0) {
                EXPECT_EQ((sorted_scalar_slices[j] & 0x7fffffffU) >= (sorted_scalar_slices[j - 1] & 0x7fffffffU), true);
            }
        }
    }

    free(scalars);
}

TYPED_TEST(ScalarMultiplicationTests, OversizedInputs)
{
    using Curve = TypeParam;
    if constexpr (std::is_same_v<Curve, curve::Grumpkin>) {
        // Grumpkin has at most 1 << 18 points; the test is not valid for it.
        GTEST_SKIP() << "Skipping test for grumpkin";
    }
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;
    using Fq = typename Curve::BaseField;

    // for point ranges with more than 1 << 20 points, we split into chunks of smaller multi-exps.
    // Check that this is done correctly
    size_t target_degree = 1200000;
    std::span<AffineElement> monomials = srs::get_crs_factory<Curve>()->get_crs(target_degree)->get_monomial_points();

    Fr* scalars = (Fr*)(aligned_alloc(64, sizeof(Fr) * target_degree));

    Fr source_scalar = Fr::random_element();
    Fr accumulator = source_scalar;
    for (size_t i = 0; i < target_degree; ++i) {
        accumulator *= source_scalar;
        Fr::__copy(accumulator, scalars[i]);
    }

    Element first = scalar_multiplication::pippenger<Curve>({ 0, { scalars, /*size*/ target_degree } }, monomials);
    first = first.normalize();

    for (size_t i = 0; i < target_degree; ++i) {
        scalars[i].self_neg();
    }

    Element second = scalar_multiplication::pippenger<Curve>(
        PolynomialSpan<const typename Curve::ScalarField>{ 0, { scalars, /*size*/ target_degree } }, monomials);
    second = second.normalize();

    EXPECT_EQ((first.z == second.z), true);
    EXPECT_EQ((first.z == Fq::one()), true);
    EXPECT_EQ((first.x == second.x), true);
    EXPECT_EQ((first.y == -second.y), true);

    aligned_free(scalars);
}

TYPED_TEST(ScalarMultiplicationTests, UndersizedInputs)
{
    using Curve = TypeParam;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;

    // we fall back to traditional scalar multiplication algorithm for small input sizes.
    // Check this is done correctly
    size_t num_points = 17;

    Fr* scalars = (Fr*)aligned_alloc(32, sizeof(Fr) * num_points);

    AffineElement* points = (AffineElement*)aligned_alloc(32, sizeof(AffineElement) * (num_points * 2 + 1));

    for (size_t i = 0; i < num_points; ++i) {
        scalars[i] = Fr::random_element();
        points[i] = AffineElement(Element::random_element());
    }

    Element expected;
    expected.self_set_infinity();
    for (size_t i = 0; i < num_points; ++i) {
        Element temp = points[i] * scalars[i];
        expected += temp;
    }
    expected = expected.normalize();

    Element result = scalar_multiplication::pippenger<Curve>({ 0, { scalars, /*size*/ num_points } },
                                                             { points, /*size*/ num_points * 2 });
    result = result.normalize();

    aligned_free(scalars);
    aligned_free(points);

    EXPECT_EQ(result == expected, true);
}

TYPED_TEST(ScalarMultiplicationTests, PippengerSmall)
{
    using Curve = TypeParam;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;

    constexpr size_t num_points = 8192;

    Fr* scalars = (Fr*)aligned_alloc(32, sizeof(Fr) * num_points);

    AffineElement* points = (AffineElement*)aligned_alloc(32, sizeof(AffineElement) * (num_points * 2 + 1));

    for (size_t i = 0; i < num_points; ++i) {
        scalars[i] = Fr::random_element();
        points[i] = AffineElement(Element::random_element());
    }

    Element expected;
    expected.self_set_infinity();
    for (size_t i = 0; i < num_points; ++i) {
        Element temp = points[i] * scalars[i];
        expected += temp;
    }
    expected = expected.normalize();

    Element result = scalar_multiplication::pippenger<Curve>({ 0, { scalars, /*size*/ num_points } },
                                                             { points, /*size*/ num_points });
    result = result.normalize();

    aligned_free(scalars);
    aligned_free(points);

    EXPECT_EQ(result == expected, true);
}

TYPED_TEST(ScalarMultiplicationTests, PippengerEdgeCaseDbl)
{
    using Curve = TypeParam;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;

    constexpr size_t num_points = 128;

    Fr* scalars = (Fr*)aligned_alloc(32, sizeof(Fr) * num_points);

    AffineElement* points = (AffineElement*)aligned_alloc(32, sizeof(AffineElement) * (num_points * 2 + 1));

    AffineElement point = AffineElement(Element::random_element());
    for (size_t i = 0; i < num_points; ++i) {
        scalars[i] = Fr::random_element();
        points[i] = point;
    }

    Element expected;
    expected.self_set_infinity();
    for (size_t i = 0; i < num_points; ++i) {
        Element temp = points[i] * scalars[i];
        expected += temp;
    }
    if (!expected.is_point_at_infinity()) {
        expected = expected.normalize();
    }
    Element result = scalar_multiplication::pippenger<Curve>({ 0, { scalars, /*size*/ num_points } },
                                                             { points, /*size*/ num_points * 2 });
    result = result.normalize();

    aligned_free(scalars);
    aligned_free(points);

    EXPECT_EQ(result == expected, true);
}

TYPED_TEST(ScalarMultiplicationTests, PippengerShortInputs)
{
    using Curve = TypeParam;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;

    constexpr size_t num_points = 8192;

    Fr* scalars = (Fr*)aligned_alloc(32, sizeof(Fr) * num_points);

    std::vector<AffineElement> points(num_points);

    for (size_t i = 0; i < num_points; ++i) {
        points[i] = AffineElement(Element::random_element());
    }
    for (size_t i = 0; i < (num_points / 4); ++i) {
        scalars[i * 4].data[0] = engine.get_random_uint32();
        scalars[i * 4].data[1] = engine.get_random_uint32();
        scalars[i * 4].data[2] = engine.get_random_uint32();
        scalars[i * 4].data[3] = engine.get_random_uint32();
        scalars[i * 4] = scalars[i * 4].to_montgomery_form();
        scalars[i * 4 + 1].data[0] = 0;
        scalars[i * 4 + 1].data[1] = 0;
        scalars[i * 4 + 1].data[2] = 0;
        scalars[i * 4 + 1].data[3] = 0;
        scalars[i * 4 + 1] = scalars[i * 4 + 1].to_montgomery_form();
        scalars[i * 4 + 2].data[0] = engine.get_random_uint32();
        scalars[i * 4 + 2].data[1] = engine.get_random_uint32();
        scalars[i * 4 + 2].data[2] = 0;
        scalars[i * 4 + 2].data[3] = 0;
        scalars[i * 4 + 2] = scalars[i * 4 + 2].to_montgomery_form();
        scalars[i * 4 + 3].data[0] = (engine.get_random_uint32() & 0x07ULL);
        scalars[i * 4 + 3].data[1] = 0;
        scalars[i * 4 + 3].data[2] = 0;
        scalars[i * 4 + 3].data[3] = 0;
        scalars[i * 4 + 3] = scalars[i * 4 + 3].to_montgomery_form();
    }

    Element expected;
    expected.self_set_infinity();
    for (size_t i = 0; i < num_points; ++i) {
        Element temp = points[i] * scalars[i];
        expected += temp;
    }
    expected = expected.normalize();

    Element result = scalar_multiplication::pippenger<Curve>({ 0, { scalars, /*size*/ num_points } }, points);
    result = result.normalize();

    aligned_free(scalars);

    EXPECT_EQ(result == expected, true);
}

TYPED_TEST(ScalarMultiplicationTests, PippengerUnsafe)
{
    using Curve = TypeParam;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;

    constexpr size_t num_points = 8192;

    Fr* scalars = (Fr*)aligned_alloc(32, sizeof(Fr) * num_points);

    std::vector<AffineElement> points(num_points);

    for (size_t i = 0; i < num_points; ++i) {
        scalars[i] = Fr::random_element();
        points[i] = AffineElement(Element::random_element());
    }

    Element expected;
    expected.self_set_infinity();
    for (size_t i = 0; i < num_points; ++i) {
        Element temp = points[i] * scalars[i];
        expected += temp;
    }
    expected = expected.normalize();
    Element result = scalar_multiplication::pippenger_unsafe<Curve>({ 0, { scalars, /*size*/ num_points } }, points);
    result = result.normalize();

    aligned_free(scalars);

    EXPECT_EQ(result == expected, true);
}

TYPED_TEST(ScalarMultiplicationTests, PippengerUnsafeShortInputs)
{
    using Curve = TypeParam;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;

    constexpr size_t num_points = 8192;

    Fr* scalars = (Fr*)aligned_alloc(32, sizeof(Fr) * num_points);

    AffineElement* points = (AffineElement*)aligned_alloc(32, sizeof(AffineElement) * (num_points * 2 + 1));

    for (size_t i = 0; i < num_points; ++i) {
        points[i] = AffineElement(Element::random_element());
    }
    for (size_t i = 0; i < (num_points / 4); ++i) {
        scalars[i * 4].data[0] = engine.get_random_uint32();
        scalars[i * 4].data[1] = engine.get_random_uint32();
        scalars[i * 4].data[2] = engine.get_random_uint32();
        scalars[i * 4].data[3] = engine.get_random_uint32();
        scalars[i * 4] = scalars[i * 4].to_montgomery_form();
        scalars[i * 4 + 1].data[0] = 0;
        scalars[i * 4 + 1].data[1] = 0;
        scalars[i * 4 + 1].data[2] = 0;
        scalars[i * 4 + 1].data[3] = 0;
        scalars[i * 4 + 1] = scalars[i * 4 + 1].to_montgomery_form();
        scalars[i * 4 + 2].data[0] = engine.get_random_uint32();
        scalars[i * 4 + 2].data[1] = engine.get_random_uint32();
        scalars[i * 4 + 2].data[2] = 0;
        scalars[i * 4 + 2].data[3] = 0;
        scalars[i * 4 + 2] = scalars[i * 4 + 2].to_montgomery_form();
        scalars[i * 4 + 3].data[0] = (engine.get_random_uint32() & 0x07ULL);
        scalars[i * 4 + 3].data[1] = 0;
        scalars[i * 4 + 3].data[2] = 0;
        scalars[i * 4 + 3].data[3] = 0;
        scalars[i * 4 + 3] = scalars[i * 4 + 3].to_montgomery_form();
    }

    Element expected;
    expected.self_set_infinity();
    for (size_t i = 0; i < num_points; ++i) {
        Element temp = points[i] * scalars[i];
        expected += temp;
    }
    expected = expected.normalize();

    Element result = scalar_multiplication::pippenger_unsafe<Curve>({ 0, { scalars, /*size*/ num_points } },
                                                                    { points, num_points * 2 + 1 });
    result = result.normalize();

    aligned_free(scalars);
    aligned_free(points);

    EXPECT_EQ(result == expected, true);
}

TYPED_TEST(ScalarMultiplicationTests, PippengerOne)
{
    using Curve = TypeParam;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;

    size_t num_points = 1;

    Fr* scalars = (Fr*)aligned_alloc(32, sizeof(Fr) * 1);

    AffineElement* points = (AffineElement*)aligned_alloc(32, sizeof(AffineElement) * (num_points * 2 + 1));

    for (size_t i = 0; i < num_points; ++i) {
        scalars[i] = Fr::random_element();
        points[i] = AffineElement(Element::random_element());
    }

    Element expected;
    expected.self_set_infinity();
    for (size_t i = 0; i < num_points; ++i) {
        Element temp = points[i] * scalars[i];
        expected += temp;
    }
    expected = expected.normalize();

    Element result = scalar_multiplication::pippenger<Curve>({ 0, { scalars, /*size*/ num_points } },
                                                             { points, /*size*/ num_points * 2 });
    result = result.normalize();

    aligned_free(scalars);
    aligned_free(points);

    EXPECT_EQ(result == expected, true);
}

TYPED_TEST(ScalarMultiplicationTests, PippengerZeroPoints)
{
    using Curve = TypeParam;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;

    Fr* scalars = (Fr*)aligned_alloc(32, sizeof(Fr));

    AffineElement* points = (AffineElement*)aligned_alloc(32, sizeof(AffineElement) * (2 + 1));

    Element result = scalar_multiplication::pippenger<Curve>({ 0, { scalars, /*size*/ 0 } }, { points, /*size*/ 0 });

    aligned_free(scalars);
    aligned_free(points);

    EXPECT_EQ(result.is_point_at_infinity(), true);
}

TYPED_TEST(ScalarMultiplicationTests, PippengerMulByZero)
{
    using Curve = TypeParam;
    using Group = typename Curve::Group;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;

    Fr* scalars = (Fr*)aligned_alloc(32, sizeof(Fr));

    AffineElement* points = (AffineElement*)aligned_alloc(32, sizeof(AffineElement) * (2 + 1));

    scalars[0] = Fr::zero();
    points[0] = Group::affine_one;
    Element result = scalar_multiplication::pippenger<Curve>({ 0, { scalars, /*size*/ 1 } }, { points, /*size*/ 2 });

    aligned_free(scalars);
    aligned_free(points);

    EXPECT_EQ(result.is_point_at_infinity(), true);
}
