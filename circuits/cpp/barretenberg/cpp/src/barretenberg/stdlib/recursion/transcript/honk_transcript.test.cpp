#include <gtest/gtest.h>

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/honk/transcript/transcript.hpp"
#include "barretenberg/stdlib/recursion/transcript/honk_trancript.hpp"

namespace proof_system::plonk::stdlib::recursion::honk {

// TODO(Cody): Testing only one circuit type.
using Builder = UltraCircuitBuilder;

using field_t = stdlib::field_t<Builder>;
using bool_t = stdlib::bool_t<Builder>;
using uint32 = stdlib::uint<Builder, uint32_t>;
using witness_t = stdlib::witness_t<Builder>;
using byte_array = stdlib::byte_array<Builder>;
using fq_t = stdlib::bigfield<Builder, barretenberg::Bn254FqParams>;
using group_t = stdlib::element<Builder, fq_t, field_t, barretenberg::g1>;
using transcript_ct = Transcript<Builder>;


struct TestData {
    std::vector<barretenberg::g1::affine_element> g1_elements;
    std::vector<barretenberg::fr> fr_elements;
    std::vector<barretenberg::fr> public_input_elements;
    size_t num_public_inputs;
};

TestData get_test_data()
{
    TestData data;
    for (size_t i = 0; i < 32; ++i) {
        data.g1_elements.push_back(barretenberg::g1::affine_element(barretenberg::g1::element::random_element()));
        data.fr_elements.push_back(barretenberg::fr::random_element());
    }
    data.fr_elements[2] = barretenberg::fr(0);
    data.fr_elements[3] = barretenberg::fr(0);
    data.num_public_inputs = 13;
    for (size_t i = 0; i < data.num_public_inputs; ++i) {
        data.public_input_elements.push_back(barretenberg::fr::random_element());
    }
    return data;
}


TEST(stdlib_honk_transcript, basic_transcript_operations)
{
    TestData data = get_test_data();

    Builder builder;

    transcript_ct transcript{};

    EXPECT_EQ(true, true);
}
} // namespace proof_system::plonk::stdlib::recursion::honk