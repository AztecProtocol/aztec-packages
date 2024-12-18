import * as core from "@actions/core";
import * as fs from "fs";
import { execSync } from "child_process";
import { ActionConfig } from "./config";
import { Ec2Instance } from "./ec2";
import { GithubClient } from "./github";
import { assertIsError } from "./utils";
import { spawn } from "child_process";
import * as github from "@actions/github";
require("aws-sdk/lib/maintenance_mode_message").suppress = true;

async function pollSpotStatus(
  config: ActionConfig,
  ec2Client: Ec2Instance
): Promise<string | "unusable" | "none"> {
  const instances = await ec2Client.getInstancesForTags(["pending", "running"]);
  if (instances.length === 0) {
    return "none"
  }
  for (const instance of instances) {
    try {
      // The first runner we can wait to reach 'running' status
      // This will error out if they are pending termination
      await ec2Client.waitForInstanceRunningStatus(instance.InstanceId!);
      const ip = await ec2Client.getPublicIpFromInstanceId(
        instance.InstanceId!
      );
      if (await establishSshContact(ip, config.ec2Key)) {
        return instance.InstanceId!;
      }
    } catch (err) {
      // TODO stop printing once stable
      console.error(err);
    }
  }
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
    let backoff = 0;
    core.info(`Starting instance with ${ec2Strategy} strategy`);
    const MAX_ATTEMPTS = 6; // uses exponential backoff
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      // Start instance
      const instanceIdOrError =
        await ec2Client.requestMachine(
          /* try number */ i,
          // we fallback to on-demand
          ec2Strategy.toLocaleLowerCase() === "none",
        );
      // let's exit, only loop on InsufficientInstanceCapacity
      if (
        instanceIdOrError === "RequestLimitExceeded" ||
        instanceIdOrError === "InsufficientInstanceCapacity"
      ) {
        core.info(
          "Failed to create instance due to " +
            instanceIdOrError +
            ", waiting " + 5 * 2 ** backoff + " seconds and trying again."
        );
      } else {
        try {
          await ec2Client.waitForInstanceRunningStatus(instanceIdOrError);
        } catch (err) {
          // If this runner has long been terminated this transition will error out
          // Use this fact ot try again
          console.error(err);
          continue;
        }
        instanceId = instanceIdOrError;
        break;
      }
      // wait 10 seconds
      await new Promise((r) => setTimeout(r, 5000 * 2 ** backoff));
      backoff += 1;
    }
  }
  if (instanceId) {
    core.info("Successfully requested/found instance with ID " + instanceId);
  } else {
    core.error("Failed to get ID of running instance");
    throw Error("Failed to get ID of running instance");
  }
  return instanceId;
}

async function startBareSpot(config: ActionConfig) {
  if (config.subaction !== "start") {
    throw new Error(
      "Unexpected subaction for bare spot, only 'start' is allowed: " +
        config.subaction
    );
  }
  const ec2Client = new Ec2Instance(config);
  const instanceId = await requestAndWaitForSpot(config);
  const ip = await ec2Client.getPublicIpFromInstanceId(instanceId);

  const tempKeyPath = installSshKey(config.ec2Key);
  await standardSpawn("bash", ["-c", `echo SPOT_IP=${ip} >> $GITHUB_ENV`]);
  await standardSpawn("bash", [
    "-c",
    `echo SPOT_KEY=${tempKeyPath} >> $GITHUB_ENV`,
  ]);
  await establishSshContact(ip, config.ec2Key);
}

async function startBuilder(config: ActionConfig) {
  if (config.subaction === "stop") {
    await terminate("running");
    return "";
  } else if (config.subaction === "restart") {
    await terminate("running");
    // then we make a fresh instance
  } else if (config.subaction !== "start") {
    throw new Error("Unexpected subaction: " + config.subaction);
  }
  // subaction is 'start' or 'restart'estart'
  const ec2Client = new Ec2Instance(config);
  let spotStatus = await pollSpotStatus(config, ec2Client);
  let instanceId = "";
  let ip = "";


  if (spotStatus == "unusable") {
    core.warning(
      "Taking down spot as it has no SSH! If we were mistaken, this could impact existing jobs."
    );
    if (config.subaction === "restart") {
      throw new Error(
        "Taking down spot we just started. This seems wrong, erroring out."
      );
    }
    await terminate("running");
    spotStatus = "none";
  }
  if (spotStatus !== "none") {
    core.info(
      `Runner already running. Continuing as we can target it with jobs.`
    );
    instanceId = spotStatus;
    ip = await ec2Client.getPublicIpFromInstanceId(instanceId);
  } else {
    core.info(
      `Starting runner.`
    );
    instanceId = await requestAndWaitForSpot(config);
    ip = await ec2Client.getPublicIpFromInstanceId(instanceId);
    if (!(await establishSshContact(ip, config.ec2Key))) {
      return false;
    }
    if (config.githubActionRunnerConcurrency > 0) {
      await setupGithubRunners(ip, config);
    }
    core.info("Done setting up runner.")
  }
  // Export to github environment
  const tempKeyPath = installSshKey(config.ec2Key);
  await standardSpawn("bash", ["-c", `echo SPOT_IP=${ip} >> $GITHUB_ENV`]);
  await standardSpawn("bash", [
    "-c",
    `echo SPOT_KEY=${tempKeyPath} >> $GITHUB_ENV`,
  ]);
  return true;
}

function standardSpawn(command: string, args: string[]): Promise<string> {
  // Wrap the process execution in a Promise to handle asynchronous execution and output streaming
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio: 'inherit'});

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
function installSshKey(encodedSshKey: string) {
  const decodedKey = Buffer.from(encodedSshKey, "base64").toString("utf8");
  const tempKeyPath = "/tmp/ec2_ssh_key.pem";
  fs.writeFileSync(tempKeyPath, decodedKey, { mode: 0o600 });
  return tempKeyPath;
}

function trySsh(ip: string, encodedSshKey: string): boolean {
  const tempKeyPath = installSshKey(encodedSshKey);
  try {
    execSync(
      `ssh -q -o StrictHostKeyChecking=no -i ${tempKeyPath} -o ConnectTimeout=1 ubuntu@${ip} true`
    );
    core.info(`SSH connection with spot at ${ip} established`);
    return true;
  } catch {
    return false;
  }
}
async function establishSshContact(
  ip: string,
  encodedSshKey: string,
) {
  // Improved SSH connection retry logic
  let attempts = 0;
  const maxAttempts = 60;
  while (attempts < maxAttempts) {
    if (trySsh(ip, encodedSshKey)) {
      return true;
    }
    if (attempts >= maxAttempts - 1) {
      core.error(
        `Timeout: SSH could not connect to ${ip} within 60 seconds.`
      );
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Retry every second
    attempts++;
  }
}

async function terminate(instanceStatus?: string, cleanupRunners = true) {
  try {
    core.info("Starting instance cleanup");
    const config = new ActionConfig();
    const ec2Client = new Ec2Instance(config);
    const ghClient = new GithubClient(config);
    const instances = await ec2Client.getInstancesForTags(instanceStatus ? [instanceStatus]: []);
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

async function setupGithubRunners(ip: string, config: ActionConfig) {
  const ghClient = new GithubClient(config);
  const githubActionRunnerVersion = await ghClient.getRunnerVersion();
  // Retrieve runner registration tokens in parallel
  const tokens = await Promise.all(
    Array.from({ length: config.githubActionRunnerConcurrency }, () =>
      ghClient.getRunnerRegistrationToken()
    )
  );
  const runnerNameBase = `${config.githubJobId}-ec2`;
  // space-separated registration tokens
  const tokensSpaceSep = tokens.map((t) => t.token).join(" ");
  const bumpShutdown = `sudo shutdown -c ; sudo shutdown -P +${config.ec2InstanceTtl}`;
  // TODO could deregister runners right before shutdown starts
  const setupRunnerCmds = [
    // Shutdown rules:
    // - github actions job starts and ends always bump +ec2InstanceTtl minutes
    // - when the amount of started jobs (start_run_* files) equal the amount of finished jobs (end_run_* files), we shutdown in 5 minutes (with a reaper script installed later)
    "set -x",
    "sudo touch ~/.user-data-started",
    `cd ~`,
    `echo "${bumpShutdown}" > /home/ubuntu/delay_shutdown.sh`,
    "chmod +x /home/ubuntu/delay_shutdown.sh",
    "export ACTIONS_RUNNER_HOOK_JOB_STARTED=/home/ubuntu/delay_shutdown.sh",
    "export ACTIONS_RUNNER_HOOK_JOB_COMPLETED=/home/ubuntu/delay_shutdown.sh",
    "mkdir -p actions-runner && cd actions-runner",
    'echo "ACTIONS_RUNNER_HOOK_JOB_STARTED=/home/ubuntu/delay_shutdown.sh" > .env',
    'echo "ACTIONS_RUNNER_HOOK_JOB_COMPLETED=/home/ubuntu/delay_shutdown.sh" > .env',
    `GH_RUNNER_VERSION=${githubActionRunnerVersion}`,
    'case $(uname -m) in aarch64) ARCH="arm64" ;; amd64|x86_64) ARCH="x64" ;; esac && export RUNNER_ARCH=${ARCH}',
    "curl -O -L https://github.com/actions/runner/releases/download/v${GH_RUNNER_VERSION}/actions-runner-linux-${RUNNER_ARCH}-${GH_RUNNER_VERSION}.tar.gz",
    "tar xzf ./actions-runner-linux-${RUNNER_ARCH}-${GH_RUNNER_VERSION}.tar.gz",
    "mv externals ..", // we share the big binaries between all the runner folders, symlink instead of copy them
    // Note sharing bin doesn't work due to using it as a folder, and we don't bother splitting up sharing bin
    "rm ./actions-runner-linux-${RUNNER_ARCH}-${GH_RUNNER_VERSION}.tar.gz", // cleanup as we will copy our runner folder
    `TOKENS=(${tokensSpaceSep})`,
    `for i in {0..${config.githubActionRunnerConcurrency - 1}}; do`,
    `  cp -r . ../${runnerNameBase}-$i`,
    `  ln -s $(pwd)/../externals ../${runnerNameBase}-$i`,
    `  pushd ../${runnerNameBase}-$i`,
    `  echo \${TOKENS[i]} > .runner-token`,
    `  echo './config.sh $@ && ./run.sh' > config_and_run.sh`,
    `  nohup bash ./config_and_run.sh --unattended --url https://github.com/${github.context.repo.owner}/${github.context.repo.repo} --token \${TOKENS[i]} --labels ${config.githubActionRunnerLabel} --replace --name ${runnerNameBase}-$i 1>/dev/null 2>/dev/null &`,
    `  popd`,
    "done",
    "exit",
  ];
  const tempKeyPath = installSshKey(config.ec2Key);
  await standardSpawn("ssh", ["-o", "StrictHostKeyChecking=no", "-i", tempKeyPath, "-o", "ConnectTimeout=1", `ubuntu@${ip}`, "bash", "-c", setupRunnerCmds.join("\n")]);
}

(async function () {
  try {
    const config = new ActionConfig();
    if (config.ec2InstanceTags.includes("Builder")) {
      for (let i = 0; i < 3; i++) {
        // retry in a loop in case we can't ssh connect after a minute
        if (await startBuilder(config)) {
          break;
        }
      }
    } else {
      startBareSpot(config);
    }
  } catch (error) {
    terminate("running");
    assertIsError(error);
    core.error(error);
    core.setFailed(error.message);
  }
})();
