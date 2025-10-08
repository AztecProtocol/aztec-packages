#include <iomanip>
#include <iostream>
#include <random>
#include <string>
#include <vector>

#include "barretenberg/serialize/msgpack_impl.hpp"
#include "fuzz_lib/control_flow.hpp"
#include "fuzz_lib/fuzz.hpp"
#include "fuzz_lib/fuzzer_data.hpp"
#include "mutations/fuzzer_data.hpp"

using FuzzInstruction = ::FuzzInstruction;

SimulatorResult fuzz(const uint8_t* buffer, size_t size)
{
    FuzzerData deserialized_data;
    try {
        msgpack::unpack((reinterpret_cast<const char*>(buffer)), size).get().convert(deserialized_data);
    } catch (const std::exception& e) {
        deserialized_data = FuzzerData();
    }
    std::cout << "Deserialized data: " << deserialized_data << std::endl;
    auto res = fuzz(deserialized_data);

    return res;
}

extern "C" size_t LLVMFuzzerCustomMutator(uint8_t* serialized_fuzzer_data,
                                          size_t serialized_fuzzer_data_size,
                                          size_t max_size,
                                          unsigned int seed)
{
    auto rng = std::mt19937_64(seed);
    FuzzerData deserialized_data;
    try {
        msgpack::unpack((reinterpret_cast<const char*>(serialized_fuzzer_data)), serialized_fuzzer_data_size)
            .get()
            .convert(deserialized_data);
    } catch (const std::exception& e) {
        deserialized_data = FuzzerData();
    }
    mutate_fuzzer_data(deserialized_data, rng);
    auto [mutated_serialized_fuzzer_data, mutated_serialized_fuzzer_data_size] =
        msgpack_encode_buffer(deserialized_data);
    // std::cout << "Mutated serialized fuzzer data: " << deserialized_data << std::endl;
    if (mutated_serialized_fuzzer_data_size > max_size) {
        //???
        return 0;
    }

    memcpy(serialized_fuzzer_data, mutated_serialized_fuzzer_data, mutated_serialized_fuzzer_data_size);
    delete[] mutated_serialized_fuzzer_data;

    return mutated_serialized_fuzzer_data_size;
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    fuzz(data, size);
    return 0;
}
