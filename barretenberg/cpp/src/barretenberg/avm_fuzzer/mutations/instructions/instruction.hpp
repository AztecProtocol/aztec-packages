#pragma once

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include <random>

FuzzInstruction generate_instruction(std::mt19937_64& rng);
void mutate_instruction(FuzzInstruction& instruction, std::mt19937_64& rng);
