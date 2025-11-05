#include "blake3s.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/blake3s/blake3s.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <cassert>
#include <cstdint>
#include <vector>

using namespace bb;
using namespace bb::stdlib;

#ifdef FUZZING_SHOW_INFORMATION
#define PRINT_BYTESTRING(header, bs)                                                                                   \
    {                                                                                                                  \
        std::cout << header;                                                                                           \
        for (const uint8_t& x : bs) {                                                                                  \
            std::cout << std::hex << std::uppercase << std::setw(2) << std::setfill('0') << static_cast<int>(x);       \
        }                                                                                                              \
        std::cout << std::endl;                                                                                        \
    }
#else
#define PRINT_BYTESTRING(header, bs)
#endif

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* Data, size_t Size)
{
    if (Size == 0 || Size > 1024)
        return 0;
    UltraCircuitBuilder builder;
    std::vector<uint8_t> input_vec(Data, Data + Size);

#ifdef FUZZING_SHOW_INFORMATION
    PRINT_BYTESTRING("Hashing: ", input_vec);
#endif

    byte_array<UltraCircuitBuilder> input(&builder, input_vec);
    auto output_bits = Blake3s<UltraCircuitBuilder>::hash(input);
    auto output_str = output_bits.get_value();
    std::vector<uint8_t> circuit_output(output_str.begin(), output_str.end());

#ifdef FUZZING_SHOW_INFORMATION
    PRINT_BYTESTRING("circuit output: ", circuit_output);
#endif

    auto expected = blake3::blake3s(input_vec);

#ifdef FUZZING_SHOW_INFORMATION
    PRINT_BYTESTRING("Expected: ", expected);
#endif

    assert(circuit_output == expected);
    assert(bb::CircuitChecker::check(builder));
    return 0;
}
