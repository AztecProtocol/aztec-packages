// A native store's whole-file operations, on the file system (SQLite's own VFS does its I/O).
#include "store.hpp"

#include <cstdio>
#include <fstream>
#include <iterator>
#include <stdexcept>

namespace aztec::kv::files {

Bytes read(const std::string& path)
{
    std::ifstream file(path, std::ios::binary);
    if (!file) {
        throw std::runtime_error("could not read " + path);
    }
    return Bytes(std::istreambuf_iterator<char>(file), std::istreambuf_iterator<char>());
}

void remove(const std::string& path)
{
    std::remove(path.c_str());
}

} // namespace aztec::kv::files
