#pragma once

#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"

std::vector<FuzzInstruction> generate_instruction_block(std::mt19937_64& rng);
void mutate_instruction_block(std::vector<FuzzInstruction>& instruction_block, std::mt19937_64& rng);
