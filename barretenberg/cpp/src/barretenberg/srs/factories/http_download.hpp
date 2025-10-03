#pragma once
#include "barretenberg/common/throw_or_abort.hpp"
#include <cstdint>

#ifdef __clang__
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-literal-operator"
#pragma clang diagnostic ignored "-Wunused-parameter"
#endif
#ifdef __GNUC__
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-parameter"
#endif
#ifndef __wasm__
#include <httplib.h>
#endif
#ifdef __GNUC__
#pragma GCC diagnostic pop
#endif
#ifdef __clang__
#pragma clang diagnostic pop
#endif

#include <string>
#include <vector>

namespace bb::srs {

/**
 * @brief Download data from a URL with optional Range header support
 * @param url Full URL (e.g., "http://crs.aztec.network/g1.dat")
 * @param start_byte Starting byte for range request (0 for no range)
 * @param end_byte Ending byte for range request (0 for no range)
 * @return Downloaded data as bytes
 */
inline std::vector<uint8_t> http_download([[maybe_unused]] const std::string& url,
                                          [[maybe_unused]] size_t start_byte = 0,
                                          [[maybe_unused]] size_t end_byte = 0)
{
#ifdef __wasm__
    throw_or_abort("HTTP download not supported in WASM");
#else
    // Parse URL into host and path
    size_t proto_end = url.find("://");
    if (proto_end == std::string::npos) {
        throw_or_abort("Invalid URL format: " + url);
    }

    size_t host_start = proto_end + 3;
    size_t path_start = url.find('/', host_start);
    if (path_start == std::string::npos) {
        throw_or_abort("Invalid URL format: " + url);
    }

    std::string host = url.substr(host_start, path_start - host_start);
    std::string path = url.substr(path_start);

    // Create HTTP client (non-SSL)
    httplib::Client cli(("http://" + host).c_str());
    cli.set_follow_location(true);
    cli.set_connection_timeout(30);
    cli.set_read_timeout(60);

    // Prepare headers
    httplib::Headers headers;
    if (end_byte > 0 && end_byte >= start_byte) {
        headers.emplace("Range", "bytes=" + std::to_string(start_byte) + "-" + std::to_string(end_byte));
    }

    // Download
    auto res = cli.Get(path.c_str(), headers);

    if (!res) {
        throw_or_abort("HTTP request failed for " + url + ": " + httplib::to_string(res.error()));
    }

    if (res->status != 200 && res->status != 206) {
        throw_or_abort("HTTP request failed for " + url + " with status " + std::to_string(res->status));
    }

    // Convert string body to vector<uint8_t>
    const std::string& body = res->body;
    return std::vector<uint8_t>(body.begin(), body.end());
#endif
}
} // namespace bb::srs
