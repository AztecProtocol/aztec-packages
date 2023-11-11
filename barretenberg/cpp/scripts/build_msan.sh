#!/bin/bash 
set -eu
if ! [ -d llvm-project ] ; then
  # clone LLVM
  git clone --depth=1 -b release/10.x https://github.com/llvm/llvm-project
fi
cd llvm-project
mkdir -p build
cd build
# configure cmake
cmake -GNinja ../llvm \
	-DCMAKE_BUILD_TYPE=Release \
	-DLLVM_ENABLE_PROJECTS="libcxx;libcxxabi" \
	-DCMAKE_C_COMPILER=clang \
	-DCMAKE_CXX_COMPILER=clang++ \
	-DLLVM_USE_SANITIZER=MemoryWithOrigins
# build the libraries
cmake --build . -- cxx cxxabi
cd ../..
cmake --preset msan 
cmake --build --preset msan
