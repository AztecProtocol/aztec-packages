#pragma once

#include <random>

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"

FuzzInstruction generate_instruction(std::mt19937_64& rng);
void mutate_instruction(FuzzInstruction& instruction, std::mt19937_64& rng);
