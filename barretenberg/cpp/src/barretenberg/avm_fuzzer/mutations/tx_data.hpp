#pragma once

#include <functional>
#include <optional>
#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::fuzzer {

void mutate_tx(Tx& tx, std::vector<AztecAddress>& contract_addresses, std::mt19937_64& rng);

// GasSettings mutation
void mutate_gas_settings(GasSettings& gas_settings, std::mt19937_64& rng);

// Gas mutation
void mutate_gas(Gas& gas, std::mt19937_64& rng);

// GasFees mutation
void mutate_gas_fees(GasFees& fees, std::mt19937_64& rng);

// Field vector mutation
void mutate_ff_vec(std::vector<FF>& vec, std::mt19937_64& rng, size_t max_size = 10);

// L2ToL1Msg vector mutation
void mutate_l2_to_l1_msg(ScopedL2ToL1Message& vec, std::mt19937_64& rng);
ScopedL2ToL1Message generate_l2_to_l1_msg(std::mt19937_64& rng);

// Boolean vector mutation
void mutate_bool_vec(std::vector<bool>& vec, size_t target_size, std::mt19937_64& rng);

void mutate_fuzzer_data_vec(std::vector<FuzzerData>& enqueued_calls, std::mt19937_64& rng, size_t max_size = 10);

void mutate_public_call_request(PublicCallRequestWithCalldata& request,
                                std::vector<AztecAddress>& contract_addreses,
                                std::mt19937_64& rng);
PublicCallRequestWithCalldata generate_public_call_request(std::vector<AztecAddress>& contract_addresses,
                                                           std::mt19937_64& rng);

} // namespace bb::avm2::fuzzer
