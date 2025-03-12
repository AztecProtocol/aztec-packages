# The protobuf compiler should be installed on the builder machine;
# the job here is to find where its C libraries are located, e.g.
# under /usr/include/google/protobuf, so that we can include their headers.
# See docs at https://cmake.org/cmake/help/latest/module/FindProtobuf.html
# See source at https://fossies.org/linux/cmake/Modules/FindProtobuf.cmake or /usr/share/cmake-3.28/Modules/FindProtobuf.cmake

# include(FindProtobuf)

#list(APPEND CMAKE_PREFIX_PATH "/usr/local/lib/cmake/protobuf")
set(Protobuf_DIR "/usr/local/lib/cmake/protobuf")

# TODO: This errors saying it cannot find `Protobuf_INCLUDE_DIR`, unless we build protobuf from source.
# find_package(Protobuf REQUIRED)
find_package(Protobuf CONFIG REQUIRED)

message("   --> PROTOBUF Found: ${Protobuf_FOUND}")
message("   --> PROTOBUF VERSION: ${Protobuf_VERSION}")
message("   --> PROTOBUF LIB: ${PROTOBUF_LIBRARIES}")
message("   --> PROTOBUF INCLUDE: ${PROTOBUF_INCLUDE_DIRS}")

# set(Protobuf_INCLUDE_DIR "/usr/include/google/protobuf")
# set(Protobuf_INCLUDE_DIRS "/usr/include/google/protobuf")
include_directories(${Protobuf_INCLUDE_DIRS})

# Add this to what needs to use protobuf:
# target_link_libraries(<bin or lib> ${Protobuf_LIBRARIES})

# TODO: We should be able to generate .pb.h and .pb.cc files from the .proto files
# using the `protobuf_generate_cpp` command, instead of using `cpp/scripts/codegen_dsl.sh`
