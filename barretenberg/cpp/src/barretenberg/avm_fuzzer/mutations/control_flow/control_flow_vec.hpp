#pragma once

#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"

void mutate_control_flow_vec(std::vector<CFGInstruction>& control_flow_vec, std::mt19937_64& rng);
