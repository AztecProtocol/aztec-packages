#pragma once
#include <barretenberg/common/log.hpp>
#include <cstdint>
#include <fstream>
#include <ios>
#include <vector>

inline size_t get_file_size(std::string const& filename)
{
    // Open the file in binary mode and move to the end.
    std::ifstream file(filename, std::ios::binary | std::ios::ate);
    if (!file) {
        return 0;
    }

    file.seekg(0, std::ios::end);
    return (size_t)file.tellg();
}

inline std::vector<uint8_t> read_file(const std::string& filename, size_t bytes = 0)
{
    // Standard input. We'll iterate over the stream and reallocate.
    if (filename == "-") {
        return { (std::istreambuf_iterator<char>(std::cin)), std::istreambuf_iterator<char>() };
    }

    std::ifstream file(filename, std::ios::binary);
    if (!file) {
        throw std::runtime_error("Unable to open file: " + filename);
    }

    // Unseekable, pipe or process substitution. We'll iterate over the stream and reallocate.
    if (!file.seekg(0, std::ios::end)) {
        file.clear();
        return { (std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>() };
    }

    // Get the file size.
    auto size = static_cast<size_t>(file.tellg());
    file.seekg(0, std::ios::beg);

    // Create a vector preallocated with enough space for the file data and read it.
    auto to_read = bytes == 0 ? size : bytes;
    std::vector<uint8_t> fileData(to_read);
    file.read(reinterpret_cast<char*>(fileData.data()), (std::streamsize)to_read);
    return fileData;
}

inline void write_file(const std::string& filename, std::vector<uint8_t> const& data)
{
    std::ofstream file(filename, std::ios::binary);
    if (!file) {
        throw std::runtime_error("Failed to open data file for writing: " + filename);
    }
    file.write((char*)data.data(), (std::streamsize)data.size());
    file.close();
}