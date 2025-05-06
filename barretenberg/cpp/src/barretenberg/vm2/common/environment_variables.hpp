#pragma once

namespace bb::avm2 {

enum class EnvironmentVariable : uint8_t {
    ADDRESS,
    SENDER,
    TRANSACTIONFEE,
    CHAINID,
    VERSION,
    BLOCKNUMBER,
    TIMESTAMP,
    FEEPERL2GAS,
    FEEPERDAGAS,
    ISSTATICCALL,
    L2GASLEFT,
    DAGASLEFT,
};

} // namespace bb::avm2
