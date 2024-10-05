include(FetchContent)

# Find the path where we will download the jemalloc github repository
# we need this to find where the jemalloc header files are for inclusion.
set(JEMALLOC_INCLUDE "${CMAKE_BINARY_DIR}/_deps/jemalloc-src/public")

# # Work around an issue finding threads.
# set(CMAKE_THREAD_LIBS_INIT "-lpthread")

# Download the jemalloc github project and do an add_subdirectory on it.
FetchContent_Declare(jemalloc
    GIT_REPOSITORY https://github.com/jemalloc/jemalloc
    GIT_TAG 54eaed1d8b56b1aa528be3bdd1877e59c56fa90c
)
FetchContent_MakeAvailable(jemalloc)
