#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/stdlib/hash/sha256/sha256.hpp"
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include "barretenberg/stdlib/primitives/packed_byte_array/packed_byte_array.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include "barretenberg/numeric/bitop/rotate.hpp"
#include "barretenberg/numeric/bitop/sparse_form.hpp"
#include "barretenberg/numeric/random/engine.hpp"

using namespace bb;
using namespace bb::stdlib;

using Builder = UltraCircuitBuilder;

using byte_array_ct = byte_array<Builder>;
using packed_byte_array_ct = packed_byte_array<Builder>;
using field_ct = field_t<Builder>;

constexpr uint64_t ror(uint64_t val, uint64_t shift)
{
    return (val >> (shift & 31U)) | (val << (32U - (shift & 31U)));
}

std::array<uint64_t, 64> extend_witness(std::array<uint64_t, 16>& in)
{
    std::array<uint64_t, 64> w;

    for (size_t i = 0; i < 16; ++i) {
        w[i] = in[i];
    }

    for (size_t i = 16; i < 64; ++i) {
        uint64_t left = w[i - 15];
        uint64_t right = w[i - 2];

        uint64_t left_rot7 = numeric::rotate32((uint32_t)left, 7);
        uint64_t left_rot18 = numeric::rotate32((uint32_t)left, 18);
        uint64_t left_sh3 = left >> 3;

        uint64_t right_rot17 = numeric::rotate32((uint32_t)right, 17);
        uint64_t right_rot19 = numeric::rotate32((uint32_t)right, 19);
        uint64_t right_sh10 = right >> 10;

        uint64_t s0 = left_rot7 ^ left_rot18 ^ left_sh3;
        uint64_t s1 = right_rot17 ^ right_rot19 ^ right_sh10;

        w[i] = w[i - 16] + w[i - 7] + s0 + s1;
    }
    return w;
}
std::array<uint64_t, 8> inner_block(std::array<uint64_t, 64>& w)
{
    constexpr uint32_t init_constants[8]{ 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                          0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };

    constexpr uint32_t round_constants[64]{
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    };
    uint32_t a = init_constants[0];
    uint32_t b = init_constants[1];
    uint32_t c = init_constants[2];
    uint32_t d = init_constants[3];
    uint32_t e = init_constants[4];
    uint32_t f = init_constants[5];
    uint32_t g = init_constants[6];
    uint32_t h = init_constants[7];
    for (size_t i = 0; i < 64; ++i) {
        uint32_t S1 = numeric::rotate32((uint32_t)e, 6U) ^ numeric::rotate32((uint32_t)e, 11U) ^
                      numeric::rotate32((uint32_t)e, 25U);
        uint32_t ch = (e & f) ^ (~e & g); // === (e & f) ^ (~e & g), `+` op is cheaper
        uint32_t temp1 = h + S1 + ch + round_constants[i] + (uint32_t)w[i];
        uint32_t S0 = numeric::rotate32((uint32_t)a, 2U) ^ numeric::rotate32((uint32_t)a, 13U) ^
                      numeric::rotate32((uint32_t)a, 22U);
        uint32_t maj = (a & b) ^ (a & c) ^ (b & c); // (a & (b + c - (T0 * 2))) + T0; // === (a & b) ^ (a & c) ^ (b & c)
        uint32_t temp2 = S0 + maj;

        h = g;
        g = f;
        f = e;
        e = d + temp1;
        d = c;
        c = b;
        b = a;
        a = temp1 + temp2;
    }

    /**
     * Add into previous block output and return
     **/
    std::array<uint64_t, 8> output;
    output[0] = (uint32_t)(a + init_constants[0]);
    output[1] = (uint32_t)(b + init_constants[1]);
    output[2] = (uint32_t)(c + init_constants[2]);
    output[3] = (uint32_t)(d + init_constants[3]);
    output[4] = (uint32_t)(e + init_constants[4]);
    output[5] = (uint32_t)(f + init_constants[5]);
    output[6] = (uint32_t)(g + init_constants[6]);
    output[7] = (uint32_t)(h + init_constants[7]);
    return output;
}

TEST(ultra_circuit_constructor, test_sha256_55_bytes)
{
    // 55 bytes is the largest number of bytes that can be hashed in a single block,
    // accounting for the single padding bit, and the 64 size bits required by the SHA-256 standard.
    auto builder = Builder();
    packed_byte_array_ct input(&builder, "An 8 character password? Snow White and the 7 Dwarves..");

    packed_byte_array_ct output_bits = stdlib::sha256(input);

    std::vector<field_ct> output = output_bits.to_unverified_byte_slices(4);

    info("num gates = ", builder.get_num_gates());

    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    graph.print_connected_components();
}

HEAVY_TEST(ultra_circuit_constructor, test_graph_for_sha256_NIST_vector_five)
{
    typedef stdlib::field_t<UltraCircuitBuilder> field_pt;
    typedef stdlib::packed_byte_array<UltraCircuitBuilder> packed_byte_array_pt;

    auto builder = UltraCircuitBuilder();

    packed_byte_array_pt input(
        &builder,
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        "AAAAAAAAAA");

    packed_byte_array_pt output_bits = stdlib::sha256<bb::UltraCircuitBuilder>(input);

    std::vector<field_pt> output = output_bits.to_unverified_byte_slices(4);

    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
}