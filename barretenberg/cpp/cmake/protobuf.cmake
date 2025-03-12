# The protobuf compiler should be installed on the builder machine;
# the job here is to find where its C libraries are located, e.g.
# under /usr/include/google/protobuf, so that we can include their headers.
# See docs at https://cmake.org/cmake/help/latest/module/FindProtobuf.html
# See source at https://fossies.org/linux/cmake/Modules/FindProtobuf.cmake or /usr/share/cmake-3.28/Modules/FindProtobuf.cmake

include(FindProtobuf)
find_package(Protobuf REQUIRED)
include_directories(${Protobuf_INCLUDE_DIRS})

# Add this to what needs to use protobuf:
# target_link_libraries(<bin or lib> ${Protobuf_LIBRARIES})

# TODO: We should be able to generate .pb.h and .pb.cc files from the .proto files
# using the `protobuf_generate_cpp` command, instead of using `cpp/scripts/codegen_dsl.sh`
