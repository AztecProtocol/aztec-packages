include(FetchContent)

# msgpack-c is used header-only. SOURCE_SUBDIR names a directory without a CMakeLists.txt, so
# FetchContent_MakeAvailable only fetches it and never configures msgpack-c's own targets.
FetchContent_Declare(
    msgpack
    GIT_REPOSITORY https://github.com/msgpack/msgpack-c.git
    GIT_TAG cpp-7.0.0
    GIT_SHALLOW TRUE
    SOURCE_SUBDIR include
)
FetchContent_MakeAvailable(msgpack)
set(MSGPACK_INCLUDE "${msgpack_SOURCE_DIR}/include")
