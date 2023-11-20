FROM rust:latest
WORKDIR /usr/src/noir
COPY . .
ENV GIT_COMMIT=something_something_something_dark_side
ENV GIT_DIRTY=false
RUN cargo build --features="noirc_frontend/aztec"

FROM ubuntu:kinetic
COPY --from=0 /usr/src/noir/target/debug/nargo /usr/bin/nargo
ENTRYPOINT ["/usr/bin/nargo"]