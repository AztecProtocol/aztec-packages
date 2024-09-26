import { ConfigInterface } from "./config";
import { GithubClient } from "./github";

export class UserData {
  config: ConfigInterface;

  constructor(config: ConfigInterface) {
    this.config = config;
  }

  async getUserData(): Promise<string> {
    if (!this.config.githubActionRunnerLabel)
      throw Error("failed to object job ID for label");
    // Note, we dont make the runner ephemeral as we start fresh runners as needed
    // and delay shutdowns whenever jobs start
    const cmds = [
      "#!/bin/bash",
      `exec 1>/run/log.out 2>&1`, // Log to /run/log.out
      "touch /home/ubuntu/.user-data-started",
      `shutdown -P +${this.config.ec2InstanceTtl}`,
      `echo '{"default-address-pools":[{"base":"172.17.0.0/12","size":20}, {"base":"10.99.0.0/12","size":20}, {"base":"192.168.0.0/16","size":24}]}' > /etc/docker/daemon.json`,
      `sudo service docker restart`,
      "sudo wget -q https://github.com/earthly/earthly/releases/download/v0.8.10/earthly-linux-$(dpkg --print-architecture) -O /usr/local/bin/earthly",
      "sudo chmod +x /usr/local/bin/earthly",
      `sudo bash -c 'cat <<EOF > /etc/apt/apt.conf.d/99-aztec-build
Acquire::Retries "3";
Acquire::https::Timeout "240";
Acquire::http::Timeout "240";
APT::Get::Assume-Yes "true";
APT::Install-Recommends "false";
APT::Install-Suggests "false";
EOF'`,
      "sudo apt install -y brotli",
      'echo "MaxStartups 1000" >> /etc/ssh/sshd_config',
      'echo "ClientAliveInterval=30" >> /etc/ssh/sshd_config',
      'echo "ClientAliveCountMax=20" >> /etc/ssh/sshd_config',
// kludge until AMI is updated with this dependency
`
command -v npm >/dev/null || (sudo apt update && sudo apt install -y npm)
command -v lsof >/dev/null || (sudo apt update && sudo apt install -y lsof)
echo "Installing NVM (Node Version Manager)..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

# Ensure nvm is installed and node is at least version 18
if [[ "\${CURRENT_NODE_VERSION:1}" < "\${REQUIRED_NODE_VERSION:1}" ]]; then
  echo "Node.js version is less than 18. Checking for NVM..."
  if ! command -v nvm >/dev/null 2>&1; then
    install_nvm
  else
    echo "NVM is already installed."
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # Load NVM
  fi

  echo "Installing and using Node.js version 18..."
  nvm install 18
  nvm use 18
  nvm alias default 18
fi
`,
      "sudo service sshd restart",
      "touch /home/ubuntu/.user-data-finished",
    ];
    console.log(
      "Sending: ",
      cmds.join("\n")
    );
    return Buffer.from(cmds.join("\n")).toString("base64");
  }
}
