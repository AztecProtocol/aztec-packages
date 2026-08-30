#include "barretenberg/bbapi/bbapi_schema.hpp"

#include "barretenberg/bbapi/generated/bb_schema_embed.hpp"

namespace bb::bbapi {

// `bb msgpack schema` output: the checked-in bb_schema.json verbatim. The
// schema file is the wire contract every consumer (this server's dispatch,
// bb.js, barretenberg-rs) generates from, so the binary reports exactly the
// contract it was built against.
std::string get_bb_schema_as_json()
{
    return std::string(k_bb_schema_json);
}

} // namespace bb::bbapi
