#include "barretenberg/stdlib/primitives/field/field_conversion.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/stdlib/primitives/test_utils.hpp"
#include <gtest/gtest.h>

using bb::stdlib::test_utils::check_circuit_and_gate_count;

namespace bb::stdlib::field_conversion_tests {

template <typename Builder> using fr = field_t<Builder>;
template <typename Builder> using fq = bigfield<Builder, bb::Bn254FqParams>;
template <typename Builder> using bn254_element = element<Builder, fq<Builder>, fr<Builder>, curve::BN254::Group>;
template <typename Builder> using grumpkin_element = cycle_group<Builder>;

template <typename Builder> class stdlib_field_conversion : public ::testing::Test {
  public:
    using Codec = StdlibCodec<field_t<Builder>>;

    /**
     * @brief Helper to test gate counts for deserialization
     * @param create_native Function that creates a native value to serialize
     * @param expected_gates Expected gate count (excluding base gates)
     * @param num_elements Number of elements to deserialize (defaults to 1)
     */
    template <typename T, typename CreateFn>
    void check_deserialization_gate_count(CreateFn create_native, uint32_t expected_gates, size_t num_elements = 1)
    {
        using NativeCodec = FrCodec;
        Builder builder;

        for (size_t i = 0; i < num_elements; ++i) {
            // Create native value and serialize
            auto native_value = create_native();
            auto native_fields = NativeCodec::serialize_to_fields(native_value);

            // Create witnesses from "proof data"
            std::vector<field_t<Builder>> witness_fields;
            for (const auto& f : native_fields) {
                witness_fields.push_back(field_t<Builder>::from_witness(&builder, f));
            }

            // Deserialize in circuit
            [[maybe_unused]] auto deserialized = Codec::template deserialize_from_fields<T>(witness_fields);
        }

        check_circuit_and_gate_count(builder, expected_gates);
    }

    // Serialize and deserialize
    template <typename T> void check_conversion(T in, bool valid_circuit = true, bool point_at_infinity = false)
    {
        size_t len = Codec::template calc_num_fields<T>();
        auto frs = Codec::serialize_to_fields(in);
        EXPECT_EQ(len, frs.size());
        auto out = Codec::template deserialize_from_fields<T>(frs);
        bool expected = std::is_same_v<Builder, UltraCircuitBuilder> ? !point_at_infinity : true;

        EXPECT_EQ(in.get_value() == out.get_value(), expected);

        auto ctx = in.get_context();

        EXPECT_EQ(CircuitChecker::check(*ctx), valid_circuit);
    }

    template <typename T> void check_conversion_iterable(T x)
    {
        size_t len = Codec::template calc_num_fields<T>();
        auto frs = Codec::template serialize_to_fields<T>(x);
        EXPECT_EQ(len, frs.size());
        auto y = Codec::template deserialize_from_fields<T>(frs);
        EXPECT_EQ(x.size(), y.size());
        for (auto [val1, val2] : zip_view(x, y)) {
            EXPECT_EQ(val1.get_value(), val2.get_value());
        }
    }
};

using BuilderTypes = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;

TYPED_TEST_SUITE(stdlib_field_conversion, BuilderTypes);

/**
 * @brief Field conversion test for fr<Builder>
 */
TYPED_TEST(stdlib_field_conversion, FieldConversionFr)
{
    using Builder = TypeParam;
    Builder builder;
    bb::fr field_element_val(
        std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789")); // 256 bits
    fr<Builder> field_element(&builder, field_element_val);
    this->check_conversion(field_element);

    field_element_val = bb::fr::modulus_minus_two; // modulus - 2
    field_element = fr<Builder>(&builder, field_element_val);
    this->check_conversion(field_element);

    field_element_val = bb::fr(1);
    field_element = fr<Builder>(&builder, field_element_val);
    this->check_conversion(field_element);
}

/**
 * @brief Field conversion test for fq<Builder>
 */
TYPED_TEST(stdlib_field_conversion, FieldConversionGrumpkinFr)
{
    using Builder = TypeParam;
    Builder builder;

    // Constructing bigfield objects with bb::fq values
    bb::fq field_element_val(
        std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789")); // 256 bits
    this->check_conversion(fq<Builder>::from_witness(&builder, field_element_val));
}

/**
 * @brief Field conversion test for bn254_element<Builder>
 *
 */
TYPED_TEST(stdlib_field_conversion, FieldConversionBN254AffineElement)
{
    using Builder = TypeParam;
    { // Serialize and deserialize the bn254 generator
        Builder builder;

        bn254_element<Builder> group_element =
            bn254_element<Builder>::from_witness(&builder, curve::BN254::AffineElement::one());
        this->check_conversion(group_element);
    }
    { // Serialize and deserialize a valid bn254 point
        Builder builder;

        curve::BN254::AffineElement group_element_val(1, bb::fq::modulus_minus_two);
        bn254_element<Builder> group_element = bn254_element<Builder>::from_witness(&builder, group_element_val);
        this->check_conversion(group_element);
    }

    { // Serialize and deserialize random Grumpkin points
        Builder builder;
        const size_t num_points = 50;
        const curve::BN254::AffineElement native_generator = curve::BN254::AffineElement::one();

        for (size_t i = 0; i < num_points; i++) {
            bb::fr random_scalar = bb::fr::random_element();
            bn254_element<Builder> group_element =
                bn254_element<Builder>::from_witness(&builder, native_generator * random_scalar);
            this->check_conversion(group_element);
        }
    }
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1527): Remove `point_at_infinity` flag when point at
    // infinity is consistently represented.
    { // Serialize and deserialize the point at infinity
        Builder builder;

        bn254_element<Builder> group_element =
            bn254_element<Builder>::from_witness(&builder, curve::BN254::AffineElement::infinity());
        // The circuit is valid, because the point at infinity is set to `one`.
        this->check_conversion(group_element, /* valid circuit */ true, /* point at infinity */ true);
    }

    { // Serialize and deserialize "coordinates" that do not correspond to any point on the curve
        Builder builder;

        curve::BN254::AffineElement group_element_val(1, 4);
        bn254_element<Builder> group_element;
        if constexpr (IsAnyOf<Builder, UltraCircuitBuilder>) {
            EXPECT_THROW_OR_ABORT(group_element = bn254_element<Builder>::from_witness(&builder, group_element_val),
                                  "");
        } else {
            group_element = bn254_element<Builder>::from_witness(&builder, group_element_val);
            this->check_conversion(group_element);
        }
    }
}

/**
 * @brief Field conversion test for grumpkin_element<Builder>
 *
 */
TYPED_TEST(stdlib_field_conversion, FieldConversionGrumpkinAffineElement)
{
    using Builder = TypeParam;

    { // Serialize and deserialize the Grumpkin generator
        Builder builder;
        grumpkin_element<Builder> group_element =
            grumpkin_element<Builder>::from_witness(&builder, curve::Grumpkin::AffineElement::one());
        this->check_conversion(group_element);
    }
    { // Serialize and deserialize random Grumpkin points
        Builder builder;
        const size_t num_points = 50;
        const curve::Grumpkin::AffineElement native_generator = curve::Grumpkin::AffineElement::one();

        for (size_t i = 0; i < num_points; i++) {
            bb::fq random_scalar = bb::fq::random_element();
            grumpkin_element<Builder> group_element =
                grumpkin_element<Builder>::from_witness(&builder, native_generator * random_scalar);
            this->check_conversion(group_element);
        }
    }

    { // Serialize and deserialize "coordinates" that do not correspond to any point on the curve
        BB_DISABLE_ASSERTS(); // Avoid on_curve assertion failure in cycle_group constructor
        Builder builder;

        curve::Grumpkin::AffineElement group_element_val(12, 100);
        grumpkin_element<Builder> group_element = grumpkin_element<Builder>::from_witness(&builder, group_element_val);
        this->check_conversion(group_element, /* valid circuit */ false);
    }

    { // Serialize and deserialize the point at infinity
        Builder builder;

        grumpkin_element<Builder> group_element =
            grumpkin_element<Builder>::from_witness(&builder, curve::Grumpkin::AffineElement::infinity());
        this->check_conversion(group_element);
    }
}

TYPED_TEST(stdlib_field_conversion, DeserializePointAtInfinity)
{
    using Builder = TypeParam;
    using Codec = StdlibCodec<field_t<Builder>>;
    Builder builder;
    const fr<Builder> zero(fr<Builder>::from_witness_index(&builder, builder.zero_idx()));

    {
        std::vector<fr<Builder>> zeros(4, zero);

        bn254_element<Builder> point_at_infinity =
            Codec::template deserialize_from_fields<bn254_element<Builder>>(zeros);

        EXPECT_TRUE(point_at_infinity.is_point_at_infinity().get_value());
        EXPECT_TRUE(CircuitChecker::check(builder));
    }
    {
        std::vector<fr<Builder>> zeros(2, zero);

        grumpkin_element<Builder> point_at_infinity =
            Codec::template deserialize_from_fields<grumpkin_element<Builder>>(zeros);

        EXPECT_TRUE(point_at_infinity.is_point_at_infinity().get_value());
        EXPECT_TRUE(CircuitChecker::check(builder));
    }
}

/**
 * @brief Field conversion test for std::array<fr<Builder>, N>
 */
TYPED_TEST(stdlib_field_conversion, FieldConversionArrayBn254Fr)
{
    using Builder = TypeParam;
    Builder builder;

    // Constructing std::array objects with fr<Builder> values
    std::array<fr<Builder>, 4> array_of_frs_4{
        fr<Builder>(&builder, 1), fr<Builder>(&builder, 2), fr<Builder>(&builder, 3), fr<Builder>(&builder, 4)
    };
    this->check_conversion_iterable(array_of_frs_4);

    std::array<fr<Builder>, 7> array_of_frs_7{ fr<Builder>(&builder, bb::fr::modulus_minus_two),
                                               fr<Builder>(&builder, bb::fr::modulus_minus_two - 123),
                                               fr<Builder>(&builder, 215215125),
                                               fr<Builder>(&builder, 102701750),
                                               fr<Builder>(&builder, 367032),
                                               fr<Builder>(&builder, 12985028),
                                               fr<Builder>(&builder, bb::fr::modulus_minus_two - 125015028) };
    this->check_conversion_iterable(array_of_frs_7);
}

/**
 * @brief Field conversion test for std::array<fq<Builder>, N>
 */
TYPED_TEST(stdlib_field_conversion, FieldConversionArrayGrumpkinFr)
{
    using Builder = TypeParam;
    Builder builder;

    // Constructing std::array objects with fq<Builder> values
    std::array<fq<Builder>, 4> array_of_fqs_4{
        fq<Builder>::from_witness(
            &builder,
            static_cast<bb::fq>(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"))),
        fq<Builder>::from_witness(
            &builder,
            static_cast<bb::fq>(std::string("2bf1eaf87f7d27e8dc4056e9af975985bccc89077a21891d6c7b6ccce0631f95"))),
        fq<Builder>::from_witness(
            &builder,
            static_cast<bb::fq>(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"))),
        fq<Builder>::from_witness(
            &builder,
            static_cast<bb::fq>(std::string("018555a8eb50cf07f64b019ebaf3af3c925c93e631f3ecd455db07bbb52bbdd3"))),
    };
    this->check_conversion_iterable(array_of_fqs_4);
}

/**
 * @brief Field conversion test for Univariate<fr<Builder>, N>
 */
TYPED_TEST(stdlib_field_conversion, FieldConversionUnivariateBn254Fr)
{
    using Builder = TypeParam;
    Builder builder;

    // Constructing Univariate objects with fr<Builder> values
    Univariate<fr<Builder>, 4> univariate{
        { fr<Builder>(&builder, 1), fr<Builder>(&builder, 2), fr<Builder>(&builder, 3), fr<Builder>(&builder, 4) }
    };
    this->check_conversion_iterable(univariate);
}

/**
 * @brief Field conversion test for Univariate<fq<Builder>, N>
 */
TYPED_TEST(stdlib_field_conversion, FieldConversionUnivariateGrumpkinFr)
{
    using Builder = TypeParam;
    Builder builder;

    // Constructing std::array objects with fq<Builder> values
    Univariate<fq<Builder>, 4> univariate{
        { fq<Builder>::from_witness(
              &builder,
              static_cast<bb::fq>(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"))),
          fq<Builder>::from_witness(
              &builder,
              static_cast<bb::fq>(std::string("2bf1eaf87f7d27e8dc4056e9af975985bccc89077a21891d6c7b6ccce0631f95"))),
          fq<Builder>::from_witness(
              &builder,
              static_cast<bb::fq>(std::string("018555a8eb50cf07f64b019ebaf3af3c925c93e631f3ecd455db07bbb52bbdd3"))),
          fq<Builder>::from_witness(
              &builder,
              static_cast<bb::fq>(std::string("2bf1eaf87f7d27e8dc4056e9af975985bccc89077a21891d6c7b6ccce0631f95"))) }
    };
    this->check_conversion_iterable(univariate);
}

// ============================================================================
// Gate Count Tests for Deserialization Operations
// ============================================================================

/**
 * @brief Measure gate counts for scalar (fr) deserialization
 * @details Must be zero gates, as it's the "native" field type of our circuits.
 */
TYPED_TEST(stdlib_field_conversion, GateCountScalarDeserialization)
{
    // Scalar deserialization adds no gates (just witness creation)
    this->template check_deserialization_gate_count<fr<TypeParam>>([] { return bb::fr::random_element(); }, 0);
}

/**
 * @brief Measure gate counts for bigfield deserialization
 */
TYPED_TEST(stdlib_field_conversion, GateCountBigfieldDeserialization)
{
    // Deserializing a single bigfield element is expensive due to creating new ranges for range constraints
    this->template check_deserialization_gate_count<fq<TypeParam>>([] { return bb::fq::random_element(); }, 3483);
}

/**
 * @brief Measure gate counts for multiple bigfield deserializations
 * @details Range constraints are batched, making subsequent bigfields much cheaper
 */
TYPED_TEST(stdlib_field_conversion, GateCountMultipleBigfieldDeserialization)
{
    this->template check_deserialization_gate_count<fq<TypeParam>>([] { return bb::fq::random_element(); }, 3608, 10);
}

/**
 * @brief Measure gate counts for BN254 point deserialization
 * @details Includes bigfield reconstruction + point-at-infinity check + on-curve validation
 */
TYPED_TEST(stdlib_field_conversion, GateCountBN254PointDeserialization)
{
    using Builder = TypeParam;
    // Ultra: full bigfield construction + on-curve validation
    // Mega: only is_infinity check, range constraint and on_curve validation deferred to ECCVM and Translator
    constexpr uint32_t expected = std::is_same_v<Builder, bb::UltraCircuitBuilder> ? 3789 : 5;
    this->template check_deserialization_gate_count<bn254_element<Builder>>(
        [] { return curve::BN254::AffineElement::random_element(); }, expected);
}

/**
 * @brief Measure gate counts for multiple BN254 point deserializations
 */
TYPED_TEST(stdlib_field_conversion, GateCountMultipleBN254PointDeserialization)
{
    using Builder = TypeParam;

    constexpr uint32_t expected = std::is_same_v<Builder, bb::UltraCircuitBuilder> ? 4986 : 50;
    this->template check_deserialization_gate_count<bn254_element<Builder>>(
        [] { return curve::BN254::AffineElement::random_element(); }, expected, 10);
}

/**
 * @brief Measure gate counts for Grumpkin point deserialization
 * @details Includes point-at-infinity check + on-curve validation
 */
TYPED_TEST(stdlib_field_conversion, GateCountGrumpkinPointDeserialization)
{
    this->template check_deserialization_gate_count<grumpkin_element<TypeParam>>(
        [] { return curve::Grumpkin::AffineElement::random_element(); }, 10);
}

/**
 * @brief Measure gate counts for array deserialization
 * @details Arrays of scalars add no gates
 */
TYPED_TEST(stdlib_field_conversion, GateCountArrayDeserialization)
{
    constexpr size_t SIZE = 8;
    this->template check_deserialization_gate_count<std::array<fr<TypeParam>, SIZE>>(
        [] {
            std::array<bb::fr, SIZE> arr;
            for (size_t i = 0; i < SIZE; ++i) {
                arr[i] = bb::fr::random_element();
            }
            return arr;
        },
        0);
}

/**
 * @brief Measure gate counts for univariate deserialization
 * @details Same as array - no gates added
 */
TYPED_TEST(stdlib_field_conversion, GateCountUnivariateDeserialization)
{
    constexpr size_t LENGTH = 8;
    this->template check_deserialization_gate_count<Univariate<fr<TypeParam>, LENGTH>>(
        [] {
            std::array<bb::fr, LENGTH> evals;
            for (size_t i = 0; i < LENGTH; ++i) {
                evals[i] = bb::fr::random_element();
            }
            return Univariate<bb::fr, LENGTH>(evals);
        },
        0);
}

/**
 * @brief Failure test for deserializing a pair of limbs as a bigfield, where one of the limbs exceeds the strict 2^136
 * upper bound.
 */
TYPED_TEST(stdlib_field_conversion, BigfieldDeserializationFails)
{
    // Need to bypass an out-of-circuit range check
    BB_DISABLE_ASSERTS();
    using Builder = TypeParam;
    using Codec = StdlibCodec<field_t<Builder>>;

    Builder builder;

    bb::fr low_limb = bb::fr(0);
    // Create a limb from the value 2^136,  that does not satisfy the condition < 2^136.
    bb::fr high_limb = bb::fr(uint256_t(1) << (2 * fq<Builder>::NUM_LIMB_BITS));
    info(high_limb);

    std::vector<field_t<Builder>> circuit_fields = { field_t<Builder>::from_witness(&builder, low_limb),
                                                     field_t<Builder>::from_witness(&builder, high_limb) };

    // Deserialize as bigfield - this creates the bigfield from the two limbs
    [[maybe_unused]] auto bigfield_val = Codec::template deserialize_from_fields<fq<Builder>>(circuit_fields);

    // Circuit should fail validation
    EXPECT_FALSE(CircuitChecker::check(builder));
}

} // namespace bb::stdlib::field_conversion_tests
