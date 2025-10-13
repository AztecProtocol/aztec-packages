include(FetchContent)

set(HTTPLIB_INCLUDE "${CMAKE_BINARY_DIR}/_deps/httplib-src")

FetchContent_Declare(
    httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG v0.15.3
)

# Disable SSL/TLS support to avoid OpenSSL dependency
set(HTTPLIB_REQUIRE_OPENSSL OFF CACHE BOOL "")
set(HTTPLIB_USE_OPENSSL_IF_AVAILABLE OFF CACHE BOOL "")
set(HTTPLIB_USE_ZLIB_IF_AVAILABLE OFF CACHE BOOL "")
set(HTTPLIB_USE_BROTLI_IF_AVAILABLE OFF CACHE BOOL "")

FetchContent_GetProperties(httplib)
if(NOT httplib_POPULATED)
    FetchContent_Populate(httplib)
endif()

# Create interface library for httplib
add_library(httplib_headers INTERFACE)
target_include_directories(httplib_headers SYSTEM INTERFACE ${httplib_SOURCE_DIR})
