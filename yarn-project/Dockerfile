# This base dockerfile adds all the remaining source files and builds the project.
# See yarn-project-base/Dockerfile for why we have separate base Dockerfile.
FROM aztecprotocol/l1-contracts as contracts
FROM aztecprotocol/noir-projects as noir-projects
FROM aztecprotocol/noir as noir
FROM aztecprotocol/boxes-files as boxes-files

FROM aztecprotocol/yarn-project-base
COPY --from=contracts /usr/src/l1-contracts /usr/src/l1-contracts
COPY --from=noir-projects /usr/src/noir-projects /usr/src/noir-projects
COPY --from=noir /usr/src/noir/noir-repo/target /usr/src/noir/noir-repo/target
COPY --from=boxes-files /usr/src/boxes /usr/src/boxes
RUN ls /usr/src/noir/noir-repo/target/release
COPY . .
RUN ./bootstrap.sh
ENTRYPOINT ["yarn"]
