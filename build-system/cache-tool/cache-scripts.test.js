// test-cache-scripts.js

const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");
const { S3 } = require("@aws-sdk/client-s3");
const { fromIni } = require("@aws-sdk/credential-providers");
const app = require("./server.js"); // The cache server

describe("Cache Scripts Tests with S3", () => {
  let server;
  const HOST_IP = "localhost";
  const AZTEC_BUILD_TOOL_PORT = Math.floor(Math.random() * 1000 + 10000);
  const cacheName = "barretenberg";
  const sourcePaths = ["test-artifacts/source1", "test-artifacts/source2"];
  const buildDir = "test-artifacts/build";
  const buildFile = path.join(buildDir, "build-output.txt");
  const uploadFiles = ["test-artifacts/extra-file.txt"];
  let TAR_FILE;
  const BUCKET_NAME = "aztec-ci-artifacts";
  const PREFIX = "build-cache";
  const s3 = new S3({
    credentials: fromIni({ profile: "default" }),
    region: "us-east-2",
  });

  beforeAll((done) => {
    // Ensure source directories exist and have content
    sourcePaths.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(path.join(dir, "file.txt"), "Source content");
    });

    // Ensure the build directory exists
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true });
    }

    // Create a build output file
    fs.writeFileSync(buildFile, "Build output");

    // Create an extra file to upload
    uploadFiles.forEach((file) => {
      fs.writeFileSync(file, "Extra file content");
    });

    // Compute the source hash to determine the expected cache file name
    const sourceHash = execSync(
      `find ${sourcePaths.join(
        " "
      )} -type f -exec sha256sum {} \\; | sort | sha256sum | awk '{print $1}'`
    )
      .toString()
      .trim();
    TAR_FILE = `build-${cacheName}-${sourceHash}.tar.gz`;

    // Start the cache server
    server = app.listen(AZTEC_BUILD_TOOL_PORT, "0.0.0.0", () => {
      console.log("LISTENING ON PORT", AZTEC_BUILD_TOOL_PORT);
      done();
    });
  });

  afterAll(async () => {
    // Clean up source directories
    sourcePaths.forEach((dir) => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    // Clean up build directory
    if (fs.existsSync(buildDir)) {
      fs.rmSync(buildDir, { recursive: true, force: true });
    }

    // Clean up upload files
    uploadFiles.forEach((file) => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });

    // Remove cache files from server
    const cacheFilePath = path.join(
      __dirname,
      "hosted-build-artifacts",
      TAR_FILE
    );
    if (fs.existsSync(cacheFilePath)) {
      fs.unlinkSync(cacheFilePath);
    }

    uploadFiles.forEach((file) => {
      const uploadedFilePath = path.join(
        __dirname,
        "hosted-build-artifacts",
        path.basename(file)
      );
      if (fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
    });

    // Stop the cache server
    await new Promise((resolve) => {
      server.close(() => {
        console.log("Cache server stopped");
        resolve();
      })
    });
  });

  test("cache-upload.sh uploads to S3 when S3_WRITE is enabled", (done) => {
    let stdout = "";
    let stderr = "";

    const args = [
      buildDir,
      ...sourcePaths,
      "--upload",
      ...uploadFiles,
      cacheName,
    ];
    process.env.S3_WRITE = 'true';
    const uploadProcess = spawn("./cache-upload.sh", args, {
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
          "hosted-build-artifacts",
          TAR_FILE
        );
        expect(fs.existsSync(cacheFilePath)).toBe(true);

        // Verify the extra files exist on the server
        uploadFiles.forEach((file) => {
          const uploadedFilePath = path.join(
            __dirname,
            "hosted-build-artifacts",
            path.basename(file)
          );
          expect(fs.existsSync(uploadedFilePath)).toBe(true);
        });

        // Verify that files are uploaded to S3
        const s3Keys = [
          `${PREFIX}/${TAR_FILE}`,
          ...uploadFiles.map((file) => `${PREFIX}/${path.basename(file)}`),
        ];

        for (const key of s3Keys) {
          try {
            const headResult = await s3.headObject({
              Bucket: BUCKET_NAME,
              Key: key,
            });
            expect(headResult).toBeDefined();
          } catch (err) {
            throw new Error(`Expected S3 object ${key} to exist`);
          }
        }

        done();
      } catch (err) {
        done(err);
      } finally {
        // delete files from S3
        const s3Keys = [
          `${PREFIX}/${TAR_FILE}`,
          ...uploadFiles.map((file) => `${PREFIX}/${path.basename(file)}`),
        ];

        for (const key of s3Keys) {
          try {
            const headResult = await s3.deleteObject({
              Bucket: BUCKET_NAME,
              Key: key,
            });
            expect(headResult).toBeDefined();
          } catch (err) {
            console.warn(`Could not find S3 object ${key} to delete. This can be normal if tests fail.`);
          }
        }
      }
    });
  });

  test("cache-upload.sh does not upload to S3 when S3_WRITE is disabled", (done) => {
    let stdout = "";
    let stderr = "";

    const args = [
      buildDir,
      ...sourcePaths,
      "--upload",
      ...uploadFiles,
      cacheName,
    ];
    delete process.env.S3_WRITE;

    const uploadProcess = spawn("./cache-upload.sh", args, {
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
          "hosted-build-artifacts",
          TAR_FILE
        );
        expect(fs.existsSync(cacheFilePath)).toBe(true);

        // Verify the extra files exist on the server
        uploadFiles.forEach((file) => {
          const uploadedFilePath = path.join(
            __dirname,
            "hosted-build-artifacts",
            path.basename(file)
          );
          expect(fs.existsSync(uploadedFilePath)).toBe(true);
        });

        // Verify that files are NOT uploaded to S3
        const s3Keys = [
          `${PREFIX}/${TAR_FILE}`,
          ...uploadFiles.map((file) => `${PREFIX}/${path.basename(file)}`),
        ];

        for (const key of s3Keys) {
          try {
            await s3.headObject({ Bucket: BUCKET_NAME, Key: key });
            throw new Error(`Expected S3 object ${key} NOT to exist`);
          } catch (err) {
            // If error code is NotFound, this is expected
            if (err.name === "NotFound") {
              // Expected behavior
            } else {
              // Unexpected error
              throw err;
            }
          }
        }

        done();
      } catch (err) {
        done(err);
      }
    });
  });
});
