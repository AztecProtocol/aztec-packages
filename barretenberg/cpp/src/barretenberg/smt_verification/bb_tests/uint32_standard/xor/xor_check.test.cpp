#include "test_values.hpp"

#include <gtest/gtest.h>

using namespace bb;
using namespace smt_circuit;

using bool_ct = stdlib::bool_t<StandardCircuitBuilder>;
using witness_ct = stdlib::witness_t<StandardCircuitBuilder>;
using byte_array_ct = stdlib::byte_array<StandardCircuitBuilder>;
using uint_ct = stdlib::uint32<StandardCircuitBuilder>;

TEST(uint, xor_unique_output_check_via_circuit){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a ^ b;
    builder.set_variable_name(c.get_witness_index(), "c");

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());

    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    Circuit<FFTerm> circuit(circuit_info, &s);

    std::vector<fr> w1;
    w1.reserve(circuit.get_num_vars());

    std::vector<fr> w2;
    w2.reserve(circuit.get_num_vars());

    for(const auto &w: xor_unique_output){
        w1.push_back(w[0]);
        w2.push_back(w[1]);
    }
    ASSERT_TRUE(circuit.simulate_circuit_eval(w1));
    ASSERT_TRUE(circuit.simulate_circuit_eval(w2));
}

TEST(uint, xor_unique_output_check_via_builder){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, 0);
    uint_ct b = witness_ct(&builder, 0);
    builder.set_variable_name(a.get_witness_index(), "a");
    builder.set_variable_name(b.get_witness_index(), "b");
    uint_ct c = a ^ b;
    builder.set_variable_name(c.get_witness_index(), "c");

    for(size_t i = 0; i < builder.get_num_variables(); i++){
        builder.variables[i] = xor_unique_output[i][1];
    }
    ASSERT_EQ(builder.variables[a.get_witness_index()], 0);
    ASSERT_EQ(builder.variables[b.get_witness_index()], 0);
    ASSERT_EQ(builder.variables[c.get_witness_index()], 1);
    ASSERT_TRUE(builder.check_circuit());
}

using base4_decomposition = std::pair<std::vector<bb::fr>, std::vector<bb::fr>>;
base4_decomposition base4(uint32_t el){
    std::vector<bb::fr> limbs;
    limbs.reserve(16);
    for(size_t i = 0; i < 16; i++){
        limbs.emplace_back(el % 4);
        el /= 4;
    }
    std::reverse(limbs.begin(), limbs.end());
    std::vector<bb::fr> accumulators;
    accumulators.reserve(16);
    bb::fr accumulator = 0;
    for(size_t i = 0; i < 16; i++){
        accumulator = accumulator * 4 + limbs[i];
        accumulators.emplace_back(accumulator);
    }
    std::reverse(limbs.begin(), limbs.end());
    std::reverse(accumulators.begin(), accumulators.end());
    return {limbs, accumulators};
}

TEST(uint, xor_stb_patch_check){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(fr::random_element()));
    uint_ct c = a ^ b;

    uint32_t arb_out = 0x1337;
    auto arb_out_b4 = base4(arb_out);

    for(uint32_t i = 15; i < 16; i--){
        uint32_t out_quad_idx = 138 + (15 - i) * 12;
        builder.variables[builder.real_variable_index[out_quad_idx]] = arb_out_b4.first[i];
        builder.variables[builder.real_variable_index[out_quad_idx + 3]] = arb_out_b4.second[i];
    }

    ASSERT_TRUE(builder.check_circuit());
    info(builder.variables[a.get_witness_index()]);
    info(" ^ ");
    info(builder.variables[b.get_witness_index()]);
    info("=");
    info(builder.variables[c.get_witness_index()]);
    info("and always has been...");
}

TEST(uint, xor_logic_patch_check){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(fr::random_element()));
    uint_ct c = a ^ b;

    StandardCircuitBuilder builder1;
    uint_ct a1 = witness_ct(&builder, static_cast<uint32_t>(fr::random_element()));
    uint_ct b1 = witness_ct(&builder, static_cast<uint32_t>(fr::random_element()));
    uint_ct c1 = a ^ b;

    uint32_t arb_out = 0x1337;

    auto arb_out_b4 = base4(arb_out);

    for(uint32_t i = 15; i < 16; i--){
        uint32_t out_quad_idx = 138 + (15 - i) * 12;
        builder.variables[builder.real_variable_index[out_quad_idx]] = arb_out_b4.first[i];
        builder.variables[builder.real_variable_index[out_quad_idx + 3]] = arb_out_b4.second[i];
    }

    ASSERT_TRUE(builder.check_circuit());
    info(builder.variables[a.get_witness_index()]);
    info(" ^ ");
    info(builder.variables[b.get_witness_index()]);
    info("=");
    info(builder.variables[c.get_witness_index()]);
    info("and always has been...");
}