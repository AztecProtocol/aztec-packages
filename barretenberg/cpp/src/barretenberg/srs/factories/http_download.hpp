#pragma once
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <cstdint>

#ifdef __clang__
#pragma clang diagnostic push
// -Wdeprecated-literal-operator is only available in Clang 18+, ignore unknown warnings for Apple Clang
#pragma clang diagnostic ignored "-Wunknown-warning-option"
#pragma clang diagnostic ignored "-Wdeprecated-literal-operator"
#pragma clang diagnostic ignored "-Wunused-parameter"
#pragma clang diagnostic ignored "-Wsign-conversion"
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

#include <chrono>
#include <string>
#include <thread>
#include <vector>

namespace bb::srs {

/**
 * @brief Download data from a URL with optional Range header support
 *
 * Retries on transient failures (connection errors, 5xx, 429) with exponential
 * backoff so a momentary CDN/network blip doesn't propagate as a hard failure.
 *
 * @param url Full URL (e.g., "http://crs.aztec-cdn.foundation/g1.dat")
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
    httplib::Client cli("http://" + host);
    cli.set_follow_location(true);
    cli.set_connection_timeout(30);
    cli.set_read_timeout(60);

    // Prepare headers
    httplib::Headers headers;
    if (end_byte > 0 && end_byte >= start_byte) {
        headers.emplace("Range", "bytes=" + std::to_string(start_byte) + "-" + std::to_string(end_byte));
    }

    constexpr int max_attempts = 3;
    // Bound retry-induced latency: each retry attempt uses tighter timeouts than the first try
    // so the worst-case extra time (backoffs + retry attempts) stays under ~15s.
    // Math: backoff 1s + 2s + 2 retries * 5s timeout = 13s.
    constexpr int retry_timeout_seconds = 5;

    std::chrono::milliseconds backoff{ 1000 };
    std::string last_error;
    for (int attempt = 1; attempt <= max_attempts; ++attempt) {
        if (attempt == 2) {
            cli.set_connection_timeout(retry_timeout_seconds);
            cli.set_read_timeout(retry_timeout_seconds);
        }

        auto res = cli.Get(path.c_str(), headers);

        if (res && (res->status == 200 || res->status == 206)) {
            const std::string& body = res->body;
            return std::vector<uint8_t>(body.begin(), body.end());
        }

        bool retryable = false;
        if (!res) {
            last_error = httplib::to_string(res.error());
            retryable = true;
        } else {
            last_error = "status " + std::to_string(res->status);
            // Retry on 5xx and 429 (rate limit); other 4xx are client errors and won't change with retry.
            retryable = res->status >= 500 || res->status == 429;
        }

        if (!retryable || attempt == max_attempts) {
            throw_or_abort("HTTP request failed for " + url + ": " + last_error + " (after " + std::to_string(attempt) +
                           " attempt" + (attempt == 1 ? "" : "s") + ")");
        }

        vinfo("HTTP download of ", url, " failed (", last_error, "), retrying in ", backoff.count(), "ms");
        std::this_thread::sleep_for(backoff);
        backoff *= 2;
    }
    // Unreachable: loop above either returns on success or throws on the final attempt.
    throw_or_abort("HTTP request failed for " + url + ": " + last_error);
#endif
}
} // namespace bb::srs
