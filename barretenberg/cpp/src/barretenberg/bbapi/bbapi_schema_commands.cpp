#include "bbapi_execute.hpp"

namespace bb::bbapi {
void pack_msgpack_command_schema(MsgpackSchemaPacker& packer)
{
    _msgpack_schema_pack(packer, Command{});
}
} // namespace bb::bbapi
