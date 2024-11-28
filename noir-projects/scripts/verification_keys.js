const fs_stream = require("fs");
const path = require("path");

const BB_BIN_PATH =
  process.env.BB_BIN ||
  path.join(__dirname, "../../barretenberg/cpp/build/bin/bb");

function generateArtifactHash(
  barretenbergHash,
  bytecodeHash,
  isMegaHonk,
  isRecursive
) {
  return `${barretenbergHash}-${bytecodeHash}-${
    isMegaHonk ? "mega-honk" : "ultra-honk"
  }-${isRecursive}`;
}

function getBarretenbergHash() {
  if (process.env.BB_HASH) {
    return Promise.resolve(process.env.BB_HASH);
  }
  return new Promise((res, rej) => {
    const hash = crypto.createHash("md5");

    const rStream = fs_stream.createReadStream(BB_BIN_PATH);
    rStream.on("data", (data) => {
      hash.update(data);
    });
    rStream.on("end", () => {
      res(hash.digest("hex"));
    });
    rStream.on("error", (err) => {
      rej(err);
    });
  });
}

module.exports = {
  BB_BIN_PATH,
  generateArtifactHash,
  getBarretenbergHash,
};
