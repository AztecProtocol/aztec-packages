#pragma once

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include <random>
#include <vector>

void mutate_instruction_vec(std::vector<FuzzInstruction>& instructions, std::mt19937_64& rng);
