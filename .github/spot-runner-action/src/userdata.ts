import * as github from "@actions/github";
import { ConfigInterface } from "./config";
import { GithubClient } from "./github";

export class UserData {
  config: ConfigInterface;

  constructor(config: ConfigInterface) {
    this.config = config;
  }

  async getUserDataForBareSpot(): Promise<string> {
    const cmds = [
      "#!/bin/bash",
      `exec 1>/run/log.out 2>&1`, // Log to /run/log.out
      `shutdown -P +${this.config.ec2InstanceTtl}`,
      `echo '{"default-address-pools":[{"base":"172.17.0.0/12","size":20}, {"base":"10.99.0.0/12","size":20}, {"base":"192.168.0.0/16","size":24}]}' > /etc/docker/daemon.json`,
      `sudo service docker restart`,
      "sudo apt install -y brotli",
      // NOTE also update versions below and in .github/ci-setup-action/action.yml
      "sudo wget -q https://github.com/earthly/earthly/releases/download/v0.8.9/earthly-linux-$(dpkg --print-architecture) -O /usr/local/bin/earthly",
      "sudo chmod +x /usr/local/bin/earthly",
    ];
    console.log(
      "Sending: ",
      cmds.filter((x) => !x.startsWith("TOKENS")).join("\n")
    );
    return Buffer.from(cmds.join("\n")).toString("base64");
  }

  async getUserDataForGithubRunners(): Promise<string> {
    const ghClient = new GithubClient(this.config);
    const githubActionRunnerVersion = await ghClient.getRunnerVersion();
    // Retrieve runner registration tokens in parallel
    const tokens = await Promise.all(
      Array.from({ length: this.config.githubActionRunnerConcurrency }, () =>
        ghClient.getRunnerRegistrationToken()
      )
    );
    if (!this.config.githubActionRunnerLabel)
      throw Error("failed to object job ID for label");
    const runnerNameBase = `${this.config.githubJobId}-ec2`;
    // space-separated registration tokens
    const tokensSpaceSep = tokens.map((t) => t.token).join(" ");
    const bumpShutdown = `shutdown -c ; shutdown -P +${this.config.ec2InstanceTtl}`;
    // Note, we dont make the runner ephemeral as we start fresh runners as needed
    // and delay shutdowns whenever jobs start
    // TODO could deregister runners right before shutdown starts
    const setupRunnerCmds = [
      // Shutdown rules:
      // - github actions job starts and ends always bump +ec2InstanceTtl minutes
      // - when the amount of started jobs (start_run_* files) equal the amount of finished jobs (end_run_* files), we shutdown in 5 minutes (with a reaper script installed later)
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
      `for i in {0..${this.config.githubActionRunnerConcurrency - 1}}; do`,
      `  ( cp -r . ../${runnerNameBase}-$i && ln -s $(pwd)/../externals ../${runnerNameBase}-$i && cd ../${runnerNameBase}-$i && echo \${TOKENS[i]} > .runner-token && ./config.sh --unattended --url https://github.com/${github.context.repo.owner}/${github.context.repo.repo} --token \${TOKENS[i]} --labels ${this.config.githubActionRunnerLabel} --replace --name ${runnerNameBase}-$i ; ./run.sh ) &`,
      "done",
      "wait", // Wait for all background processes to finish
    ];
    const runners = Buffer.from(setupRunnerCmds.join("\n")).toString("base64");
    const cmds = [
      "#!/bin/bash",
      `exec 1>/run/log.out 2>&1`, // Log to /run/log.out
      `shutdown -P +${this.config.ec2InstanceTtl}`,
      `echo '{"default-address-pools":[{"base":"172.17.0.0/12","size":20}, {"base":"10.99.0.0/12","size":20}, {"base":"192.168.0.0/16","size":24}]}' > /etc/docker/daemon.json`,
      `sudo service docker restart`,
      "sudo wget -q https://github.com/earthly/earthly/releases/download/v0.8.9/earthly-linux-$(dpkg --print-architecture) -O /usr/local/bin/earthly",
      "sudo chmod +x /usr/local/bin/earthly",
      "cd /run",
      "sudo apt install -y brotli",
      'echo "MaxStartups 1000" >> /etc/ssh/sshd_config',
      "sudo service sshd restart",
      `echo ${runners} | base64 --decode > /run/setup-runners.sh`,
      `sudo -u ubuntu bash /run/setup-runners.sh`,
    ];
    console.log(
      "Sending: ",
      cmds.filter((x) => !x.includes(runners)).join("\n")
    );
    return Buffer.from(cmds.join("\n")).toString("base64");
  }
}
