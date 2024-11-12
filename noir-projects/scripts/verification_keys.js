const { fromIni } = require("@aws-sdk/credential-providers");
const { S3 } = require("@aws-sdk/client-s3");
const fs_stream = require("fs");
const path = require("path");

const BB_BIN_PATH =
  process.env.BB_BIN ||
  path.join(__dirname, "../../barretenberg/cpp/build/bin/bb");
const BUCKET_NAME = "aztec-ci-artifacts";
const PREFIX = "protocol";

async function writeVKToS3(artifactName, artifactHash, body) {
  if (process.env.DISABLE_VK_S3_CACHE) {
    return;
  }
  try {
    const s3 = generateS3Client();
    await s3.putObject({
      Bucket: BUCKET_NAME,
      Key: `${PREFIX}/${artifactName}-${artifactHash}.json`,
      Body: body,
    });
  } catch (err) {
    console.warn("Could not write to S3 VK remote cache", err.message);
  }
}

async function readVKFromS3(artifactName, artifactHash, json = true) {
  if (process.env.DISABLE_VK_S3_CACHE) {
    return;
  }
  const key = `${PREFIX}/${artifactName}-${artifactHash}.json`;

  try {
    const s3 = generateS3Client();
    const { Body: response } = await s3.getObject({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    if (json) {
      const result = JSON.parse(await response.transformToString());
      return result;
    } else {
      return Buffer.from(await response.transformToByteArray());
    }
  } catch (err) {
    if (err.name !== "NoSuchKey") {
      console.warn(
        `Could not read VK from remote cache at s3://${BUCKET_NAME}/${key}`,
        err.message
      );
    }
    return undefined;
  }
}

function generateS3Client() {
  return new S3({
    credentials: fromIni({
      profile: "default",
    }),
    region: "us-east-2",
  });
}

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
  writeVKToS3,
  readVKFromS3,
  generateArtifactHash,
  getBarretenbergHash,
};
