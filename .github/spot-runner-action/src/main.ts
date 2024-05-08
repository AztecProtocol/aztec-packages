import * as core from "@actions/core";
import * as fs from "fs";
import { exec } from "child_process";
import { ActionConfig } from "./config";
import { Ec2Instance } from "./ec2";
import { GithubClient } from "./github";
import { assertIsError } from "./utils";
import { spawn } from "child_process";

async function pollSpotStatus(
  config: ActionConfig,
  ec2Client: Ec2Instance,
  ghClient: GithubClient
): Promise<string | "unusable" | "none"> {
  // 12 iters x 10000 ms = 2 minutes
  for (let iter = 0; iter < 12; iter++) {
    const instances = await ec2Client.getInstancesForTags("running");
    if (instances.length <= 0) {
      // we need to start an instance
      return "none";
    }
    try {
      core.info("Found ec2 instance, looking for runners.");
      if (await ghClient.hasRunner([config.githubJobId])) {
        // we have runners
        return instances[0].InstanceId!;
      }
    } catch (err) {}
    // wait 10 seconds
    await new Promise((r) => setTimeout(r, 10000));
  }
  // we have a bad state for a while, error
  core.warning(
    "Looped for 2 minutes and could only find spot with no runners!"
  );
  return "unusable";
}

async function requestAndWaitForSpot(config: ActionConfig): Promise<string> {
  // subaction is 'start' or 'restart'estart'
  const ec2Client = new Ec2Instance(config);

  let ec2SpotStrategies: string[];
  switch (config.ec2SpotInstanceStrategy) {
    case "besteffort": {
      ec2SpotStrategies = ["BestEffort", "none"];
      core.info(
        "Ec2 spot instance strategy is set to 'BestEffort' with 'None' as fallback"
      );
      break;
    }
    default: {
      ec2SpotStrategies = [config.ec2SpotInstanceStrategy];
      core.info(
        `Ec2 spot instance strategy is set to ${config.ec2SpotInstanceStrategy}`
      );
    }
  }

  let instanceId = "";
  for (const ec2Strategy of ec2SpotStrategies) {
    core.info(`Starting instance with ${ec2Strategy} strategy`);
    // 6 * 10000ms = 1 minute per strategy
    // TODO make longer lived spot request?
    for (let i = 0; i < 6; i++) {
      try {
        // Start instance
        instanceId =
          (await ec2Client.requestMachine(
            // we fallback to on-demand
            ec2Strategy.toLocaleLowerCase() === "none"
          )) || "";
        if (instanceId) {
          break;
        }
        // let's exit, only loop on InsufficientInstanceCapacity
        break;
      } catch (error) {
        // TODO is this still the relevant error?
        if (
          error?.code &&
          error.code === "InsufficientInstanceCapacity" &&
          ec2SpotStrategies.length > 0 &&
          ec2Strategy.toLocaleLowerCase() != "none"
        ) {
          core.info(
            "Failed to create instance due to 'InsufficientInstanceCapacity', waiting 10 seconds and trying again."
          );
          // we loop after 10 seconds
        } else {
          throw error;
        }
      }
      // wait 10 seconds
      await new Promise((r) => setTimeout(r, 10000));
    }
    if (instanceId) {
      core.info("Successfully requested instance with ID " + instanceId);
      break;
    }
  }
  if (instanceId) await ec2Client.waitForInstanceRunningStatus(instanceId);
  else {
    core.error("Failed to get ID of running instance");
    throw Error("Failed to get ID of running instance");
  }
  return instanceId;
}

async function startBareSpot(config: ActionConfig): Promise<string> {
  if (config.subaction !== "start") {
    throw new Error("Unexpected subaction for bare spot, only 'start' is allowed: " + config.subaction);
  }
  const ec2Client = new Ec2Instance(config);
  const instanceId = await requestAndWaitForSpot(config);
  if (config.command) {
    await ec2CommandOverSsh(ec2Client, instanceId, config.ec2Key, config.command);
  }
  return instanceId;
}

async function startWithGithubRunners(config: ActionConfig): Promise<string> {
  if (config.subaction === "stop") {
    await terminate();
    return "";
  } else if (config.subaction === "restart") {
    await terminate();
    // then we make a fresh instance
  } else if (config.subaction === "start") {
    // We need to terminate
    await terminate("stopped", false);
  } else {
    throw new Error("Unexpected subaction: " + config.subaction);
  }
  // subaction is 'start' or 'restart'estart'
  const ec2Client = new Ec2Instance(config);
  const ghClient = new GithubClient(config);
  const spotStatus = await pollSpotStatus(config, ec2Client, ghClient);
  if (spotStatus === "unusable") {
    core.warning(
      "Taking down spot as it has no runners! If we were mistaken, this could impact existing jobs."
    );
    if (config.subaction === "restart") {
      throw new Error(
        "Taking down spot we just started. This seems wrong, erroring out."
      );
    }
    await terminate();
  }
  if (spotStatus !== "none") {
    core.info(
      `Runner already running. Continuing as we can target it with jobs.`
    );
    return spotStatus;
  }

  const instanceId = await requestAndWaitForSpot(config);
  if (instanceId) await ec2Client.waitForInstanceRunningStatus(instanceId);
  else {
    core.error("Failed to get ID of running instance");
    throw Error("Failed to get ID of running instance");
  }
  if (instanceId) await ghClient.pollForRunnerCreation([config.githubJobId]);
  else {
    core.error("Instance failed to register with Github Actions");
    throw Error("Instance failed to register with Github Actions");
  }
  return instanceId;
}

async function ec2CommandOverSsh(
  ec2Client: Ec2Instance,
  instanceId: string,
  encodedSshKey: string,
  command: string
): Promise<string> {
  const ip = await ec2Client.getPublicIpFromInstanceId(instanceId);
  core.info(`Attempting SSH into EC2 instance ${instanceId}`);

  const decodedKey = Buffer.from(encodedSshKey, "base64").toString("utf8");
  const tempKeyPath = "/tmp/ec2_ssh_key.pem";
  fs.writeFileSync(tempKeyPath, decodedKey, { mode: 0o600 });

  // Wrap the process execution in a Promise to handle asynchronous execution and output streaming
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ssh",
      [
        "-o",
        "StrictHostKeyChecking=no",
        "-i",
        tempKeyPath,
        `ubuntu@${ip}`,
        command,
      ],
      { shell: true }
    );

    // Handle standard output
    child.stdout.on("data", (data) => {
      console.log(data.toString());
    });

    // Handle standard error
    child.stderr.on("data", (data) => {
      console.error(data.toString());
    });

    // Handle close event
    child.on("close", (code) => {
      if (code === 0) {
        resolve(`SSH command completed with code ${code}`);
      } else {
        reject(new Error(`SSH command failed with code ${code}`));
      }
    });

    // Handle process errors (e.g., command not found, cannot spawn process)
    child.on("error", (err) => {
      reject(new Error(`Failed to execute SSH command: ${err.message}`));
    });
  });
}

async function terminate(instanceStatus?: string, cleanupRunners = true) {
  try {
    core.info("Starting instance cleanup");
    const config = new ActionConfig();
    const ec2Client = new Ec2Instance(config);
    const ghClient = new GithubClient(config);
    const instances = await ec2Client.getInstancesForTags(instanceStatus);
    await ec2Client.terminateInstances(instances.map((i) => i.InstanceId!));
    if (cleanupRunners) {
      core.info("Clearing previously installed runners");
      const result = await ghClient.removeRunnersWithLabels([
        config.githubJobId,
      ]);
      if (result) {
        core.info("Finished runner cleanup");
      } else {
        throw Error(
          "Failed to cleanup runners. Continuing, but failure expected!"
        );
      }
    }
  } catch (error) {
    core.info(error);
  }
}

(async function () {
  try {
    const config = new ActionConfig();
    if (config.githubToken) {
      startWithGithubRunners(config);
    } else {
      startBareSpot(config);
    }
  } catch (error) {
    terminate();
    assertIsError(error);
    core.error(error);
    core.setFailed(error.message);
  }
})();
