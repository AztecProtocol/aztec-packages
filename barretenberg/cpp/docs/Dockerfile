FROM alpine:3.18 AS builder
RUN apk update \
    && apk upgrade \
    && apk add --no-cache \
        build-base \
        clang16 \
        cmake \
        ninja \
        git \
        curl \
        perl \
        doxygen
WORKDIR /usr/src/barretenberg/cpp/
COPY . .
RUN cd docs
RUN doxygen --version
RUN doxygen .
RUN ls build
