FROM ubuntu:noble as base

RUN apt-get update && \
    apt-get install -y build-essential python3 wget unzip git cmake clang ninja-build curl python3-venv python3-pip m4 && \
    apt-get -y autoremove && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
RUN useradd -m smt -G sudo
WORKDIR /home/smt

FROM base AS cvc5
RUN git clone https://github.com/AztecProtocol/aztec-packages.git
WORKDIR /home/smt/aztec-packages/barretenberg/cpp
RUN cmake -DCMAKE_C_COMPILER=clang-18 -DCMAKE_CXX_COMPILER=clang++-18 --preset smt-verification
RUN cmake --build ./build-smt --target cvc5

FROM base AS reuse

ARG COMMIT=latest
RUN git clone https://github.com/AztecProtocol/aztec-packages.git && \
    cd aztec-packages &&                                             \
    if [ "$COMMIT" != "latest" ]; then                               \
        git checkout $COMMIT || exit 1;                              \
    fi

WORKDIR /home/smt/aztec-packages/barretenberg/cpp
RUN cmake -DCMAKE_C_COMPILER=clang-18 -DCMAKE_CXX_COMPILER=clang++-18 --preset smt-verification
RUN rm -rf ./build-smt/_deps/cvc5
COPY --from=cvc5 /home/smt/aztec-packages/barretenberg/cpp/build-smt/_deps/cvc5 ./build-smt/_deps/cvc5
RUN cmake --build ./build-smt --target smt_verification_tests
