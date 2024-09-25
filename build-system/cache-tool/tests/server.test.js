const request = require("supertest");
const path = require("path");
const fs = require("fs");
const { S3 } = require("@aws-sdk/client-s3");
const { fromIni } = require("@aws-sdk/credential-providers");

// Helper function to clear module from require cache
function clearModule(moduleName) {
  delete require.cache[require.resolve(moduleName)];
}

describe("Aztec Cache Tool Tests", () => {
  const BUCKET_NAME = "aztec-ci-artifacts";
  const PREFIX = "build-cache";
  const s3 = new S3({
    credentials: fromIni({ profile: "default" }),
    region: "us-east-2",
  });

  const localFileName = "testfile.txt";
  const localFilePath = path.join(
    __dirname,
    "../hosted-build-artifacts",
    localFileName
  );
  const s3Key = `${PREFIX}/${localFileName}`;

  let app;

  afterEach(async () => {
    // Clean up local file
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }

    // Clean up S3 object
    try {
      await s3.deleteObject({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      });
    } catch (error) {
      // Ignore errors
    }

    // Clean up environment variables
    delete process.env.S3_READ;
    delete process.env.S3_WRITE;

    // Clear require cache
    clearModule("../server.js");
  });

  test("Default mode: No S3 interaction", async () => {
    // Ensure environment variables are not set
    delete process.env.S3_READ;
    delete process.env.S3_WRITE;

    // Require the server module after setting environment variables
    app = require("../server.js");

    // Upload a file
    fs.writeFileSync(localFilePath, "Test content for upload.");

    const uploadResponse = await request(app)
      .post("/upload")
      .attach("file", localFilePath);

    expect(uploadResponse.status).toBe(200);
    expect(uploadResponse.text).toBe("File uploaded successfully!");

    // Ensure the file is not in S3
    await expect(
      s3.headObject({ Bucket: BUCKET_NAME, Key: s3Key })
    ).rejects.toThrow();

    // Delete local file
    fs.unlinkSync(localFilePath);

    // Request the file (should result in 404)
    const getResponse = await request(app).get(`/${localFileName}`);
    expect(getResponse.status).toBe(404);
  });

  test("S3_READ enabled: Missing files are downloaded from S3", async () => {
    process.env.S3_READ = "true";
    delete process.env.S3_WRITE;

    // Require the server module after setting environment variables
    app = require("../server.js");

    // Ensure the file is in S3
    await s3.putObject({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: "Test content from S3.",
    });

    // Ensure the local file does not exist
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }

    // Request the file
    const getResponse = await request(app).get(`/${localFileName}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.text).toBe("Test content from S3.");

    // Verify the file was saved locally
    expect(fs.existsSync(localFilePath)).toBe(true);
  });

  test("S3_WRITE enabled: Uploaded files are saved to S3", async () => {
    process.env.S3_WRITE = "true";
    delete process.env.S3_READ;

    // Require the server module after setting environment variables
    app = require("../server.js");

    // Create a test file to upload
    fs.writeFileSync(localFilePath, "Test content for upload.");

    const uploadResponse = await request(app)
      .post("/upload")
      .attach("file", localFilePath);

    expect(uploadResponse.status).toBe(200);
    expect(uploadResponse.text).toBe("File uploaded successfully!");

    // Verify the file exists in S3
    const headResult = await s3.headObject({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });
    expect(headResult).toBeDefined();
  });

  test("S3_READ and S3_WRITE enabled: Both read and write operations occur", async () => {
    process.env.S3_READ = "true";
    process.env.S3_WRITE = "true";

    // Require the server module after setting environment variables
    app = require("../server.js");

    // Create a test file to upload
    fs.writeFileSync(localFilePath, "Test content for upload.");

    const uploadResponse = await request(app)
      .post("/upload")
      .attach("file", localFilePath);

    expect(uploadResponse.status).toBe(200);
    expect(uploadResponse.text).toBe("File uploaded successfully!");

    // Verify the file exists in S3
    const headResult = await s3.headObject({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });
    expect(headResult).toBeDefined();

    // Remove local file
    fs.unlinkSync(localFilePath);

    // Ensure the file is still in S3
    const getResponse = await request(app).get(`/${localFileName}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.text).toBe("Test content for upload.");

    // Verify the file was saved locally
    expect(fs.existsSync(localFilePath)).toBe(true);
  });
});
