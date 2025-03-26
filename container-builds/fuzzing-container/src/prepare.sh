#!/usr/bin/env bash

fuzzers=("stdlib_primitives_bigfield_standard_fuzzer"
         "stdlib_primitives_bigfield_ultra_fuzzer"
         "stdlib_primitives_cycle_group_ultra_fuzzer"
         "stdlib_primitives_bool_standard_fuzzer"
         "stdlib_primitives_field_standard_fuzzer"
         "stdlib_primitives_uint_standard_fuzzer"
         "stdlib_primitives_safe_uint_standard_fuzzer"
         "stdlib_primitives_byte_array_standard_fuzzer"
         "stdlib_primitives_bit_array_standard_fuzzer"
         "commitment_schemes_ipa_fuzzer"
         "translator_vm_translator_circuit_builder_fuzzer"
         "translator_vm_translator_mini_fuzzer"
         );

# Set up the fuzzers
cmake --preset fuzzing;
cmake --build build-fuzzing --target "${fuzzers[@]}";

# Set up the post-crash loggers
cmake --preset fuzzing-asan;
cmake --build build-fuzzing-asan --target "${fuzzers[@]}";
