#pragma once
#include "barretenberg/common/throw_or_abort.hpp"
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <vector>

// IMPORTANT do not allow user-controlled strings here as there is an easily-exploitable
// command injection vulnerability if so.
std::vector<uint8_t> exec_pipe(std::string const& command);
