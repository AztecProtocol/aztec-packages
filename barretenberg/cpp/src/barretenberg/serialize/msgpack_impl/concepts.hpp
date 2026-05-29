#pragma once

// HasMsgPack / MsgpackConstructible / DoNothing live in ipc-runtime alongside
// the struct-map msgpack adaptor that uses them (single source of truth).
#include "ipc_codegen/msgpack_adaptor.hpp"

namespace msgpack_concepts {

// Bb-specific concepts for the schema-introspection and custom-pack paths
// (these aren't ipc-codegen concerns).
template <typename T>
concept HasMsgPackSchema = requires(const T t, DoNothing nop) { t.msgpack_schema(nop); };

template <typename T>
concept HasMsgPackPack = requires(T t, DoNothing nop) { t.msgpack_pack(nop); };

} // namespace msgpack_concepts
