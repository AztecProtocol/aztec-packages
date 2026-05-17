#include "barretenberg/serialize/msgpack_impl.hpp"
#include "bbapi_schema.hpp"

namespace bb::bbapi {
void pack_msgpack_command_schema_first(MsgpackSchemaPacker& packer);
void pack_msgpack_command_schema_second(MsgpackSchemaPacker& packer);

void pack_msgpack_command_schema(MsgpackSchemaPacker& packer)
{
    packer.pack_array(2);
    packer.pack("named_union");
    packer.pack_array(62);
    pack_msgpack_command_schema_first(packer);
    pack_msgpack_command_schema_second(packer);
}
} // namespace bb::bbapi
