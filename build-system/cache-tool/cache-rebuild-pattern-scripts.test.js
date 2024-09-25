const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { S3 } = require("@aws-sdk/client-s3");
const { fromIni } = require("@aws-sdk/credential-providers");
const app = require("./server.js"); // The cache server

describe("Cache Rebuild Patterns Scripts Tests", () => {
  let server;
  const AZTEC_BUILD_TOOL_PORT = Math.floor(Math.random() * 1000 + 10000);
  const PREFIX = "barretenberg-build";
  const testArtifactsDir = path.join(__dirname, "test-artifacts");
  const rebuildPatternsFile = path.join(
    testArtifactsDir,
    "rebuild-patterns.txt"
  );
  // NOTE: must exist in git
  const rebuildPatterns = `
^build-system/cache-tool/cache-upload\\.sh$
^build-system/cache-tool/cache-download\\.sh$
`;
  const filesToUpload = ["test-artifacts/dummy-file.txt"];
  const BUCKET_NAME = "aztec-ci-artifacts";
  const S3_PREFIX = "build-cache";
  const s3 = new S3({
    credentials: fromIni({ profile: "default" }),
    region: "us-east-2",
  });
  let uploadedTarFileName;

  beforeAll((done) => {
    // Ensure test-artifacts directory exists
    if (!fs.existsSync(testArtifactsDir)) {
      fs.mkdirSync(testArtifactsDir, { recursive: true });
    }

    // Write the rebuild patterns to a file
    fs.writeFileSync(rebuildPatternsFile, rebuildPatterns.trim());
    // Create a dummy file to upload
    filesToUpload.forEach((file) => {
      fs.writeFileSync(file, "Dummy file content");
    });

    // Start the cache server
    server = app.listen(AZTEC_BUILD_TOOL_PORT, "0.0.0.0", () => {
      console.log("Cache server started on port", AZTEC_BUILD_TOOL_PORT);
      done();
    });
  });

  afterAll(async () => {
    // Clean up test artifacts
    filesToUpload.forEach((file) => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });

    // Remove rebuild patterns file
    if (fs.existsSync(rebuildPatternsFile)) {
      fs.unlinkSync(rebuildPatternsFile);
    }

    // Stop the cache server
    await new Promise((resolve) => {
      server.close(() => {
        console.log("Cache server stopped");
        resolve();
      });
    });
  });

  const computeContentHash = () => {
    return new Promise((resolve, reject) => {
      let contentHash = "";
      const computeProcess = spawn("./compute-content-hash.sh", [], {
        env: {
          AZTEC_CACHE_REBUILD_PATTERNS: rebuildPatternsFile,
        },
      });

      computeProcess.stdout.on("data", (data) => {
        contentHash += data.toString();
      });

      computeProcess.stderr.on("data", (data) => {
        console.error("compute-content-hash.sh stderr:", data.toString());
      });

      computeProcess.on("error", (err) => {
        reject(err);
      });

      computeProcess.on("close", (code) => {
        if (code !== 0) {
          console.error(contentHash); // actually an error log
          reject(new Error("compute-content-hash.sh exited with code " + code));
        } else {
          contentHash = contentHash.trim();
          console.log("Content hash:", contentHash);
          resolve(contentHash);
        }
      });
    });
  };

  const runUploadAndDownloadTest = async (s3Enabled) => {
    let stdout = "";
    let stderr = "";
    const env = {
      AZTEC_CACHE_REBUILD_PATTERNS: rebuildPatternsFile,
    };
    if (s3Enabled) {
      process.env.S3_WRITE = "true";
    } else {
      delete process.env.S3_WRITE;
    }

    try {
      // Compute the content hash
      const contentHash = await computeContentHash();
      uploadedTarFileName = `${PREFIX}-${contentHash}.tar.gz`;

      // Run the cache-upload-rebuild-patterns.sh script
      await new Promise((resolve, reject) => {
        const uploadProcess = spawn(
          "./cache-upload-rebuild-patterns.sh",
          [PREFIX, ...filesToUpload],
          {
            env: env,
          }
        );

        uploadProcess.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        uploadProcess.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        uploadProcess.on("error", (err) => {
          reject(err);
        });

        uploadProcess.on("close", async (code) => {
          if (code !== 0) {
            console.error("Upload script exited with code", code);
            console.error("stdout:", stdout);
            console.error("stderr:", stderr);
            reject(new Error("Upload script failed"));
          } else {
            // Verify the tar file exists on the local server artifacts dir
            const cacheFilePath = path.join(
              __dirname,
              "hosted-build-artifacts",
              uploadedTarFileName
            );
            expect(fs.existsSync(cacheFilePath)).toBe(true);

            // If S3 is enabled, verify the tar file exists on S3
            if (s3Enabled) {
              const s3Key = `${S3_PREFIX}/${uploadedTarFileName}`;
              try {
                const headResult = await s3.headObject({
                  Bucket: BUCKET_NAME,
                  Key: s3Key,
                });
                expect(headResult).toBeDefined();
              } catch (err) {
                reject(new Error(`Expected S3 object ${s3Key} to exist`));
              }
            } else {
              // Verify the tar file does not exist on S3
              const s3Key = `${S3_PREFIX}/${uploadedTarFileName}`;
              try {
                await s3.headObject({
                  Bucket: BUCKET_NAME,
                  Key: s3Key,
                });
                throw new Error(`Expected S3 object ${s3Key} NOT to exist`);
              } catch (err) {
                if (err.name === "NotFound" || err.Code === "NotFound") {
                  // Expected behavior
                } else {
                  reject(err);
                }
              }
            }
            resolve();
          }
        });
      });
      await runDownloadTest(s3Enabled);
    } finally {
      // Clean up S3 if enabled
      if (s3Enabled && uploadedTarFileName) {
        const s3Key = `${S3_PREFIX}/${uploadedTarFileName}`;
        try {
          await s3.deleteObject({
            Bucket: BUCKET_NAME,
            Key: s3Key,
          });
        } catch (err) {
          console.warn(`Could not delete S3 object ${s3Key}`);
        }
      }

      // Remove the tarball from the server's artifacts directory
      if (uploadedTarFileName) {
        const cacheFilePath = path.join(
          __dirname,
          "hosted-build-artifacts",
          uploadedTarFileName
        );
        if (fs.existsSync(cacheFilePath)) {
          fs.unlinkSync(cacheFilePath);
        }
      }

      // Remove rebuild patterns file
      if (fs.existsSync(rebuildPatternsFile)) {
        fs.unlinkSync(rebuildPatternsFile);
      }
    }
  };

  const runDownloadTest = async (s3Enabled) => {
    let stdout = "";
    let stderr = "";
    const env = {
      AZTEC_CACHE_REBUILD_PATTERNS: rebuildPatternsFile,
    };
    if (s3Enabled) {
      process.env.S3_READ = "true";
    } else {
      delete process.env.S3_READ;
    }

    // Compute the content hash
    const contentHash = await computeContentHash();
    const expectedTarFileName = `${PREFIX}-${contentHash}.tar.gz`;
    uploadedTarFileName = expectedTarFileName;

    // Remove the files to simulate a fresh environment
    filesToUpload.forEach((file) => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });

    // Run the cache-download-rebuild-patterns.sh script
    await new Promise((resolve, reject) => {
      const downloadProcess = spawn(
        "./cache-download-rebuild-patterns.sh",
        [PREFIX],
        {
          env: env,
        }
      );

      downloadProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      downloadProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      downloadProcess.on("error", (err) => {
        reject(err);
      });

      downloadProcess.on("close", (code) => {
        try {
          if (code !== 0) {
            throw new Error("Download script failed");
          } else {
            // Verify that the files are extracted
            filesToUpload.forEach((file) => {
              expect(fs.existsSync(file)).toBe(true);
              const content = fs.readFileSync(file, "utf-8");
              expect(content).toBe("Dummy file content");
            });
            resolve();
          }
        } catch (err) {
          console.error("Download script exited with code", code);
          console.error("stdout:", stdout);
          console.error("stderr:", stderr);
          reject(err);
        }
      });
    });
  };

  test("Upload/download with rebuild patterns without S3", async () => {
    await runUploadAndDownloadTest(false);
  });

  // test("Upload/download with rebuild patterns with S3", async () => {
  //   await runUploadAndDownloadTest(true);
  // });
});
