include(FetchContent)

FetchContent_Declare(
    httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG v0.15.3
    FIND_PACKAGE_ARGS
)

# Disable SSL/TLS support to avoid OpenSSL dependency
set(HTTPLIB_REQUIRE_OPENSSL OFF CACHE BOOL "")
set(HTTPLIB_USE_OPENSSL_IF_AVAILABLE OFF CACHE BOOL "")
set(HTTPLIB_USE_ZLIB_IF_AVAILABLE OFF CACHE BOOL "")
set(HTTPLIB_USE_BROTLI_IF_AVAILABLE OFF CACHE BOOL "")

FetchContent_MakeAvailable(httplib)

if(NOT httplib_FOUND)
    set_property(DIRECTORY ${httplib_SOURCE_DIR} PROPERTY EXCLUDE_FROM_ALL)
    set_property(DIRECTORY ${httplib_BINARY_DIR} PROPERTY EXCLUDE_FROM_ALL)
endif()
