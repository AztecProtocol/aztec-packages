FROM aztecprotocol/aztec AS aztec
FROM aztecprotocol/noir as noir
FROM aztecprotocol/docs AS docs

FROM node:18.19.0
RUN apt update && apt install netcat-openbsd
COPY --from=aztec /usr/src /usr/src
COPY --from=docs /usr/src/docs /usr/src/docs
COPY --from=noir /usr/src/noir/noir-repo/target/release/nargo /usr/src/noir/noir-repo/target/release/nargo
COPY . /usr/src/docs/docs/tutorials

WORKDIR /usr/src/docs
RUN yarn
RUN npx -y playwright install --with-deps
RUN cp -s /usr/src/noir/noir-repo/target/release/nargo /usr/local/bin/aztec-nargo
RUN cp -s /usr/src/yarn-project/builder/aztec-builder-dest /usr/local/bin/aztec-builder
ENTRYPOINT ["/bin/bash"]
