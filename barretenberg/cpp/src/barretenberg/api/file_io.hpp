#pragma once
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/try_catch_shim.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <cstdint>
#include <cstring>
#include <fcntl.h>
#ifndef __wasm__
#include <fstream>
#include <ios>
#include <iostream>
#endif
#include <sstream>
#include <sys/stat.h>
#include <unistd.h>
#include <vector>

namespace bb {
inline size_t get_file_size(std::string const& filename)
{
#ifndef __wasm__
    // Open the file in binary mode and move to the end.
    std::ifstream file(filename, std::ios::binary | std::ios::ate);
    if (!file) {
        return 0;
    }

    file.seekg(0, std::ios::end);
    return (size_t)file.tellg();
#else
    // WASM fallback - use C functions
    FILE* file = fopen(filename.c_str(), "rb");
    if (!file) {
        return 0;
    }

    fseek(file, 0, SEEK_END);
    size_t size = ftell(file);
    fclose(file);
    return size;
#endif
}

inline std::vector<uint8_t> read_file(const std::string& filename, size_t bytes = 0)
{
#ifndef __wasm__
    // Standard input. We'll iterate over the stream and reallocate.
    if (filename == "-") {
        return { (std::istreambuf_iterator<char>(std::cin)), std::istreambuf_iterator<char>() };
    }

    std::ifstream file(filename, std::ios::binary);
    if (!file) {
        THROW std::runtime_error("Unable to open file: " + filename);
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
#else
    // WASM fallback - use C functions
    if (filename == "-") {
        THROW std::runtime_error("stdin reading not supported in WASM");
    }

    FILE* file = fopen(filename.c_str(), "rb");
    if (!file) {
        THROW std::runtime_error("Unable to open file: " + filename);
    }

    // Get file size
    fseek(file, 0, SEEK_END);
    size_t size = ftell(file);
    fseek(file, 0, SEEK_SET);

    auto to_read = bytes == 0 ? size : bytes;
    std::vector<uint8_t> fileData(to_read);
    size_t read_bytes = fread(fileData.data(), 1, to_read, file);
    fclose(file);

    if (read_bytes != to_read) {
        fileData.resize(read_bytes);
    }
    return fileData;
#endif
}

inline void write_file(const std::string& filename, std::vector<uint8_t> const& data)
{
    struct stat st;
    if (stat(filename.c_str(), &st) == 0 && S_ISFIFO(st.st_mode)) {
        // Writing to a pipe or file descriptor
        int fd = open(filename.c_str(), O_WRONLY);
        if (fd == -1) {
            THROW std::runtime_error("Failed to open file descriptor: " + filename);
        }

        size_t total_written = 0;
        size_t data_size = data.size();
        while (total_written < data_size) {
            ssize_t written = ::write(fd, data.data() + total_written, data_size - total_written);
            if (written == -1) {
                close(fd);
                THROW std::runtime_error("Failed to write to file descriptor: " + filename);
            }
            total_written += static_cast<size_t>(written);
        }
        close(fd);
    } else {
#ifndef __wasm__
        std::ofstream file(filename, std::ios::binary);
        if (!file) {
            THROW std::runtime_error("Failed to open data file for writing: " + filename + " (" + strerror(errno) +
                                     ")");
        }
        file.write(reinterpret_cast<const char*>(data.data()), static_cast<std::streamsize>(data.size()));
        file.close();
#else
        // WASM fallback - use C functions
        FILE* file = fopen(filename.c_str(), "wb");
        if (!file) {
            THROW std::runtime_error("Failed to open data file for writing: " + filename + " (" + strerror(errno) +
                                     ")");
        }
        fwrite(data.data(), 1, data.size(), file);
        fclose(file);
#endif
    }
}

template <typename Fr> inline std::string field_elements_to_json(const std::vector<Fr>& fields)
{
    std::stringstream ss;
    ss << "[";
    for (size_t i = 0; i < fields.size(); ++i) {
        ss << '"' << fields[i] << '"';
        if (i != fields.size() - 1) {
            ss << ",";
        }
    }
    ss << "]";
    return ss.str();
}

} // namespace bb
