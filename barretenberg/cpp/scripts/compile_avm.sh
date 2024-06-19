#!/bin/bash

# Compile
../../bb-pilcom/target/release/bb_pil pil/avm/main.pil --name Avm

# Format generated folders
git add **/generated/*
./format.sh staged

# Build vm tests
cmake --build --preset clang16 --target vm_tests