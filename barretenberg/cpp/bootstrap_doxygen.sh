#!/bin/bash

set -ev

curl -SL https://github.com/doxygen/doxygen/releases/download/Release_1_9_6/doxygen-1.9.6.linux.bin.tar.gz -o doxygen.bin.tar.gz
tar -xvf doxygen.bin.tar.gz && mv doxygen-1.9.6 .doxygen
rm doxygen.bin.tar.gz
export PATH=$PWD/.doxygen/bin:$PATH
$PWD/.doxygen/bin/doxygen docs/Doxyfile