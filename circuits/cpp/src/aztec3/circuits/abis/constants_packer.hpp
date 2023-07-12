#pragma once
#include "msgpack/v3/adaptor/detail/cpp11_define_map_decl.hpp"

#include "aztec3/constants.hpp"

#include "barretenberg/serialize/msgpack_impl/name_value_pair_macro.hpp"

namespace aztec3::circuits::abis {

// Represents constants during serialization (only)
struct ConstantsPacker {
    template <typename Packer> void msgpack_pack(Packer& packer) const
    {
        auto pack = [&](auto&... args) {
            msgpack::type::define_map<decltype(args)...>{ args... }.msgpack_pack(packer);
        };
        pack(NVP(ARGS_LENGTH, RETURN_VALUES_LENGTH));
    }
};

}  // namespace aztec3::circuits::abis