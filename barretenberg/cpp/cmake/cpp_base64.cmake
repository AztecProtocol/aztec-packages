include(FetchContent)

FetchContent_Declare(
    cpp_base64
    GIT_REPOSITORY https://github.com/ReneNyffenegger/cpp-base64.git
    GIT_TAG V2.rc.09
    FIND_PACKAGE_ARGS
)

FetchContent_MakeAvailable(cpp_base64)

if(NOT cpp_base64_FOUND)
    set_property(DIRECTORY ${cpp_base64_SOURCE_DIR} PROPERTY EXCLUDE_FROM_ALL)
    set_property(DIRECTORY ${cpp_base64_BINARY_DIR} PROPERTY EXCLUDE_FROM_ALL)
endif()
