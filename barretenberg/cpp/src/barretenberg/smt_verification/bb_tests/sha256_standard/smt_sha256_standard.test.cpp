#include "barretenberg/stdlib/hash/sha256/sha256.hpp"
#include "barretenberg/stdlib/primitives/packed_byte_array/packed_byte_array.hpp"
#include "barretenberg/stdlib/primitives/uint/uint.hpp"

#include "barretenberg/smt_verification/circuit/circuit.hpp"
#include "barretenberg/smt_verification/util/smt_util.hpp"

#include <gtest/gtest.h>

using namespace bb;
using namespace smt_circuit;

using bool_ct = stdlib::bool_t<StandardCircuitBuilder>;
using witness_ct = stdlib::witness_t<StandardCircuitBuilder>;
using byte_array_ct = stdlib::byte_array<StandardCircuitBuilder>;
using uint_ct = stdlib::uint32<StandardCircuitBuilder>;
 
namespace {
auto& engine = numeric::get_debug_randomness();
}

// constexpr uint32_t round_constants[64]{
//     0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
//     0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
//     0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
//     0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
//     0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
//     0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
//     0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
//     0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
// };

template<typename FF>
void rol(std::vector<FF> &block,  size_t n){
    for(size_t i = 0; i < n; i++){
        FF tmp = block.pop_back();
        block.insert(block.begin(), tmp);
    }
}

TEST(sha256, equality1){
    StandardCircuitBuilder builder;
    uint_ct e = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct f = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct g = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));

    uint_ct ch1 = (e & f) + (~e & g);
    uint_ct ch2 = (e & f) ^ (~e & g);

    builder.set_variable_name(ch1.get_witness_index(), "ch1");
    builder.set_variable_name(ch2.get_witness_index(), "ch2");

    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);


    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());
    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);
    Circuit<FFTerm> circuit(circuit_info, &s);   
    circuit["ch1"] != circuit["ch2"];

    bool res = s.check();
    info(res);
    if(!res){
        return;
    }
    default_model_single({"f", "e", "g"}, circuit, &s);
}   

TEST(sha256, equality2){
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
    uint_ct c = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
        
    uint_ct T0 = (b & c);
    uint_ct ch1 = (a & (b + c - (T0 + T0))) + T0;
    uint_ct ch2 = (a & b) ^ (a & c) ^ (b & c);

    builder.set_variable_name(ch1.get_witness_index(), "ch1");
    builder.set_variable_name(ch2.get_witness_index(), "ch2");
    info("Variables: ", builder.get_num_variables());
    info("Constraints: ", builder.num_gates);


    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());
    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);
    Circuit<FFTerm> circuit(circuit_info, &s);   

    circuit["ch1"] != circuit["ch2"];

    bool res = s.check();
    info(res);
    if(!res){
        return;
    }
    default_model_single({"a", "b", "c"}, circuit, &s);
} 

//TEST(sha256, compression){
//    StandardCircuitBuilder builder;
//    uint_ct a = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
//    uint_ct b = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
//    uint_ct c = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
//    uint_ct d = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
//    uint_ct e = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
//    uint_ct f = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
//    uint_ct g = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
//    uint_ct h = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
//    uint_ct w = witness_ct(&builder, static_cast<uint32_t>(bb::fr::random_element()));
//    uint32_t i = static_cast<uint32_t>(uint256_t(bb::fr::random_element()).slice(0, 6));
//
//    uint_ct S1 = e.ror(6U) ^ e.ror(11U) ^ e.ror(25U);
//    uint_ct ch = (e & f) + (~e & g);
//    uint_ct temp1 = h + S1 + ch + round_constants[i] + w;
//    uint_ct S0 = a.ror(2U) ^ a.ror(13U) ^ a.ror(22U);
//    uint_ct T0 = (b & c);
//    uint_ct maj = (a & (b + c - (T0 + T0))) + T0;
//    uint_ct temp2 = S0 + maj;
//    info("Variables: ", builder.get_num_variables());
//    info("Constraints: ", builder.num_gates);
//
//    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());
//    SolverConfiguration config = {true, 0};
//    Solver s(circuit_info.modulus, config, 16);
//    Circuit<FFTerm> circuit(circuit_info, &s);
//
//     
//}


TEST(sha256, unique_witness){
    StandardCircuitBuilder builder;

    std::string in;
    in.resize(32);
    stdlib::packed_byte_array<StandardCircuitBuilder> input(&builder, in);

    auto slices = input.to_unverified_byte_slices(4);

    std::vector<std::string> equal;
    equal.reserve(64);
    for(size_t i = 0; i < 64; i++){
        builder.set_variable_name(slices[i].get_witness_index(), "in" + std::to_string(i));
        equal.push_back("in" + std::to_string(i));
    }
    input = stdlib::sha256<StandardCircuitBuilder>(input);

    CircuitSchema circuit_info = unpack_from_buffer(builder.export_circuit());
    SolverConfiguration config = {true, 0};
    Solver s(circuit_info.modulus, config, 16);

    auto cirs = unique_witness<FFTerm>(circuit_info, &s, equal);

    bool res = s.check();
    info(res);
    if(!res){
        return;
    }
    default_model({}, cirs.first, cirs.second, &s);   
}