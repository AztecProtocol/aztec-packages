#pragma once
/**
 * @file wsdb_test_options.hpp
 * @brief aztec-wsdb's Init options, encoded as a client sends them.
 */
#include <msgpack.hpp>

#include <cstdint>
#include <string>
#include <utility>
#include <vector>

namespace azteclabs::wsdb::test_support {

/** Options with the stores in `data_dir`, on `threads` threads, and the given { treeId, sizeKb } map sizes. */
inline std::vector<uint8_t> wsdb_options(const std::string& data_dir,
                                         uint32_t threads,
                                         const std::vector<std::pair<uint32_t, uint64_t>>& map_sizes = {})
{
    msgpack::sbuffer buffer;
    msgpack::packer<msgpack::sbuffer> packer(buffer);
    packer.pack_map(map_sizes.empty() ? 2 : 3);
    packer.pack("dataDir");
    packer.pack(data_dir);
    packer.pack("threads");
    packer.pack(threads);
    if (!map_sizes.empty()) {
        packer.pack("mapSizes");
        packer.pack_array(static_cast<uint32_t>(map_sizes.size()));
        for (const auto& [tree_id, size_kb] : map_sizes) {
            packer.pack_map(2);
            packer.pack("treeId");
            packer.pack(tree_id);
            packer.pack("sizeKb");
            packer.pack(size_kb);
        }
    }
    return { reinterpret_cast<const uint8_t*>(buffer.data()),
             reinterpret_cast<const uint8_t*>(buffer.data()) + buffer.size() };
}

} // namespace azteclabs::wsdb::test_support
