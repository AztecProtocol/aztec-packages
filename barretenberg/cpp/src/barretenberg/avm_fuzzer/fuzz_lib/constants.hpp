#pragma once
#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

#include <cstdlib>
#include <functional>

using namespace bb::avm2;
using EthAddress = FF;
using AztecAddress = FF;

const FF CHAIN_ID = 1;
const FF VERSION = 1;
const uint32_t BLOCK_NUMBER = 1;
const FF SLOT_NUMBER = 1;
const uint64_t TIMESTAMP = 1000000;
const EthAddress COINBASE = EthAddress{ 0 };
const AztecAddress FEE_RECIPIENT = AztecAddress{ 0 };
const uint128_t FEE_PER_DA_GAS = 1;
const uint128_t FEE_PER_L2_GAS = 1;
const std::string TRANSACTION_HASH = "0xdeadbeef";
const GasFees EFFECTIVE_GAS_FEES = GasFees{ .fee_per_da_gas = 0, .fee_per_l2_gas = 0 };
const FF FIRST_NULLIFIER = FF("0x00000000000000000000000000000000000000000000000000000000deadbeef");
const std::vector<FF> NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS = { FIRST_NULLIFIER };
const std::vector<FF> NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES = {};
const std::vector<ScopedL2ToL1Message> NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MESSAGES = {};
const std::vector<FF> REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS = {};
const std::vector<FF> REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES = {};
const std::vector<ScopedL2ToL1Message> REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MESSAGES = {};
const std::vector<PublicCallRequestWithCalldata> SETUP_ENQUEUED_CALLS = {};
const FF MSG_SENDER = 100;
const std::optional<PublicCallRequestWithCalldata> TEARDOWN_ENQUEUED_CALLS = std::nullopt;
const Gas GAS_USED_BY_PRIVATE = Gas{ .l2_gas = 0, .da_gas = 0 };
const AztecAddress FEE_PAYER = AztecAddress{ 0 };
const FF CONTRACT_ADDRESS = 42;
const FF TRANSACTION_FEE = 0;
const bool IS_STATIC_CALL = false;
const Gas GAS_LIMIT = Gas{ .l2_gas = 1000000, .da_gas = 1000000 };
// Fuzzer-specific logging macro (similar to vinfo but uses AVM_FUZZER_LOGGING env var)
// Uses lazy evaluation to avoid string formatting overhead when logging is disabled
inline void fuzz_info_(std::function<std::string()> func)
{
    static const bool enabled = std::getenv("AVM_FUZZER_LOGGING") != nullptr;
    if (enabled) {
        info(func());
    }
}

#define fuzz_info(...) fuzz_info_([&]() { return format(__VA_ARGS__); })

// =========== Pre defined functions ===========
// Taken from ADD_8 test in fuzz.test.cpp
const std::vector<uint8_t> ADD_8_BYTECODE = { 39, 0,  0, 2, 5, 39, 0, 1, 2,  2, 0, 0, 0, 1,
                                              2,  40, 0, 0, 5, 4,  0, 1, 59, 0, 0, 5, 0, 2 };

const std::vector<std::vector<uint8_t>> PREDEFINED_FUNCTIONS = { ADD_8_BYTECODE };
