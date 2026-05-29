#include "multi_scalar_mul.hpp"
#include "acir_format.hpp"
#include "barretenberg/dsl/acir_format/test_class_predicate.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

#include <gtest/gtest.h>
#include <vector>

using namespace ::acir_format;

enum class InputConstancy : uint8_t { None, Points, Scalars, Both };

/**
 * @brief Testing functions to generate the MultiScalarMul test suite. Constancy specifies which inputs to the
 * constraints should be constant.
 *
 * @details Edge cases for MSM on Grumpkin are tested in cycle_group. Here we test that:
 * 1. If sum(scalars[i] * points[i]) != result, then the circuit fails (TamperingMode::Result)
 * 2. If the inputs are not valid points/scalars on Grumpkin, or the MSM is incorrect, but the predicate is witness
 * false, then the circuit is satisfied.
 */
template <typename Builder_, InputConstancy Constancy> class MultiScalarMulTestingFunctions {
  public:
    using Builder = Builder_;
    using AcirConstraint = MultiScalarMul;
    using G1 = bb::grumpkin::g1;
    using GrumpkinPoint = G1::affine_element;
    using FF = bb::fr;

    class InvalidWitness {
      public:
        enum class Target : uint8_t {
            None,
            Points,  // Invalidate point inputs
            Scalars, // Invalidate scalar inputs
            Result   // Invalidate result output
        };

        static std::vector<Target> get_all()
        {
            return { Target::None, Target::Points, Target::Scalars, Target::Result };
        }

        static std::vector<std::string> get_labels() { return { "None", "Points", "Scalars", "Result" }; }
    };

    static ProgramMetadata generate_metadata() { return ProgramMetadata{}; }

    static void generate_constraints(AcirConstraint& msm_constraint, WitnessVector& witness_values)
    {
        // Generate a single point and scalar for simplicity
        GrumpkinPoint point = GrumpkinPoint::random_element();
        bb::fq scalar_native = bb::fq::random_element();
        GrumpkinPoint result = point * scalar_native;
        BB_ASSERT(result != GrumpkinPoint::one()); // Ensure that tampering works correctly

        // Split scalar into low and high limbs (128 bits each) as FF for witness values
        uint256_t scalar_u256 = uint256_t(scalar_native);
        FF scalar_lo = scalar_u256.slice(0, 128);
        FF scalar_hi = scalar_u256.slice(128, 256);

        // Determine which inputs are constants based on the Constancy template parameter
        constexpr bool points_are_constant = (Constancy == InputConstancy::Points || Constancy == InputConstancy::Both);
        constexpr bool scalars_are_constant =
            (Constancy == InputConstancy::Scalars || Constancy == InputConstancy::Both);

        // Helper to add points: either as witnesses or constants based on Constancy.
        // Points are encoded as (x, y); the point at infinity is encoded as (0, 0).
        auto construct_points = [&]() -> std::vector<WitnessOrConstant<FF>> {
            if constexpr (points_are_constant) {
                return { WitnessOrConstant<FF>::from_constant(point.x), WitnessOrConstant<FF>::from_constant(point.y) };
            }
            std::vector<uint32_t> point_indices = add_to_witness_and_track_indices(witness_values, point);
            return { WitnessOrConstant<FF>::from_index(point_indices[0]),
                     WitnessOrConstant<FF>::from_index(point_indices[1]) };
        };

        // Helper to add scalars: either as witnesses or constants based on Constancy
        auto construct_scalars = [&]() -> std::vector<WitnessOrConstant<FF>> {
            if constexpr (scalars_are_constant) {
                // Scalars are constants
                return { WitnessOrConstant<FF>::from_constant(scalar_lo),
                         WitnessOrConstant<FF>::from_constant(scalar_hi) };
            }
            // Scalars are witnesses
            uint32_t scalar_lo_index = static_cast<uint32_t>(witness_values.size());
            witness_values.emplace_back(scalar_lo);
            uint32_t scalar_hi_index = static_cast<uint32_t>(witness_values.size());
            witness_values.emplace_back(scalar_hi);
            return { WitnessOrConstant<FF>::from_index(scalar_lo_index),
                     WitnessOrConstant<FF>::from_index(scalar_hi_index) };
        };

        // Add points and scalars according to constancy template parameter
        auto point_fields = construct_points();
        auto scalar_fields = construct_scalars();

        // Construct result and predicate as witnesses
        std::vector<uint32_t> result_indices = add_to_witness_and_track_indices(witness_values, result);
        uint32_t predicate_index = static_cast<uint32_t>(witness_values.size());
        witness_values.emplace_back(FF::one()); // predicate

        // Build the constraint
        msm_constraint = MultiScalarMul{
            .points = point_fields,
            .scalars = scalar_fields,
            .predicate = WitnessOrConstant<FF>::from_index(predicate_index),
            .out_point_x = result_indices[0],
            .out_point_y = result_indices[1],
        };
    }

    static std::pair<AcirConstraint, WitnessVector> invalidate_witness(
        AcirConstraint constraint, WitnessVector witness_values, const InvalidWitness::Target& invalid_witness_target)
    {
        switch (invalid_witness_target) {
        case InvalidWitness::Target::Points: {
            // Invalidate the point by adding 1 to x coordinate
            if constexpr (Constancy == InputConstancy::None || Constancy == InputConstancy::Scalars) {
                witness_values[constraint.points[0].index] += bb::fr(1);
            } else {
                constraint.points[0] = WitnessOrConstant<FF>::from_constant(constraint.points[0].value + bb::fr(1));
            }
            break;
        }
        case InvalidWitness::Target::Scalars: {
            // Invalidate the scalar by adding 1 to the low limb
            if constexpr (Constancy == InputConstancy::None || Constancy == InputConstancy::Points) {
                witness_values[constraint.scalars[0].index] += bb::fr(1);
            } else {
                constraint.scalars[0] = WitnessOrConstant<FF>::from_constant(constraint.scalars[0].value + bb::fr(1));
            }
            break;
        }
        case InvalidWitness::Target::Result: {
            // Tamper with the result by setting it to the generator point
            witness_values[constraint.out_point_x] = GrumpkinPoint::one().x;
            witness_values[constraint.out_point_y] = GrumpkinPoint::one().y;
            break;
        }
        case InvalidWitness::Target::None:
        default:
            break;
        }

        return { constraint, witness_values };
    };
};

template <typename Builder>
class MultiScalarMulTestsNoneConstant
    : public ::testing::Test,
      public TestClassWithPredicate<MultiScalarMulTestingFunctions<Builder, InputConstancy::None>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

template <typename Builder>
class MultiScalarMulTestsPointsConstant
    : public ::testing::Test,
      public TestClassWithPredicate<MultiScalarMulTestingFunctions<Builder, InputConstancy::Points>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

template <typename Builder>
class MultiScalarMulTestsScalarsConstant
    : public ::testing::Test,
      public TestClassWithPredicate<MultiScalarMulTestingFunctions<Builder, InputConstancy::Scalars>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

template <typename Builder>
class MultiScalarMulTestsBothConstant
    : public ::testing::Test,
      public TestClassWithPredicate<MultiScalarMulTestingFunctions<Builder, InputConstancy::Both>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using BuilderTypes = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;

TYPED_TEST_SUITE(MultiScalarMulTestsNoneConstant, BuilderTypes);
TYPED_TEST_SUITE(MultiScalarMulTestsPointsConstant, BuilderTypes);
TYPED_TEST_SUITE(MultiScalarMulTestsScalarsConstant, BuilderTypes);
TYPED_TEST_SUITE(MultiScalarMulTestsBothConstant, BuilderTypes);

TYPED_TEST(MultiScalarMulTestsNoneConstant, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(MultiScalarMulTestsNoneConstant, ConstantTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_constant_true(TestFixture::InvalidWitnessTarget::Result);
}

TYPED_TEST(MultiScalarMulTestsNoneConstant, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_true(TestFixture::InvalidWitnessTarget::Result);
}

TYPED_TEST(MultiScalarMulTestsNoneConstant, WitnessFalseSlow)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false_slow();
}

TYPED_TEST(MultiScalarMulTestsNoneConstant, InvalidWitnesses)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_invalid_witnesses();
}

TYPED_TEST(MultiScalarMulTestsPointsConstant, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(MultiScalarMulTestsPointsConstant, ConstantTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_constant_true(TestFixture::InvalidWitnessTarget::Result);
}

TYPED_TEST(MultiScalarMulTestsPointsConstant, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_true(TestFixture::InvalidWitnessTarget::Result);
}

TYPED_TEST(MultiScalarMulTestsPointsConstant, WitnessFalseSlow)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false_slow();
}

TYPED_TEST(MultiScalarMulTestsPointsConstant, InvalidWitnesses)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_invalid_witnesses();
}

TYPED_TEST(MultiScalarMulTestsScalarsConstant, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(MultiScalarMulTestsScalarsConstant, ConstantTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_constant_true(TestFixture::InvalidWitnessTarget::Result);
}

TYPED_TEST(MultiScalarMulTestsScalarsConstant, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_true(TestFixture::InvalidWitnessTarget::Result);
}

TYPED_TEST(MultiScalarMulTestsScalarsConstant, WitnessFalseSlow)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false_slow();
}

TYPED_TEST(MultiScalarMulTestsScalarsConstant, InvalidWitnesses)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_invalid_witnesses();
}

TYPED_TEST(MultiScalarMulTestsBothConstant, GenerateVKFromConstraints)
{
    using Flavor = std::conditional_t<std::is_same_v<TypeParam, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(MultiScalarMulTestsBothConstant, ConstantTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_constant_true(TestFixture::InvalidWitnessTarget::Result);
}

TYPED_TEST(MultiScalarMulTestsBothConstant, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_true(TestFixture::InvalidWitnessTarget::Result);
}

TYPED_TEST(MultiScalarMulTestsBothConstant, WitnessFalseSlow)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false_slow();
}

TYPED_TEST(MultiScalarMulTestsBothConstant, InvalidWitnesses)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_invalid_witnesses();
}

// ============================================================
// Infinity tests: the point at infinity is encoded as (0, 0).
// ============================================================

using MsmGrumpkinPoint = bb::grumpkin::g1::affine_element;
using MsmFF = bb::fr;

struct MsmAcirPoint {
    MsmFF x, y;
    static MsmAcirPoint from_native(const MsmGrumpkinPoint& p) { return { p.x, p.y }; }
    static MsmAcirPoint infinity() { return { MsmFF(0), MsmFF(0) }; }
};

// Grumpkin scalar split into low 128-bit and high 128-bit field limbs.
struct MsmScalar {
    MsmFF lo, hi;
    static MsmScalar zero() { return { MsmFF(0), MsmFF(0) }; }
    static MsmScalar from_native(const bb::fq& s)
    {
        uint256_t u = uint256_t(s);
        return { u.slice(0, 128), u.slice(128, 256) };
    }
};

// Shared single-term MSM circuit helpers: build a one point/one scalar MSM constraint with predicate=1
// from explicit witness values, and run the resulting circuit.
template <typename Builder> class MsmSingleTermFixture : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    // Push an MsmAcirPoint to witness; return [x, y] indices.
    static std::array<uint32_t, 2> push_point(WitnessVector& witness, const MsmAcirPoint& pt)
    {
        uint32_t xi = static_cast<uint32_t>(witness.size());
        witness.emplace_back(pt.x);
        uint32_t yi = static_cast<uint32_t>(witness.size());
        witness.emplace_back(pt.y);
        return { xi, yi };
    }

    // Push a scalar (lo, hi) to witness; return [lo_idx, hi_idx].
    static std::array<uint32_t, 2> push_scalar(WitnessVector& witness, const MsmScalar& s)
    {
        uint32_t lo_idx = static_cast<uint32_t>(witness.size());
        witness.emplace_back(s.lo);
        uint32_t hi_idx = static_cast<uint32_t>(witness.size());
        witness.emplace_back(s.hi);
        return { lo_idx, hi_idx };
    }

    // Build a single-term MSM constraint (predicate=1) from a point, scalar, and expected result.
    // Returns the constraint and the populated witness vector.
    static std::pair<MultiScalarMul, WitnessVector> make_msm(MsmAcirPoint point, MsmScalar scalar, MsmAcirPoint result)
    {
        WitnessVector witness;
        auto p = push_point(witness, point);
        auto s = push_scalar(witness, scalar);
        auto r = push_point(witness, result);
        uint32_t pred_idx = static_cast<uint32_t>(witness.size());
        witness.emplace_back(MsmFF(1));

        MultiScalarMul c{
            .points = { WitnessOrConstant<MsmFF>::from_index(p[0]), WitnessOrConstant<MsmFF>::from_index(p[1]) },
            .scalars = { WitnessOrConstant<MsmFF>::from_index(s[0]), WitnessOrConstant<MsmFF>::from_index(s[1]) },
            .predicate = WitnessOrConstant<MsmFF>::from_index(pred_idx),
            .out_point_x = r[0],
            .out_point_y = r[1],
        };
        return { c, witness };
    }

    // Multi-term variant of make_msm: takes a vector of (point, scalar) pairs.
    static std::pair<MultiScalarMul, WitnessVector> make_msm_multi(
        const std::vector<std::pair<MsmAcirPoint, MsmScalar>>& terms, MsmAcirPoint result)
    {
        WitnessVector witness;
        std::vector<WitnessOrConstant<MsmFF>> points;
        std::vector<WitnessOrConstant<MsmFF>> scalars;
        for (const auto& [pt, sc] : terms) {
            auto p = push_point(witness, pt);
            points.push_back(WitnessOrConstant<MsmFF>::from_index(p[0]));
            points.push_back(WitnessOrConstant<MsmFF>::from_index(p[1]));
            auto s = push_scalar(witness, sc);
            scalars.push_back(WitnessOrConstant<MsmFF>::from_index(s[0]));
            scalars.push_back(WitnessOrConstant<MsmFF>::from_index(s[1]));
        }
        auto r = push_point(witness, result);
        uint32_t pred_idx = static_cast<uint32_t>(witness.size());
        witness.emplace_back(MsmFF(1));

        MultiScalarMul c{
            .points = points,
            .scalars = scalars,
            .predicate = WitnessOrConstant<MsmFF>::from_index(pred_idx),
            .out_point_x = r[0],
            .out_point_y = r[1],
        };
        return { c, witness };
    }

    // Run the circuit and return (satisfied, error_string).
    static std::pair<bool, std::string> run_circuit(MultiScalarMul constraint, WitnessVector witness)
    {
        AcirFormat cs = constraint_to_acir_format(constraint);
        AcirProgram program{ cs, witness };
        auto builder = create_circuit<Builder>(program, ProgramMetadata{});
        bool ok = CircuitChecker::check(builder) && !builder.failed();
        return { ok, builder.err() };
    }
};

template <typename Builder> class MultiScalarMulInfinityTests : public MsmSingleTermFixture<Builder> {};

TYPED_TEST_SUITE(MultiScalarMulInfinityTests, BuilderTypes);

// scalar=0 → result = (0, 0): valid circuit.
TYPED_TEST(MultiScalarMulInfinityTests, ResultIsInfinity)
{
    BB_DISABLE_ASSERTS();
    MsmGrumpkinPoint point = MsmGrumpkinPoint::random_element();
    auto [constraint, witness] =
        TestFixture::make_msm(MsmAcirPoint::from_native(point), MsmScalar::zero(), MsmAcirPoint::infinity());

    auto [ok, err] = TestFixture::run_circuit(constraint, witness);
    EXPECT_TRUE(ok) << "0 * P = infinity should produce a valid circuit";
}

// 1 * infinity = infinity: input point at infinity must produce a valid circuit.
TYPED_TEST(MultiScalarMulInfinityTests, InputIsInfinity)
{
    BB_DISABLE_ASSERTS();
    auto [constraint, witness] =
        TestFixture::make_msm(MsmAcirPoint::infinity(), MsmScalar{ MsmFF(1), MsmFF(0) }, MsmAcirPoint::infinity());

    auto [ok, err] = TestFixture::run_circuit(constraint, witness);
    EXPECT_TRUE(ok) << "1 * infinity = infinity should produce a valid circuit";
}

// s*P + 1*infinity = s*P: an infinity term mixed with a finite term must produce a valid circuit.
TYPED_TEST(MultiScalarMulInfinityTests, InfinityAmongFiniteTerms)
{
    BB_DISABLE_ASSERTS();
    MsmGrumpkinPoint p = MsmGrumpkinPoint::random_element();
    bb::fq s_native = bb::fq::random_element();
    while (s_native.is_zero()) {
        s_native = bb::fq::random_element();
    }
    MsmGrumpkinPoint expected = p * s_native;
    ASSERT_FALSE(expected.is_point_at_infinity());

    auto [constraint, witness] =
        TestFixture::make_msm_multi({ { MsmAcirPoint::from_native(p), MsmScalar::from_native(s_native) },
                                      { MsmAcirPoint::infinity(), MsmScalar{ MsmFF(1), MsmFF(0) } } },
                                    MsmAcirPoint::from_native(expected));

    auto [ok, err] = TestFixture::run_circuit(constraint, witness);
    EXPECT_TRUE(ok) << "s*P + 1*infinity = s*P should produce a valid circuit";
}

// ============================================================
// Scalar field-bounds tests
// ============================================================
//
// The MSM opcode receives a Grumpkin scalar as two field limbs: lo (low 128 bits) and hi (next 126
// bits), reconstructing v = lo + hi * 2^128. cycle_scalar's public constructor adds an in-circuit
// check that v < r, where r == bb::fq::modulus is the Grumpkin scalar field modulus (and also the
// order of the Grumpkin group, since Grumpkin's scalar field is BN254's base field). batch_mul
// additionally range-constrains the limbs to lo < 2^128 and hi < 2^126. These tests pin behaviour
// at and beyond the modulus boundary: an out-of-range scalar must make the circuit unsatisfiable,
// and the group law's s ≡ s + r equivalence must not let a caller smuggle a non-canonical scalar
// through to barretenberg.

namespace {
// r = order of the Grumpkin group = bb::fq::modulus.
const uint256_t grumpkin_scalar_modulus = bb::fq::modulus;

// Build an MsmScalar straight from a uint256_t value, splitting at the 128-bit limb boundary with no
// modular reduction (so out-of-field values can be expressed).
MsmScalar msm_scalar_from_u256(const uint256_t& v)
{
    return { MsmFF(v.slice(0, 128)), MsmFF(v.slice(128, 256)) };
}
} // namespace

template <typename Builder> class MultiScalarMulScalarBoundsTests : public MsmSingleTermFixture<Builder> {};

TYPED_TEST_SUITE(MultiScalarMulScalarBoundsTests, BuilderTypes);

// scalar == r: rejected. The in-circuit "scalar < r" check fails. (r·P = O, so the caller gains
// nothing by claiming the point at infinity as the result.)
TYPED_TEST(MultiScalarMulScalarBoundsTests, ScalarEqualToModulusFails)
{
    BB_DISABLE_ASSERTS();
    MsmGrumpkinPoint point = MsmGrumpkinPoint::random_element();
    auto [constraint, witness] = TestFixture::make_msm(
        MsmAcirPoint::from_native(point), msm_scalar_from_u256(grumpkin_scalar_modulus), MsmAcirPoint::infinity());

    auto [ok, err] = TestFixture::run_circuit(constraint, witness);
    EXPECT_FALSE(ok) << "scalar == Grumpkin scalar modulus must not produce a satisfiable circuit";
}

// scalar == r + 1: rejected, even though (r + 1)·P == 1·P == P. The in-circuit "scalar < r" check
// fails despite both limbs being within their range constraints.
TYPED_TEST(MultiScalarMulScalarBoundsTests, ScalarModulusPlusOneFails)
{
    BB_DISABLE_ASSERTS();
    MsmGrumpkinPoint point = MsmGrumpkinPoint::random_element();
    auto [constraint, witness] = TestFixture::make_msm(MsmAcirPoint::from_native(point),
                                                       msm_scalar_from_u256(grumpkin_scalar_modulus + uint256_t(1)),
                                                       MsmAcirPoint::from_native(point));

    auto [ok, err] = TestFixture::run_circuit(constraint, witness);
    EXPECT_FALSE(ok) << "scalar == Grumpkin scalar modulus + 1 must not produce a satisfiable circuit";
}

// scalar == r - 1: the largest in-field scalar. This must prove fine.
TYPED_TEST(MultiScalarMulScalarBoundsTests, ScalarModulusMinusOneProves)
{
    BB_DISABLE_ASSERTS();
    MsmGrumpkinPoint point = MsmGrumpkinPoint::random_element();
    bb::fq scalar_native = bb::fq(grumpkin_scalar_modulus - uint256_t(1));
    MsmGrumpkinPoint result = point * scalar_native;
    ASSERT_FALSE(result.is_point_at_infinity());
    auto [constraint, witness] = TestFixture::make_msm(MsmAcirPoint::from_native(point),
                                                       msm_scalar_from_u256(grumpkin_scalar_modulus - uint256_t(1)),
                                                       MsmAcirPoint::from_native(result));

    auto [ok, err] = TestFixture::run_circuit(constraint, witness);
    EXPECT_TRUE(ok) << "scalar == Grumpkin scalar modulus - 1 (largest in-field scalar) should prove. err: " << err;
}

// scalar == 2^254 - 1: the largest value the (128 + 126)-bit limb encoding can represent. Both limbs
// satisfy their range constraints, so the only thing rejecting it is the in-circuit "scalar < r"
// check — exercising the "limbs in range but value out of field" path.
TYPED_TEST(MultiScalarMulScalarBoundsTests, MaxRepresentableScalarFails)
{
    BB_DISABLE_ASSERTS();
    MsmGrumpkinPoint point = MsmGrumpkinPoint::random_element();
    uint256_t max_representable = (uint256_t(1) << 254) - uint256_t(1);
    MsmGrumpkinPoint result = point * bb::fq(max_representable); // (2^254 - 1) mod r
    auto [constraint, witness] = TestFixture::make_msm(
        MsmAcirPoint::from_native(point), msm_scalar_from_u256(max_representable), MsmAcirPoint::from_native(result));

    auto [ok, err] = TestFixture::run_circuit(constraint, witness);
    EXPECT_FALSE(ok) << "scalar == 2^254 - 1 (> Grumpkin modulus) must not produce a satisfiable circuit";
}

// hi limb == 2^126 (one bit too wide), lo == 0, i.e. scalar value 2^254. Both the limb range
// constraint (hi < 2^126) and the "scalar < r" check reject it.
TYPED_TEST(MultiScalarMulScalarBoundsTests, ScalarWithOversizedHiLimbFails)
{
    BB_DISABLE_ASSERTS();
    MsmGrumpkinPoint point = MsmGrumpkinPoint::random_element();
    uint256_t two_pow_254 = uint256_t(1) << 254;
    MsmGrumpkinPoint result = point * bb::fq(two_pow_254);
    MsmScalar scalar{ MsmFF(0), MsmFF(uint256_t(1) << 126) }; // hi has 127 bits
    auto [constraint, witness] =
        TestFixture::make_msm(MsmAcirPoint::from_native(point), scalar, MsmAcirPoint::from_native(result));

    auto [ok, err] = TestFixture::run_circuit(constraint, witness);
    EXPECT_FALSE(ok) << "scalar hi limb of 127 bits (value 2^254) must not produce a satisfiable circuit";
}

// Group-law equivalence does not transfer: s·P == (s + r)·P, but the circuit accepts only the
// canonical scalar s. Adding the Grumpkin modulus to a scalar cannot reprove the same output.
TYPED_TEST(MultiScalarMulScalarBoundsTests, AddingGrumpkinModulusDoesNotReproveSameOutput)
{
    BB_DISABLE_ASSERTS();
    MsmGrumpkinPoint point = MsmGrumpkinPoint::random_element();
    bb::fq scalar_native = bb::fq(5);
    MsmGrumpkinPoint result = point * scalar_native;
    ASSERT_FALSE(result.is_point_at_infinity());

    // Sanity: the canonical scalar proves the result.
    {
        auto [constraint, witness] = TestFixture::make_msm(
            MsmAcirPoint::from_native(point), MsmScalar::from_native(scalar_native), MsmAcirPoint::from_native(result));
        auto [ok, err] = TestFixture::run_circuit(constraint, witness);
        EXPECT_TRUE(ok) << "canonical scalar should prove the MSM result. err: " << err;
    }

    // The non-canonical scalar s + r yields the same point mathematically, but the circuit rejects it.
    {
        auto [constraint, witness] = TestFixture::make_msm(MsmAcirPoint::from_native(point),
                                                           msm_scalar_from_u256(uint256_t(5) + grumpkin_scalar_modulus),
                                                           MsmAcirPoint::from_native(result));
        auto [ok, err] = TestFixture::run_circuit(constraint, witness);
        EXPECT_FALSE(ok) << "scalar s + r must not reprove the output of scalar s";
    }
}
