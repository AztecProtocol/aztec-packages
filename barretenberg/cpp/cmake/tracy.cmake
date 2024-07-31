include(FetchContent)

set(TRACY_INCLUDE "${CMAKE_BINARY_DIR}/_deps/tracy-src/public")

FetchContent_Declare(tracy
    GIT_REPOSITORY https://github.com/wolfpld/tracy
    GIT_TAG ffb98a972401c246b2348fb5341252e2ba855d00
    SYSTEM          # optional, the tracy include directory will be treated as system directory
)
FetchContent_MakeAvailable(tracy)
