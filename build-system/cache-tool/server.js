// server.js

// Aztec Cache Tool
// In default mode, simply allows dockerized/earthly build environments to access
// a cache of local build artifacts on demand.
// If the S3_READ environment variable is not blank or unset, then build artifacts are secondarily pulled to local cache from Aztec's build cache S3 bucket.
// If the S3_WRITE environment variable is not blank or unset, then build artifacts are written to Aztec's build cache S3 bucket on upload.

const express = require("express");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const { S3 } = require("@aws-sdk/client-s3");
const { fromIni } = require("@aws-sdk/credential-providers");

const app = express();

// Determine if S3 read and write operations are enabled based on environment variables
console.log("Aztec Cache Tool v1")
console.log(`S3 read is ${process.env.S3_READ ? "enabled" : "disabled"}.`);
console.log(`S3 write is ${process.env.S3_WRITE ? "enabled" : "disabled"}.`);

// AWS S3 Configuration
// Warn if AWS credentials are not set
const awsCredentials = fromIni({ profile: "default" });
if (!awsCredentials && (process.env.S3_READ || process.env.S3_WRITE)) {
  console.error("AWS credentials are not set. S3 operations will fail. Set them or run in non-S3 mode for local cache.");
  process.exit(1);
}

const s3 = new S3({
  credentials: awsCredentials,
  region: "us-east-2",
});
const BUCKET_NAME = "aztec-ci-artifacts";
const PREFIX = "build-cache";

// Set the port you want the server to run on
const PORT = process.env.AZTEC_CACHE_TOOL_PORT || 8337;

// Define the directory you want to serve files from and save uploads to
const buildArtifactDirectory = path.join(__dirname, "hosted-build-artifacts");

// Ensure the directory exists
if (!fs.existsSync(buildArtifactDirectory)) {
  fs.mkdirSync(buildArtifactDirectory, { recursive: true });
}

// Configure multer for handling file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, buildArtifactDirectory);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 2048 * 1024 * 1024 }, // Limit file size to 2GB
  /*NOTE: No file filtering beyond that size limit. Do not expose to public.*/
});

// Middleware to parse JSON bodies
app.use(express.json());

// Endpoint for local file uploads, exists so we can upload just locally even with S3_WRITE
app.post("/upload-local", upload.single("file"), async (req, res) => {
  res.send("File uploaded successfully!");
});

// Endpoint for file uploads
app.post("/upload", upload.single("file"), async (req, res) => {
  // File has been saved locally at this point
  if (process.env.S3_WRITE) {
    console.log("Uploading", req.file.originalname, "to S3.");
    try {
      const filePath = path.join(buildArtifactDirectory, req.file.originalname);
      const fileContent = fs.readFileSync(filePath);

      await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: `${PREFIX}/${req.file.originalname}`,
        Body: fileContent,
      });

      console.log(`File ${req.file.originalname} uploaded to S3.`);
    } catch (error) {
      console.error("Error uploading to S3:", error);
      return res.status(500).send("Error uploading file to S3.");
    }
  }
  res.send("File uploaded successfully!");
});

// Serve static files from the specified directory
app.use(express.static(buildArtifactDirectory));

// Middleware to handle missing files and attempt to download from S3
app.use(async (req, res, next) => {
  const filePath = path.join(buildArtifactDirectory, req.path);

  // If file exists locally, let express.static handle it
  if (fs.existsSync(filePath)) {
    next();
    return;
  }

  if (process.env.S3_READ) {
    const s3Key = `${PREFIX}${req.path}`;

    try {
      const data = await s3.getObject({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      });
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Write file locally
      fs.writeFileSync(filePath, await data.Body.transformToByteArray());
      console.log(`File ${req.path} downloaded from S3.`);

      // Now serve the file
      res.sendFile(filePath);
    } catch (error) {
      console.error(`Error downloading ${req.path} from S3:`, error.message);
      // File not found in S3, proceed to next middleware (404)
      next();
    }
  } else {
    // S3 read not enabled, proceed to next middleware (404)
    next();
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  res.status(400).send(err.message || "An error occurred");
});

module.exports = app;

// Start the server only if this file is run directly
if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Serving files from: ${buildArtifactDirectory}`);
  });
}
