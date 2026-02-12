#include "generator_data.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <gtest/gtest.h>
#include <vector>

namespace bb::crypto {

TEST(GeneratorContext, DeriveDefaultGenerators)
{
    auto default_generators = generator_data<curve::Grumpkin>::precomputed_generators;
    std::vector<grumpkin::g1::affine_element> expected_default_generators;

    expected_default_generators.emplace_back(grumpkin::g1::affine_element(
        { fr(uint256_t("083e7911d835097629f0067531fc15cafd79a89beecb39903f69572c636f4a5a")),
          fr(uint256_t("1a7f5efaad7f315c25a918f30cc8d7333fccab7ad7c90f14de81bcc528f9935d")) }));
    expected_default_generators.emplace_back(grumpkin::g1::affine_element(
        { fr(uint256_t("054aa86a73cb8a34525e5bbed6e43ba1198e860f5f3950268f71df4591bde402")),
          fr(uint256_t("209dcfbf2cfb57f9f6046f44d71ac6faf87254afc7407c04eb621a6287cac126")) }));
    expected_default_generators.emplace_back(grumpkin::g1::affine_element(
        { fr(uint256_t("1c44f2a5207c81c28a8321a5815ce8b1311024bbed131819bbdaf5a2ada84748")),
          fr(uint256_t("03aaee36e6422a1d0191632ac6599ae9eba5ac2c17a8c920aa3caf8b89c5f8a8")) }));
    expected_default_generators.emplace_back(grumpkin::g1::affine_element(
        { fr(uint256_t("26d8b1160c6821a30c65f6cb47124afe01c29f4338f44d4a12c9fccf22fb6fb2")),
          fr(uint256_t("05c70c3b9c0d25a4c100e3a27bf3cc375f8af8cdd9498ec4089a823d7464caff")) }));
    expected_default_generators.emplace_back(grumpkin::g1::affine_element(
        { fr(uint256_t("20ed9c6a1d27271c4498bfce0578d59db1adbeaa8734f7facc097b9b994fcf6e")),
          fr(uint256_t("29cd7d370938b358c62c4a00f73a0d10aba7e5aaa04704a0713f891ebeb92371")) }));
    expected_default_generators.emplace_back(grumpkin::g1::affine_element(
        { fr(uint256_t("0224a8abc6c8b8d50373d64cd2a1ab1567bf372b3b1f7b861d7f01257052d383")),
          fr(uint256_t("2358629b90eafb299d6650a311e79914b0215eb0a790810b26da5a826726d711")) }));
    expected_default_generators.emplace_back(grumpkin::g1::affine_element(
        { fr(uint256_t("0f106f6d46bc904a5290542490b2f238775ff3c445b2f8f704c466655f460a2a")),
          fr(uint256_t("29ab84d472f1d33f42fe09c47b8f7710f01920d6155250126731e486877bcf27")) }));
    expected_default_generators.emplace_back(grumpkin::g1::affine_element(
        { fr(uint256_t("0298f2e42249f0519c8a8abd91567ebe016e480f219b8c19461d6a595cc33696")),
          fr(uint256_t("035bec4b8520a4ece27bd5aafabee3dfe1390d7439c419a8c55aceb207aac83b")) }));

    EXPECT_EQ(default_generators.size(), expected_default_generators.size());
    for (size_t i = 0; i < default_generators.size(); ++i) {
        EXPECT_EQ(default_generators[i], expected_default_generators[i]);
    }

    // Verifies that the hard-coded precomputed generators match the derivation
    EXPECT_TRUE((bb::check_precomputed_generators<grumpkin::g1,
                                                  bb::detail::DomainSeparator("DEFAULT_DOMAIN_SEPARATOR"),
                                                  generator_data<curve::Grumpkin>::DEFAULT_NUM_GENERATORS>()));
}

// Tests generator_data<Grumpkin>::get() for different domain separators, num_generators, and offsets.
TEST(GeneratorContext, GeneratorDataGetVariousCases)
{
    generator_data<curve::Grumpkin> generator_d;

    constexpr size_t default_num_generators = generator_data<curve::Grumpkin>::DEFAULT_NUM_GENERATORS; // 8
    constexpr std::string_view default_domain_separator =
        generator_data<curve::Grumpkin>::DEFAULT_DOMAIN_SEPARATOR;         // "DEFAULT_DOMAIN_SEPARATOR"
    constexpr std::string_view domain_separator = "TEST_DOMAIN_SEPARATOR"; // custom non-default domain

    // Choose (n, offset) pairs that hit reach various branches in get(): (1) n+offset < 8, (2) n+offset == 8,
    // (3)n+offset > 8
    struct Case {
        size_t num_generators;
        size_t offset;
    };
    constexpr std::array<Case, 3> cases{ { { 5, 0 }, { 6, 2 }, { 9, 1 } } };

    // Test both default and non-default domain separators
    constexpr std::array<std::string_view, 2> domains{ { default_domain_separator, domain_separator } };

    for (auto domain : domains) {
        for (auto test_case : cases) {
            const size_t num_generators = test_case.num_generators;
            const size_t offset = test_case.offset;

            // Compute generators using get()
            auto generators = generator_d.get(num_generators, offset, domain);
            ASSERT_EQ(generators.size(), num_generators);

            auto derived_generators =
                grumpkin::g1::derive_generators(domain, num_generators + offset, /*starting_index=*/0);
            ASSERT_EQ(derived_generators.size(), num_generators + offset);

            for (size_t i = 0; i < num_generators; ++i) {
                EXPECT_EQ(generators[i], derived_generators[offset + i]);
            }

            const bool is_default_domain = (domain == default_domain_separator);

            // For default-domain and num_generators + offset <= default_num_generators, the values must match
            // precomputed_generators.
            if (is_default_domain && (num_generators + offset <= default_num_generators)) {
                auto default_generators = generator_data<curve::Grumpkin>::precomputed_generators;
                ASSERT_GE(default_generators.size(), num_generators + offset);

                for (size_t i = 0; i < num_generators; ++i) {
                    EXPECT_EQ(generators[i], default_generators[offset + i]);
                }
            }
        }
    }
}

} // namespace bb::crypto
