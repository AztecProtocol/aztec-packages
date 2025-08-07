#include "blake3s.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/blake3s/blake3s.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <cassert>
#include <cstdint>
#include <vector>

using namespace bb;
using namespace bb::stdlib;

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* Data, size_t Size)
{
    if (Size == 0)
        return 0;
    UltraCircuitBuilder builder;
    std::vector<uint8_t> input_vec(Data, Data + Size);
    byte_array<UltraCircuitBuilder> input(&builder, input_vec);
    auto output_bits = Blake3s<UltraCircuitBuilder>::hash(input);
    auto output_str = output_bits.get_value();
    std::vector<uint8_t> circuit_output(output_str.begin(), output_str.end());

    auto expected = blake3::blake3s(input_vec);

    assert(circuit_output == expected);
    assert(bb::CircuitChecker::check(builder));
    return 0;
}