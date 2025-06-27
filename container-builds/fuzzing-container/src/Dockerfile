FROM ubuntu:noble AS base-build

RUN apt-get update && \
    apt-get install -y build-essential python3 wget unzip git cmake clang-16 ninja-build && \
    apt-get -y autoremove && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN userdel -r ubuntu && useradd -m fuzzer -G sudo
WORKDIR /home/fuzzer

RUN git clone https://github.com/AztecProtocol/aztec-packages.git
WORKDIR /home/fuzzer/aztec-packages/barretenberg/cpp
RUN git checkout next

# Build all fuzzers
RUN cmake --preset fuzzing
RUN cmake --build --preset fuzzing

# Build all post-crash loggers
RUN cmake --preset fuzzing-asan
RUN cmake --build --preset fuzzing-asan

RUN mv ./build-fuzzing ./build-fuzzing-asan /home/fuzzer
WORKDIR /home/fuzzer

COPY entrypoint.sh .
