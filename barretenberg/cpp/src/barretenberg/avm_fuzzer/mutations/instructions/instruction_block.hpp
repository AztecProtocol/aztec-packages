#pragma once

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include <random>
#include <vector>

std::vector<FuzzInstruction> generate_instruction_block(std::mt19937_64& rng);
void mutate_instruction_block(std::vector<FuzzInstruction>& instruction_block, std::mt19937_64& rng);
