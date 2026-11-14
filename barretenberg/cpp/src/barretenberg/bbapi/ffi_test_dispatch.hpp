#pragma once
/**
 * @file ffi_test_dispatch.hpp
 * @brief Test helper: runs wire commands through the in-process FFI entry, the dispatch every
 * client (bb.js, barretenberg-rs, the IPC server) goes through.
 */
#include "barretenberg/bbapi/generated/bb_ffi.hpp"
#include "barretenberg/bbapi/generated/bb_types.hpp"
#include "barretenberg/bbapi/generated/ipc_codegen/msgpack_adaptor.hpp"
#include "barretenberg/bbapi/generated/ipc_codegen/msgpack_include.hpp"
#include <stdexcept>
#include <string>

namespace bb::bbapi::ffi_test {

/** A response from the FFI entry: its named-union tag and payload. */
struct FfiResponse {
    std::string type;
    msgpack::object_handle handle;

    const msgpack::object& payload() const { return handle.get().via.array.ptr[1]; }
    bool is_error() const { return type == wire::BbErrorResponse::MSGPACK_SCHEMA_NAME; }
    std::string error_message() const { return payload().as<wire::BbErrorResponse>().message; }
};

/** Sends `cmd` to the FFI entry under the command name `name` (by default, its own). */
template <typename Cmd> FfiResponse ffi_call(const Cmd& cmd, const std::string& name = Cmd::MSGPACK_SCHEMA_NAME)
{
    // Request framing: [[CommandName, payload]], the named-union pair inside a one-element argument array.
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(name);
    pk.pack(cmd);

    uint8_t* out = nullptr;
    size_t out_len = 0;
    bb_ipc_ffi_entry(reinterpret_cast<const uint8_t*>(buf.data()), buf.size(), &out, &out_len);
    auto handle = msgpack::unpack(reinterpret_cast<const char*>(out), out_len);
    bb_ipc_ffi_free(out);
    auto type = handle.get().via.array.ptr[0].as<std::string>();
    return { .type = std::move(type), .handle = std::move(handle) };
}

/** Sends `cmd` and returns its `Response`; throws with the error message if the command failed. */
template <typename Response, typename Cmd> Response ffi_call_ok(const Cmd& cmd)
{
    auto response = ffi_call(cmd);
    if (response.type != Response::MSGPACK_SCHEMA_NAME) {
        throw std::runtime_error(response.is_error() ? response.error_message()
                                                     : "unexpected response " + response.type);
    }
    return response.payload().template as<Response>();
}

} // namespace bb::bbapi::ffi_test
