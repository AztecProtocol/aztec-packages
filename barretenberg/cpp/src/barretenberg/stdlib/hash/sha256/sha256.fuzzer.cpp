#include "sha256.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
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
    auto output_bits = SHA256<UltraCircuitBuilder>::hash(input);
    auto output_str = output_bits.get_value();
    auto circuit_output = std::vector<uint8_t>(output_str.begin(), output_str.end());

    auto expected = crypto::sha256(input_vec);

    assert(circuit_output == expected);
    assert(bb::CircuitChecker::check(builder));
    return 0;
}