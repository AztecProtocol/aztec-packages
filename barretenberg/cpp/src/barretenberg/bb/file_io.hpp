#pragma once
#include <barretenberg/common/log.hpp>
#include <cstdint>
#include <fcntl.h>
#include <fstream>
#include <ios>
#include <sys/stat.h>
#include <unistd.h>
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
    struct stat st;
    if (stat(filename.c_str(), &st) == 0 && S_ISFIFO(st.st_mode)) {
        // Writing to a pipe or file descriptor
        int fd = open(filename.c_str(), O_WRONLY);
        if (fd == -1) {
            throw std::runtime_error("Failed to open file descriptor: " + filename);
        }

        size_t total_written = 0;
        size_t data_size = data.size();
        while (total_written < data_size) {
            ssize_t written = write(fd, data.data() + total_written, data_size - total_written);
            if (written == -1) {
                close(fd);
                throw std::runtime_error("Failed to write to file descriptor: " + filename);
            }
            total_written += static_cast<size_t>(written);
        }
        close(fd);
    } else {
        std::ofstream file(filename, std::ios::binary);
        if (!file) {
            throw std::runtime_error("Failed to open data file for writing: " + filename);
        }
        file.write((char*)data.data(), (std::streamsize)data.size());
        file.close();
    }
}