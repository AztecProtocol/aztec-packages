# Distributed under the OSI-approved BSD 3-Clause License.  See accompanying
# file Copyright.txt or https://cmake.org/licensing for details.

cmake_minimum_required(VERSION 3.5)

file(MAKE_DIRECTORY
  "/mnt/user-data/spyros/dev/aztec3-packages/barretenberg/cpp"
  "/mnt/user-data/spyros/dev/aztec3-packages/build/Barretenberg-prefix/src/Barretenberg-build"
  "/mnt/user-data/spyros/dev/aztec3-packages/build/Barretenberg-prefix"
  "/mnt/user-data/spyros/dev/aztec3-packages/build/Barretenberg-prefix/tmp"
  "/mnt/user-data/spyros/dev/aztec3-packages/build/Barretenberg-prefix/src/Barretenberg-stamp"
  "/mnt/user-data/spyros/dev/aztec3-packages/build/Barretenberg-prefix/src"
  "/mnt/user-data/spyros/dev/aztec3-packages/build/Barretenberg-prefix/src/Barretenberg-stamp"
)

set(configSubDirs )
foreach(subDir IN LISTS configSubDirs)
    file(MAKE_DIRECTORY "/mnt/user-data/spyros/dev/aztec3-packages/build/Barretenberg-prefix/src/Barretenberg-stamp/${subDir}")
endforeach()
if(cfgdir)
  file(MAKE_DIRECTORY "/mnt/user-data/spyros/dev/aztec3-packages/build/Barretenberg-prefix/src/Barretenberg-stamp${cfgdir}") # cfgdir has leading slash
endif()
