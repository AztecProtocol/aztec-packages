include(FetchContent)

set(CPP_BASE64_INCLUDE "${CMAKE_BINARY_DIR}/_deps/cpp_base64-src")

FetchContent_Declare(
    cpp_base64
    GIT_REPOSITORY https://github.com/ReneNyffenegger/cpp-base64.git
    GIT_TAG V2.rc.08
)

FetchContent_GetProperties(cpp_base64)
if(NOT cpp_base64_POPULATED)
    FetchContent_Populate(cpp_base64)
endif()

# Create static library for cpp-base64 with warnings disabled
add_library(base64 STATIC ${cpp_base64_SOURCE_DIR}/base64.cpp)
target_include_directories(base64 SYSTEM PUBLIC ${cpp_base64_SOURCE_DIR})
target_compile_options(base64 PRIVATE -Wno-sign-conversion -Wno-error)
