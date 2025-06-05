include(FetchContent)

# Find the path where we will download the Tracy github repository
# we need this to find where the Tracy header files are for inclusion.
set(TRACY_INCLUDE "${CMAKE_BINARY_DIR}/_deps/tracy-src/public")

# Work around an issue finding threads.
set(CMAKE_THREAD_LIBS_INIT "-lpthread")

# Download the Tracy github project and do an add_subdirectory on it.
FetchContent_Declare(tracy
    GIT_REPOSITORY https://github.com/wolfpld/tracy
    GIT_TAG 5d542dc09f3d9378d005092a4ad446bd405f819a
)
FetchContent_MakeAvailable(tracy)
