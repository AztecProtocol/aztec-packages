#define MSGPACK_NO_BOOST
#include "msgpack/object_fwd_decl.hpp"

namespace bb {
std::string msgpack_to_json(msgpack::object const& o, size_t max_chars);
}
