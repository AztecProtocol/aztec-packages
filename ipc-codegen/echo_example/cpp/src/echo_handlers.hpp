// Echo service handlers: the template specializations the header-only generated
// dispatch calls, shared by the socket server (echo_server.cpp) and the
// in-process FFI entry (echo_ffi.cpp). Declared here so every translation unit
// that instantiates make_echo_handler() sees them first.
#pragma once

#include "generated/echo_dispatch.hpp"

namespace echo {

struct EchoCtx {}; // empty context for the echo service

template <>
void handle_bytes(EchoCtx &ctx, wire::EchoBytes &&cmd,
                  Responder<wire::EchoBytesResponse> respond);
template <>
void handle_fields(EchoCtx &ctx, wire::EchoFields &&cmd,
                   Responder<wire::EchoFieldsResponse> respond);
template <>
void handle_nested(EchoCtx &ctx, wire::EchoNested &&cmd,
                   Responder<wire::EchoNestedResponse> respond);
template <>
void handle_aliases(EchoCtx &ctx, wire::EchoAliases &&cmd,
                    Responder<wire::EchoAliasesResponse> respond);
template <>
void handle_blobs(EchoCtx &ctx, wire::EchoBlobs &&cmd,
                  Responder<wire::EchoBlobsResponse> respond);
template <>
void handle_fail(EchoCtx &ctx, wire::EchoFail &&cmd,
                 Responder<wire::EchoFailResponse> respond);

} // namespace echo
