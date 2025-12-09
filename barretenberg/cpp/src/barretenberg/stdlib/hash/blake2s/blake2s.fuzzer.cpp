#include "blake2s.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/blake2s/blake2s.hpp"
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
            std::cout << "0x" << std::hex << std::uppercase << std::setw(2) << std::setfill('0')                       \
                      << static_cast<int>(x) << ", " << std::dec;                                                      \
        }                                                                                                              \
        std::cout << std::endl;                                                                                        \
    }
#else
#define PRINT_BYTESTRING(header, bs)
#endif

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* Data, size_t Size)
{
    if (Size == 0) {
        return 0;
    }
    UltraCircuitBuilder builder;
    std::vector<uint8_t> input_vec(Data, Data + Size);

    PRINT_BYTESTRING("Hashing: ", input_vec);

    byte_array<UltraCircuitBuilder> input(&builder, input_vec);
    auto output_bits = Blake2s<UltraCircuitBuilder>::hash(input);
    auto output_str = output_bits.get_value();
    std::vector<uint8_t> circuit_output(output_str.begin(), output_str.end());

    auto expected_arr = bb::crypto::blake2s(input_vec);
    std::vector<uint8_t> expected(expected_arr.begin(), expected_arr.end());

    PRINT_BYTESTRING("circuit output: ", circuit_output);
    PRINT_BYTESTRING("Expected:       ", expected);

    assert(circuit_output == expected);
    assert(bb::CircuitChecker::check(builder));
    return 0;
}