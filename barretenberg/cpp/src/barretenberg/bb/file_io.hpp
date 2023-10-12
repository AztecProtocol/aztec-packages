#pragma once
#include <barretenberg/common/log.hpp>
#include <cstdint>
#include <fstream>
#include <ios>
#include <vector>

inline std::streamsize get_file_size(const std::string& filename)
{
    // Open the file in binary mode and move to the end.
    std::ifstream file(filename, std::ios::binary | std::ios::ate);
    if (!file) {
        throw std::runtime_error("Unable to open file: " + filename);
    }

    return file.tellg();
}

inline std::vector<uint8_t> read_file(const std::string& filename, size_t bytes = 0)
{
    std::streamsize size;
    if (bytes == 0) {
        size = get_file_size(filename);
    } else {
        size = (std::streamsize)bytes;
    }

    if (size <= 0) {
        throw std::runtime_error("File is empty or there's an error reading it: " + filename);
    }

    std::vector<uint8_t> fileData(static_cast<size_t>(size));

    // Since the file was closed after getting its size,
    // we need to open it again.
    std::ifstream file(filename, std::ios::binary);
    file.read(reinterpret_cast<char*>(fileData.data()), size);

    return fileData;
}

inline void write_file(const std::string& filename, std::vector<uint8_t> const& data)
{
    std::ofstream file(filename, std::ios::binary);
    if (!file) {
        throw std::runtime_error("Failed to open data file for writing");
    }
    file.write((char*)data.data(), (std::streamsize)data.size());
    file.close();
}