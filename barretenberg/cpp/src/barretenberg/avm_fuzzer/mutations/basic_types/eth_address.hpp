#pragma once

#include <random>

#include "barretenberg/vm2/common/aztec_types.hpp"

bb::avm2::EthAddress generate_random_eth_address(std::mt19937_64& rng);
