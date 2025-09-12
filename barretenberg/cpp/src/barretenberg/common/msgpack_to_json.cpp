#include "barretenberg/common/try_catch_shim.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include <sstream>

namespace bb {
std::string msgpack_to_json(msgpack::object const& o, size_t max_chars)
{
    std::stringstream ss;
    ss << o;
    std::string ret = ss.str();
    if (max_chars > 0 && ret.size() > max_chars) {
        ret = ret.substr(0, max_chars) + "...";
    }
    return ret;
}
} // namespace bb
