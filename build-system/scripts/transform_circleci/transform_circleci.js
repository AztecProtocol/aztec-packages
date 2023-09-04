const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

// List of jobs to remove
const jobsToRemove = ["e2e-2-rpc-servers"];

// Read the CircleCI config file
const circleCiConfigPath = path.join(__dirname, ".circleci", "config.yml");
const circleCiConfigContent = fs.readFileSync(circleCiConfigPath, "utf8");

// Parse the YAML content
let config;
try {
  config = yaml.load(circleCiConfigContent);
} catch (error) {
  console.error("Failed to parse CircleCI configuration:", error);
  process.exit(1);
}

// Remove jobs from the 'jobs' section
if (config.jobs) {
  jobsToRemove.forEach((jobName) => {
    delete config.jobs[jobName];
  });
}

// Remove jobs from the 'workflows' section
if (config.workflows) {
  Object.keys(config.workflows).forEach((workflowName) => {
    const workflow = config.workflows[workflowName];
    if (workflow.jobs) {
      workflow.jobs = workflow.jobs.filter((job) => {
        if (typeof job === "string") {
          return !jobsToRemove.includes(job);
        }
        if (typeof job === "object") {
          const jobName = Object.keys(job)[0];
          return !jobsToRemove.includes(jobName);
        }
        return true;
      });
    }
  });
}

// Convert the updated object back to YAML
const updatedConfigContent = yaml.dump(config);

// Write the updated content back to the CircleCI config file
fs.writeFileSync(circleCiConfigPath, updatedConfigContent, "utf8");

console.log("CircleCI configuration updated.");
