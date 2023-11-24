FROM rust:alpine3.17
RUN apk update \
    && apk upgrade \
    && apk add --no-cache \
        build-base \
        bash
WORKDIR /usr/src/noir
COPY . .
RUN ./scripts/bootstrap_native.sh

FROM alpine:3.17
COPY --from=0 /usr/src/noir/target/release/nargo /usr/src/noir/target/release/nargo
WORKDIR /project
ENTRYPOINT ["/usr/src/noir/target/release/nargo"]