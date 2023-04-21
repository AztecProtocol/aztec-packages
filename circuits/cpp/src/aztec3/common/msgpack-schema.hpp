#pragma once

#define MSGPACK_NO_BOOST
#include "msgpack-cbind.hpp"
#include <cxxabi.h>

namespace msgpack {

template <typename T>
concept TupleLike = requires(T a) {
                        std::tuple_size<T>::value;
                        std::get<0>(a);
                    };

template <typename T> struct MsgPackSchema;

struct DefineMapSchema {
    auto operator()() { return std::make_tuple(); }

    auto operator()(auto key, auto value)
    {
        (void)value; // unused except for type
        return std::make_tuple(key, MsgPackSchema<decltype(value)>());
    }

    auto operator()(auto key, auto value, auto&... args)
    {
        (void)value; // unused except for type
        return std::tuple_cat(std::make_tuple(key, MsgPackSchema<decltype(value)>()), (*this)(args...));
    }
};

template <typename T> std::string schema_name()
{
    std::string result = abi::__cxa_demangle(typeid(T).name(), NULL, NULL, NULL);
    if (result.find("basic_string") != std::string::npos) {
        return "string";
    }
    if (result == "i") {
        return "int";
    }
    if (result.find('<') != size_t(-1)) {
        result = result.substr(0, result.find('<'));
    }
    if (result.rfind(':') != size_t(-1)) {
        result = result.substr(result.rfind(':') + 1, result.size());
    }
    return result;
}

template <typename T> struct MsgPackSchema {
    // A viable reference is needed for define_map
    const char* type_name_string = "__typename";
    std::string type_name = schema_name<T>();

    void msgpack_pack(auto& packer) const
        requires msgpack::adaptor::HasMsgPack<T>
    {
        T object;
        object.msgpack([&](auto&... args) {
            msgpack::adaptor::DefineMapArchive ar;
            auto archive_wrapper = [&](auto&... args) { return ar(type_name_string, type_name, args...); };
            auto pack_map_schema = [&](auto&... args) {
                auto schema = DefineMapSchema{}(args...);
                std::apply(archive_wrapper, schema).msgpack_pack(packer);
            };
            std::apply(pack_map_schema, ar(args...).a);
        });
    }

    void msgpack_pack(auto& packer) const
        requires msgpack::adaptor::HasMsgPackFlat<T>
    {
        T object;
        object.msgpack_flat([&](auto&... args) {
            MsgPackSchema schema{ ar(args...).a };
            schema.msg_pack(packer);
        });
    }

    void msgpack_pack(auto& packer) const
        requires TupleLike<T>
    {
        T object;
        msgpack::adaptor::DefineArchive ar;
        auto archive_wrapper = [&](auto&... args) { return ar(type_name, args...); };
        auto pack_array_schema = [&](auto&... args) {
            auto schema = std::make_tuple(MsgPackSchema<std::decay_t<decltype(args)>>{}...);
            std::apply(archive_wrapper, schema).msgpack_pack(packer);
        };
        std::apply(pack_array_schema, object);
    }

    void msgpack_pack(auto& packer) const
        requires(!TupleLike<T> && !msgpack::adaptor::HasMsgPack<T> && !msgpack::adaptor::HasMsgPackFlat<T>)
    {
        packer.pack_str((uint32_t)type_name.size());
        packer.pack_str_body(type_name.c_str(), (uint32_t)type_name.size());
    }
};
void print_schema(auto obj)
{
    msgpack::print(MsgPackSchema<decltype(obj)>{});
}
} // namespace msgpack