#pragma once
#include "control_flow.hpp"
#include "fuzzer_data.hpp"
#include "simulator.hpp"

/// @brief fuzz CPP vs JS simulator with the given fuzzer data
/// Throws an exception if the simulator results are different
void fuzz(FuzzerData& fuzzer_data);
