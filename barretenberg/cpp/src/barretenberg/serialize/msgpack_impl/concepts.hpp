#pragma once

#ifndef IPC_CODEGEN_MSGPACK_CONCEPTS_DEFINED
#define IPC_CODEGEN_MSGPACK_CONCEPTS_DEFINED

struct DoNothing {
    void operator()(auto...) {}
};

namespace msgpack_concepts {

template <typename T>
concept HasMsgPack = requires(T t, DoNothing nop) { t.msgpack(nop); };

template <typename T, typename... Args>
concept MsgpackConstructible = requires(T object, Args... args) { T{ args... }; };

} // namespace msgpack_concepts

#endif

namespace msgpack_concepts {

template <typename T>
concept HasMsgPackSchema = requires(const T t, DoNothing nop) { t.msgpack_schema(nop); };

template <typename T>
concept HasMsgPackPack = requires(T t, DoNothing nop) { t.msgpack_pack(nop); };

} // namespace msgpack_concepts
