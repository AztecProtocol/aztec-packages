FROM rust:alpine3.17
RUN apk update \
    && apk upgrade \
    && apk add --no-cache \
        build-base
WORKDIR /usr/src/noir
COPY . .
ENV GIT_COMMIT=something_something_something_dark_side
ENV GIT_DIRTY=false
RUN cargo build --features="noirc_frontend/aztec" --release

FROM alpine:3.17
COPY --from=0 /usr/src/noir/target/release/nargo /usr/bin/nargo
ENTRYPOINT ["/usr/bin/nargo"]