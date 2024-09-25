const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { S3 } = require("@aws-sdk/client-s3");
const { fromIni } = require("@aws-sdk/credential-providers");
const app = require("./server.js"); // The cache server

describe("Cache Rebuild Patterns Scripts Tests", () => {
  let server;
  const HOST_IP = "localhost";
  const AZTEC_BUILD_TOOL_PORT = Math.floor(Math.random() * 1000 + 10000);
  const PREFIX = "barretenberg-build";
  const rebuildPatternsFile = "rebuild-patterns.txt";
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
    const testArtifactsDir = path.join(__dirname, "test-artifacts");
    if (!fs.existsSync(testArtifactsDir)) {
      fs.mkdirSync(testArtifactsDir, { recursive: true });
    }

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

  const runTest = async (s3Enabled) => {
    let stdout = "";
    let stderr = "";

    // Write the rebuild patterns to a file
    fs.writeFileSync(rebuildPatternsFile, rebuildPatterns.trim());

    // Set the AZTEC_CACHE_REBUILD_PATTERNS environment variable
    process.env.AZTEC_CACHE_REBUILD_PATTERNS = fs.readFileSync(
      rebuildPatternsFile,
      "utf-8"
    );

    // Prepare environment variables
    if (s3Enabled) {
      process.env.S3_WRITE = "true";
      process.env.S3_READ = "true";
    } else {
      delete process.env.S3_WRITE;
      delete process.env.S3_READ;
    }
    process.env.HOST_IP = HOST_IP;
    process.env.AZTEC_BUILD_TOOL_PORT = AZTEC_BUILD_TOOL_PORT.toString();

    try {
      // Run the cache-upload-rebuild-patterns.sh script
      const uploadArgs = [PREFIX, ...filesToUpload];
      await new Promise((resolve, reject) => {
        const uploadProcess = spawn(
          "./cache-upload-rebuild-patterns.sh",
          uploadArgs,
          {
            env: { ...process.env },
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

        uploadProcess.on("close", (code) => {
          if (code !== 0) {
            console.error("Upload script exited with code", code);
            console.error("stdout:", stdout);
            console.error("stderr:", stderr);
            reject(new Error("Upload script failed"));
          } else {
            // Extract the tarball name from stdout or construct it from the script output
            const match = stdout.match(/Content hash: (\w+)/);
            if (match) {
              const contentHash = match[1];
              uploadedTarFileName = `${PREFIX}-${contentHash}.tar.gz`;
            } else {
              reject(
                new Error(
                  "Could not determine tarball name from upload script output."
                )
              );
            }
            resolve();
          }
        });
      });

      // Remove the uploaded files to simulate a fresh environment
      filesToUpload.forEach((file) => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      });

      // Run the cache-download-rebuild-patterns.sh script
      await new Promise((resolve, reject) => {
        stdout = "";
        stderr = "";
        const downloadArgs = [PREFIX];
        const downloadProcess = spawn(
          "./cache-download-rebuild-patterns.sh",
          downloadArgs,
          {
            env: { ...process.env },
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
          if (code !== 0) {
            console.error("Download script exited with code", code);
            console.error("stdout:", stdout);
            console.error("stderr:", stderr);
            reject(new Error("Download script failed"));
          } else {
            // Verify that the uploaded files are extracted
            filesToUpload.forEach((file) => {
              const fileName = path.basename(file);
              expect(fs.existsSync(fileName)).toBe(true);
              const content = fs.readFileSync(fileName, "utf-8");
              expect(content).toBe("Dummy file content");
            });
            resolve();
          }
        });
      });
    } finally {
      // Clean up extracted files
      filesToUpload.forEach((file) => {
        const fileName = path.basename(file);
        if (fs.existsSync(fileName)) {
          fs.unlinkSync(fileName);
        }
      });

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

  test("Upload and download with rebuild patterns without S3", async () => {
    await runTest(false);
  });

  test("Upload and download with rebuild patterns with S3", async () => {
    await runTest(true);
  });
});
