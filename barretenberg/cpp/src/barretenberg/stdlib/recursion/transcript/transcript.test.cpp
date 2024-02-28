#include <gtest/gtest.h>

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "transcript.hpp"

namespace {
using namespace bb;
using namespace bb::plonk;
using namespace bb::stdlib::recursion;

// TODO(Cody): Testing only one circuit type.
using Builder = StandardCircuitBuilder;

using field_t = stdlib::field_t<Builder>;
using bool_t = stdlib::bool_t<Builder>;
using uint32 = stdlib::uint<Builder, uint32_t>;
using witness_t = stdlib::witness_t<Builder>;
using byte_array = stdlib::byte_array<Builder>;
using fq_t = stdlib::bigfield<Builder, bb::Bn254FqParams>;
using group_t = stdlib::element<Builder, fq_t, field_t, bb::g1>;
using transcript_ct = Transcript<Builder>;

transcript::Manifest create_manifest(const size_t num_public_inputs)
{
    // add public inputs....
    constexpr size_t g1_size = 64;
    constexpr size_t fr_size = 32;
    const size_t public_input_size = fr_size * num_public_inputs;
    const transcript::Manifest output = transcript::Manifest(
        { transcript::Manifest::RoundManifest(
              { { "circuit_size", 4, true }, { "public_input_size", 4, true } }, "init", 1),
          transcript::Manifest::RoundManifest({ { "public_inputs", public_input_size, false },
                                                { "W_1", g1_size, false },
                                                { "W_2", g1_size, false },
                                                { "W_3", g1_size, false } },
                                              "beta",
                                              2),
          transcript::Manifest::RoundManifest({ { "Z_PERM", g1_size, false } }, "alpha", 1),
          transcript::Manifest::RoundManifest(
              { { "T_1", g1_size, false }, { "T_2", g1_size, false }, { "T_3", g1_size, false } }, "z", 1),
          transcript::Manifest::RoundManifest({ { "w_1", fr_size, false },
                                                { "w_2", fr_size, false },
                                                { "w_3", fr_size, false },
                                                { "w_3_omega", fr_size, false },
                                                { "z_perm_omega", fr_size, false },
                                                { "sigma_1", fr_size, false },
                                                { "sigma_2", fr_size, false },
                                                { "r", fr_size, false },
                                                { "t", fr_size, true } },
                                              "nu",
                                              20),
          transcript::Manifest::RoundManifest(
              { { "PI_Z", g1_size, false }, { "PI_Z_OMEGA", g1_size, false } }, "separator", 1) });
    return output;
}

struct TestData {
    std::vector<g1::affine_element> g1_elements;
    std::vector<fr> fr_elements;
    std::vector<fr> public_input_elements;
    size_t num_public_inputs;
};

TestData get_test_data()
{
    TestData data;
    for (size_t i = 0; i < 32; ++i) {
        data.g1_elements.push_back(bb::g1::affine_element(bb::g1::element::random_element()));
        data.fr_elements.push_back(bb::fr::random_element());
    }
    data.fr_elements[2] = fr(0);
    data.fr_elements[3] = fr(0);
    data.num_public_inputs = 13;
    for (size_t i = 0; i < data.num_public_inputs; ++i) {
        data.public_input_elements.push_back(bb::fr::random_element());
    }
    return data;
}

transcript::Transcript get_test_base_transcript(const TestData& data)
{
    transcript::Transcript transcript =
        transcript::Transcript(create_manifest(data.num_public_inputs), transcript::HashType::PedersenBlake3s, 16);
    transcript.add_element("circuit_size", { 1, 2, 3, 4 });
    transcript.add_element("public_input_size",
                           { static_cast<uint8_t>(data.num_public_inputs >> 24),
                             static_cast<uint8_t>(data.num_public_inputs >> 16),
                             static_cast<uint8_t>(data.num_public_inputs >> 8),
                             static_cast<uint8_t>(data.num_public_inputs) });
    transcript.apply_fiat_shamir("init");

    transcript.add_element("public_inputs", to_buffer(data.public_input_elements));

    transcript.add_element("W_1", data.g1_elements[0].to_buffer());
    transcript.add_element("W_2", data.g1_elements[1].to_buffer());
    transcript.add_element("W_3", data.g1_elements[2].to_buffer());

    transcript.apply_fiat_shamir("beta");

    transcript.add_element("Z_PERM", data.g1_elements[3].to_buffer());

    transcript.apply_fiat_shamir("alpha");

    transcript.add_element("T_1", data.g1_elements[4].to_buffer());
    transcript.add_element("T_2", data.g1_elements[5].to_buffer());
    transcript.add_element("T_3", data.g1_elements[6].to_buffer());

    transcript.apply_fiat_shamir("z");

    transcript.add_element("w_1", data.fr_elements[0].to_buffer());
    transcript.add_element("w_2", data.fr_elements[1].to_buffer());
    transcript.add_element("w_3", data.fr_elements[2].to_buffer());
    transcript.add_element("w_3_omega", data.fr_elements[3].to_buffer());
    transcript.add_element("z_perm_omega", data.fr_elements[4].to_buffer());
    transcript.add_element("sigma_1", data.fr_elements[5].to_buffer());
    transcript.add_element("sigma_2", data.fr_elements[6].to_buffer());
    transcript.add_element("r", data.fr_elements[7].to_buffer());
    transcript.add_element("t", data.fr_elements[8].to_buffer());

    transcript.apply_fiat_shamir("nu");

    transcript.add_element("PI_Z", data.g1_elements[7].to_buffer());
    transcript.add_element("PI_Z_OMEGA", data.g1_elements[8].to_buffer());

    transcript.apply_fiat_shamir("separator");

    return transcript;
}

transcript_ct get_circuit_transcript(Builder* context, const TestData& data)
{
    transcript_ct transcript(context, create_manifest(data.num_public_inputs));
    uint256_t circuit_size_value = uint256_t(4) + (uint256_t(3) << 8) + (uint256_t(2) << 16) + (uint256_t(1) << 24);
    field_t circuit_size(stdlib::witness_t(context, bb::fr(circuit_size_value)));
    field_t public_input_size(stdlib::witness_t(context, bb::fr(data.num_public_inputs)));

    transcript.add_field_element("circuit_size", circuit_size);
    transcript.add_field_element("public_input_size", public_input_size);
    transcript.apply_fiat_shamir("init");

    std::vector<field_t> public_inputs;
    for (size_t i = 0; i < data.num_public_inputs; ++i) {
        public_inputs.push_back(witness_t(context, data.public_input_elements[i]));
    }
    transcript.add_field_element_vector("public_inputs", public_inputs);
    transcript.add_group_element("W_1", transcript_ct::convert_g1(context, data.g1_elements[0]));
    transcript.add_group_element("W_2", transcript_ct::convert_g1(context, data.g1_elements[1]));
    transcript.add_group_element("W_3", transcript_ct::convert_g1(context, data.g1_elements[2]));

    transcript.apply_fiat_shamir("beta");

    transcript.add_group_element("Z_PERM", transcript_ct::convert_g1(context, data.g1_elements[3]));

    transcript.apply_fiat_shamir("alpha");

    transcript.add_group_element("T_1", transcript_ct::convert_g1(context, data.g1_elements[4]));
    transcript.add_group_element("T_2", transcript_ct::convert_g1(context, data.g1_elements[5]));
    transcript.add_group_element("T_3", transcript_ct::convert_g1(context, data.g1_elements[6]));

    transcript.apply_fiat_shamir("z");

    transcript.add_field_element("w_1", field_t(witness_t(context, data.fr_elements[0])));
    transcript.add_field_element("w_2", field_t(witness_t(context, data.fr_elements[1])));
    transcript.add_field_element("w_3", field_t(witness_t(context, data.fr_elements[2])));
    transcript.add_field_element("w_3_omega", field_t(witness_t(context, data.fr_elements[3])));
    transcript.add_field_element("z_perm_omega", field_t(witness_t(context, data.fr_elements[4])));
    transcript.add_field_element("sigma_1", field_t(witness_t(context, data.fr_elements[5])));
    transcript.add_field_element("sigma_2", field_t(witness_t(context, data.fr_elements[6])));
    transcript.add_field_element("r", field_t(witness_t(context, data.fr_elements[7])));
    transcript.add_field_element("t", field_t(witness_t(context, data.fr_elements[8])));

    transcript.apply_fiat_shamir("nu");

    transcript.add_group_element("PI_Z", transcript_ct::convert_g1(context, data.g1_elements[7]));
    transcript.add_group_element("PI_Z_OMEGA", transcript_ct::convert_g1(context, data.g1_elements[8]));

    transcript.apply_fiat_shamir("separator");
    return transcript;
}
} // namespace

TEST(stdlib_transcript, validate_transcript)
{
    TestData data = get_test_data();
    transcript::Transcript normal_transcript = get_test_base_transcript(data);

    Builder builder;

    transcript_ct recursive_transcript = get_circuit_transcript(&builder, data);

    const auto check_challenge = [&normal_transcript, &recursive_transcript](const std::string& challenge_name,
                                                                             const size_t challenge_idx = 0) {
        field_t result = recursive_transcript.get_challenge_field_element(challenge_name, challenge_idx);
        fr expected = fr::serialize_from_buffer(&normal_transcript.get_challenge(challenge_name, challenge_idx)[0]);
        EXPECT_EQ(result.get_value(), expected);
    };

    const auto check_small_element = [&normal_transcript, &recursive_transcript](const std::string& element_name) {
        field_t result = recursive_transcript.get_field_element(element_name);
        std::vector<uint8_t> expected_raw = normal_transcript.get_element(element_name);
        uint256_t expected_u256(0);
        for (size_t i = 0; i < expected_raw.size(); ++i) {
            expected_u256 *= uint256_t(256);
            expected_u256 += uint256_t(expected_raw[i]);
        }
        EXPECT_EQ(result.get_value(), bb::fr(expected_u256));
    };

    const auto check_field_element = [&normal_transcript, &recursive_transcript](const std::string& element_name) {
        field_t result = recursive_transcript.get_field_element(element_name);
        fr expected = fr::serialize_from_buffer(&normal_transcript.get_element(element_name)[0]);
        EXPECT_EQ(result.get_value(), expected);
    };

    const auto check_group_element = [&normal_transcript, &recursive_transcript](const std::string& element_name) {
        group_t recursive_value = recursive_transcript.get_circuit_group_element(element_name);
        g1::affine_element expected =
            g1::affine_element::serialize_from_buffer(&normal_transcript.get_element(element_name)[0]);
        g1::affine_element result{ recursive_value.x.get_value().lo, recursive_value.y.get_value().lo };
        EXPECT_EQ(result, expected);
    };

    const auto check_public_inputs = [&normal_transcript, &recursive_transcript]() {
        std::vector<field_t> result = recursive_transcript.get_field_element_vector("public_inputs");
        std::vector<fr> expected = many_from_buffer<fr>(normal_transcript.get_element("public_inputs"));
        EXPECT_EQ(result.size(), expected.size());
        for (size_t i = 0; i < result.size(); ++i) {
            EXPECT_EQ(result[i].get_value(), expected[i]);
        }
    };
    check_public_inputs();

    check_small_element("circuit_size");

    check_small_element("public_input_size");

    check_challenge("beta", 0);

    check_challenge("beta", 1);

    check_challenge("alpha", 0);

    check_challenge("z", 0);

    for (size_t i = 0; i < 10; ++i) {
        check_challenge("nu", 0);
    }
    check_challenge("separator", 0);

    check_field_element("w_1");
    check_field_element("w_2");
    check_field_element("w_3");
    check_field_element("w_3_omega");
    check_field_element("z_perm_omega");
    check_field_element("sigma_1");
    check_field_element("sigma_2");
    check_field_element("r");
    check_field_element("t");

    check_group_element("W_1");
    check_group_element("W_2");
    check_group_element("W_3");
    check_group_element("Z_PERM");
    check_group_element("T_1");
    check_group_element("T_2");
    check_group_element("T_3");
    check_group_element("PI_Z");
    check_group_element("PI_Z_OMEGA");

    info("builder gates = ", builder.get_num_gates());

    auto result = builder.check_circuit();
    EXPECT_EQ(result, true);
}