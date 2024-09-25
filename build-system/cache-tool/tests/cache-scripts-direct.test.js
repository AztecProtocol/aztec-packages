const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { S3 } = require("@aws-sdk/client-s3");
const { fromIni } = require("@aws-sdk/credential-providers");
const app = require("../server.js"); // The cache server

describe("Cache Upload Script Tests", () => {
  let server;
  const HOST_IP = "localhost";
  const AZTEC_BUILD_TOOL_PORT = Math.floor(Math.random() * 1000 + 10000);
  const cacheName = "barretenberg";
  const binaryPaths = ["test-artifacts/binary1", "test-artifacts/binary2"];
  let TAR_FILE;
  const BUCKET_NAME = "aztec-ci-artifacts";
  const PREFIX = "build-cache";
  const s3 = new S3({
    credentials: fromIni({ profile: "default" }),
    region: "us-east-2",
  });

  beforeAll((done) => {
    // Ensure binary files exist
    binaryPaths.forEach((file) => {
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(file, "Binary content");
    });

    // Set the TAR_FILE name
    TAR_FILE = `${cacheName}.tar.gz`;

    // Start the cache server
    server = app.listen(AZTEC_BUILD_TOOL_PORT, "0.0.0.0", () => {
      console.log("LISTENING ON PORT", AZTEC_BUILD_TOOL_PORT);
      done();
    });
  });

  afterAll(async () => {
    // Clean up binary files
    binaryPaths.forEach((file) => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });

    // Remove cache files from server
    const cacheFilePath = path.join(
      __dirname,
      "../hosted-build-artifacts",
      TAR_FILE
    );
    if (fs.existsSync(cacheFilePath)) {
      fs.unlinkSync(cacheFilePath);
    }

    // Stop the cache server
    await new Promise((resolve) => {
      server.close(() => {
        console.log("Cache server stopped");
        resolve();
      });
    });
  });

  test("cache-upload-direct.sh uploads to S3 when S3_WRITE is enabled", (done) => {
    let stdout = "";
    let stderr = "";

    const args = [...binaryPaths, cacheName];
    process.env.S3_WRITE = "true";
    const uploadProcess = spawn("./cache-upload-direct.sh", args, {
      env: { ...process.env, HOST_IP, AZTEC_BUILD_TOOL_PORT },
    });

    uploadProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    uploadProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    uploadProcess.on("error", (err) => {
      done(err);
    });

    uploadProcess.on("close", async (code) => {
      try {
        if (code !== 0) {
          console.error("Script exited with code", code);
          console.error("stdout:", stdout);
          console.error("stderr:", stderr);
        }
        expect(code).toBe(0);

        // Verify the cache file exists on the server
        const cacheFilePath = path.join(
          __dirname,
          "../hosted-build-artifacts",
          TAR_FILE
        );
        expect(fs.existsSync(cacheFilePath)).toBe(true);

        // Verify that the file is uploaded to S3
        const s3Key = `${PREFIX}/${TAR_FILE}`;
        try {
          const headResult = await s3.headObject({
            Bucket: BUCKET_NAME,
            Key: s3Key,
          });
          expect(headResult).toBeDefined();
        } catch (err) {
          throw new Error(`Expected S3 object ${s3Key} to exist`);
        }

        done();
      } catch (err) {
        done(err);
      } finally {
        // delete file from S3
        const s3Key = `${PREFIX}/${TAR_FILE}`;
        try {
          await s3.deleteObject({
            Bucket: BUCKET_NAME,
            Key: s3Key,
          });
        } catch (err) {
          console.warn(
            `Could not find S3 object ${s3Key} to delete. This can be normal if tests fail.`
          );
        }
      }
    });
  });

  test("cache-upload-direct.sh does not upload to S3 when S3_WRITE is disabled", (done) => {
    let stdout = "";
    let stderr = "";

    const args = [...binaryPaths, cacheName];
    delete process.env.S3_WRITE;

    const uploadProcess = spawn("./cache-upload-direct.sh", args, {
      env: { ...process.env, HOST_IP, AZTEC_BUILD_TOOL_PORT },
    });

    uploadProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    uploadProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    uploadProcess.on("error", (err) => {
      done(err);
    });

    uploadProcess.on("close", async (code) => {
      try {
        if (code !== 0) {
          console.error("Script exited with code", code);
          console.error("stdout:", stdout);
          console.error("stderr:", stderr);
        }
        expect(code).toBe(0);

        // Verify the cache file exists on the server
        const cacheFilePath = path.join(
          __dirname,
          "../hosted-build-artifacts",
          TAR_FILE
        );
        expect(fs.existsSync(cacheFilePath)).toBe(true);

        // Verify that file is NOT uploaded to S3
        const s3Key = `${PREFIX}/${TAR_FILE}`;
        try {
          await s3.headObject({ Bucket: BUCKET_NAME, Key: s3Key });
          throw new Error(`Expected S3 object ${s3Key} NOT to exist`);
        } catch (err) {
          if (err.name === "NotFound") {
            // Expected behavior
          } else {
            throw err;
          }
        }

        done();
      } catch (err) {
        done(err);
      }
    });
  });
});

describe("Cache Download Script Tests with S3", () => {
  let server;
  const HOST_IP = "localhost";
  const AZTEC_BUILD_TOOL_PORT = Math.floor(Math.random() * 1000 + 10000);
  const tarFileName = "test-cache.tar.gz";
  const serverArtifactsDir = path.join(__dirname, "../hosted-build-artifacts");
  const cacheFilePath = path.join(serverArtifactsDir, tarFileName);
  const extractDir = "extracted-files";
  const filesInTar = ["file1.txt", "file2.txt"];
  const BUCKET_NAME = "aztec-ci-artifacts";
  const PREFIX = "build-cache";
  const s3 = new S3({
    credentials: fromIni({ profile: "default" }),
    region: "us-east-2",
  });

  beforeAll((done) => {
    // Start the cache server
    server = app.listen(AZTEC_BUILD_TOOL_PORT, "0.0.0.0", () => {
      console.log("LISTENING ON PORT", AZTEC_BUILD_TOOL_PORT);
      done();
    });
  });

  afterAll(async () => {
    // Clean up extracted files
    filesInTar.forEach((fileName) => {
      if (fs.existsSync(fileName)) {
        fs.unlinkSync(fileName);
      }
    });

    // Stop the cache server
    await new Promise((resolve) => {
      server.close(() => {
        console.log("Cache server stopped");
        resolve();
      });
    });
  });

  const setupTestFiles = () => {
    // Ensure extract directory exists
    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true });
    }

    // Create files to be included in the tar.gz
    filesInTar.forEach((fileName) => {
      fs.writeFileSync(
        path.join(extractDir, fileName),
        `Content of ${fileName}`
      );
    });
  };

  const createTarGz = (outputPath) => {
    return new Promise((resolve, reject) => {
      const tarProcess = spawn("tar", [
        "-czf",
        outputPath,
        "-C",
        extractDir,
        ".",
      ]);

      tarProcess.on("close", (code) => {
        if (code !== 0) {
          reject(new Error("Failed to create tar.gz file for testing"));
        } else {
          resolve();
        }
      });
    });
  };

  const cleanupTestFiles = () => {
    // Remove extracted files
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }

    // Remove tar.gz file from local artifacts dir
    if (fs.existsSync(cacheFilePath)) {
      fs.unlinkSync(cacheFilePath);
    }
  };

  const runDownloadTest = (s3ReadEnabled, done) => {
    let stdout = "";
    let stderr = "";

    const args = [tarFileName];
    if (s3ReadEnabled) {
      process.env.S3_READ = "true";
    } else {
      delete process.env.S3_READ;
    }

    const downloadProcess = spawn("./cache-download-direct.sh", args, {
      env: { ...process.env, HOST_IP, AZTEC_BUILD_TOOL_PORT },
    });

    downloadProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    downloadProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    downloadProcess.on("error", (err) => {
      done(err);
    });

    downloadProcess.on("close", (code) => {
      try {
        if (code !== 0) {
          console.error("Script exited with code", code);
          console.error("stdout:", stdout);
          console.error("stderr:", stderr);
        }
        expect(code).toBe(0);

        // Verify that the files were extracted
        filesInTar.forEach((fileName) => {
          expect(fs.existsSync(fileName)).toBe(true);
          const content = fs.readFileSync(fileName, "utf-8");
          expect(content).toBe(`Content of ${fileName}`);
        });

        done();
      } catch (err) {
        done(err);
      } finally {
        // Clean up extracted files
        filesInTar.forEach((fileName) => {
          if (fs.existsSync(fileName)) {
            fs.unlinkSync(fileName);
          }
        });
      }
    });
  };

  test("cache-download-direct.sh downloads and extracts tar.gz file from cache server when S3_READ is disabled", async () => {
    // Set up test files
    setupTestFiles();

    // Create tar.gz file in the server's artifacts directory
    await createTarGz(cacheFilePath);

    // Ensure the tar.gz file is not on S3
    const s3Key = `${PREFIX}/${tarFileName}`;
    try {
      await s3.deleteObject({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      });
    } catch (err) {
      // Ignore if object does not exist
    }

    await new Promise((resolve) => {
      runDownloadTest(false, () => {
        // Clean up test files
        cleanupTestFiles();
        resolve();
      });
    });
  });

  test("cache-download-direct.sh downloads and extracts tar.gz file from S3 when S3_READ is enabled", async () => {
    // Set up test files
    setupTestFiles();

    // Create tar.gz file locally (not in server artifacts dir)
    const localTarFilePath = path.join(__dirname, tarFileName);
    await createTarGz(localTarFilePath);

    // Upload tar.gz file to S3
    const s3Key = `${PREFIX}/${tarFileName}`;
    try {
      await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: fs.createReadStream(localTarFilePath),
      });
    } catch (err) {
      done(new Error("Failed to upload test file to S3"));
      return;
    }

    // Ensure the tar.gz file is not in the server's artifacts directory
    if (fs.existsSync(cacheFilePath)) {
      fs.unlinkSync(cacheFilePath);
    }

    // Remove local tar.gz file after uploading to S3
    if (fs.existsSync(localTarFilePath)) {
      fs.unlinkSync(localTarFilePath);
    }

    await new Promise((resolve) => {
      runDownloadTest(true, async () => {
        // Clean up test files
        cleanupTestFiles();

        // Remove the file from S3
        try {
          await s3.deleteObject({
            Bucket: BUCKET_NAME,
            Key: s3Key,
          });
        } catch (err) {
          console.warn(`Could not delete S3 object ${s3Key}`);
        }

        resolve();
      });
    });
  });
});
