FROM aztecprotocol/yarn-project AS yarn-project
# ENV vars for using native ACVM simulation
ENV ACVM_BINARY_PATH="/usr/src/noir/noir-repo/target/release/acvm" ACVM_WORKING_DIRECTORY="/tmp/acvm"
ENTRYPOINT ["node", "--no-warnings", "/usr/src/yarn-project/aztec/dest/bin/index.js"]
EXPOSE 8080