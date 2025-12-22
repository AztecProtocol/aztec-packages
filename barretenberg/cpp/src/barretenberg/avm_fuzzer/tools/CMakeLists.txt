# CLI tools for the AVM fuzzer

# corpus_seed - Convert bytecode JSON files to fuzzer corpus entries (FuzzerData)
add_executable(corpus_seed corpus_seed.cpp)
target_link_libraries(corpus_seed PRIVATE
    avm_fuzzer
    vm2
    crypto_sha256
    nlohmann_json::nlohmann_json
)

# corpus_seed_tx - Convert TS ExecutionHints JSON to FuzzerTxData corpus entries
add_executable(corpus_seed_tx corpus_seed_tx.cpp)
target_link_libraries(corpus_seed_tx PRIVATE
    avm_fuzzer
    vm2
    crypto_sha256
    nlohmann_json::nlohmann_json
)

# corpus_from_avm_inputs - Convert AvmCircuitInputs msgpack to FuzzerTxData corpus
# This reads the binary files produced by DumpingCppPublicTxSimulator
add_executable(corpus_from_avm_inputs corpus_from_avm_inputs.cpp)
target_link_libraries(corpus_from_avm_inputs PRIVATE
    avm_fuzzer
    vm2
    crypto_sha256
)
