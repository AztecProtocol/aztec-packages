#pragma once
#include "barretenberg/serialize/cbind_fwd.hpp"
#include <span>
#include <string_view>
#include <vector>

namespace bb::bbapi {
enum class MsgpackCommandError {
    None,
    ExpectedArgumentTuple,
    ExpectedCommandTuple,
    ExpectedCommandName,
};

struct MsgpackCommandResult {
    std::vector<uint8_t> response;
    bool shutdown = false;
    MsgpackCommandError error = MsgpackCommandError::None;

    bool ok() const { return error == MsgpackCommandError::None; }
};

MsgpackCommandResult execute_msgpack_command_buffer(std::span<const uint8_t> request);
std::vector<uint8_t> encode_msgpack_error_response(std::string_view message);
std::string_view msgpack_command_error_message(MsgpackCommandError error, bool cli_context = false);
} // namespace bb::bbapi

// Forward declaration for CBIND
CBIND_DECL(bbapi)
