#!/usr/bin/env bash

# Load utility functions (e.g., aws_terminate_instance, aws_request_instance)
source "$(git rev-parse --show-toplevel)/ci3/source"

# --- Configuration ---
# Determine architecture, defaulting to system architecture if ARCH is not set.
arch=${ARCH:-$(arch)}
# Determine the AMI ID based on architecture. AMI IDs are region-specific.
# ASSUMPTION: These AMIs are valid in the region where aws_request_instance is called.
case "$arch" in
  "amd64")
    ami="ami-04f167a56786e4b09"
    ;;
  "arm64")
    ami="ami-0ae6f07ad3a8ef182"
    ;;
  *)
    echo "Unknown arch: $arch" >&2
    exit 1
esac

# Check for required local credentials.
if [ ! -f "$HOME/.aws/build_instance_credentials" ]; then
  echo "Error: Build instance credentials missing at: $HOME/.aws/build_instance_credentials" >&2
  exit 1
fi

# Set SSH arguments: use pseudo-terminal (-t) only if the script is running interactively.
ssh_args=""
if [ -t 1 ]; then
  ssh_args="-t"
fi

# --- Instance Lifecycle Management ---

# Request new instance (ami: assumed Ubuntu 24.04 LTS).
# ami_update_<arch> is likely a template for instance size/type.
echo "Requesting new EC2 instance for $arch architecture (AMI: $ami)..."
ip_sir=$(AMI=$ami aws_request_instance ami_update_$arch 4 $arch)

# Validate the request succeeded and parse outputs.
if [ -z "$ip_sir" ]; then
    echo "Error: Failed to request AWS instance." >&2
    exit 1
fi

IFS=':' read -r ip sir iid <<< "$ip_sir"

# Trap function to ensure the instance is terminated upon script exit.
function on_exit {
    echo "Executing trap function: Terminating instance $iid..." >&2
    [ "${NO_TERMINATE:-0}" -eq 0 ] && aws_terminate_instance "$iid" "$sir"
}

trap on_exit EXIT
echo "Instance IP: $ip (ID: $iid, SIR: $sir)"

# --- Initial Setup on Remote Instance ---

# Consolidated SSH command for setting up Docker and initial directories.
ssh $ssh_args -F build_instance_ssh_config ubuntu@$ip '
  # Use set -eux for robust error checking and debugging output
  set -eux
  
  echo "Installing Docker and required tools..."
  
  # Install necessary tools
  sudo apt update
  sudo apt install -y apt-transport-https ca-certificates curl software-properties-common
  
  # Add Docker GPG key and repository source
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  
  # Use the standard stable distribution name for Docker list
  DOCKER_ARCH=$(dpkg --print-architecture)
  DIST_CODENAME=$(lsb_release -cs)
  echo "deb [arch=${DOCKER_ARCH} signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu ${DIST_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  
  # Install Docker CE
  sudo apt update
  sudo apt install -y docker-ce
  
  # Add the "ubuntu" user to the docker group. 
  # IMPORTANT: The user must log out/in for this to take effect.
  # Since the subsequent command is a new ssh session, it will rely on the privileged D-I-D setup 
  # or requires the group change to be effective, which often isn't possible in a single session.
  # For CI scripts, subsequent docker commands usually rely on 'sudo' or use docker-in-docker (as below).
  sudo usermod -aG docker ubuntu
  
  # Create .aws directory for later credential transfer (if needed)
  mkdir -p .aws 
'

# --- Project Specific Setup ---

echo "Downloading CRS (Common Reference String) onto the remote machine..."
# Use an explicit pipe for file transfer for better readability than < ../../...
ssh $ssh_args -F build_instance_ssh_config ubuntu@$ip < ../../barretenberg/crs/bootstrap.sh

echo "Pulling devbox image and setting up docker-in-docker volume..."
# Build the CI environment image into the persistent Docker volume.
# No need for the outer 'docker run --privileged' unless the *host* needs to interact with the volume directly.
# The original logic is retained but clarified: uses privileged access for d-i-d setup.
ssh $ssh_args -F build_instance_ssh_config ubuntu@$ip "
  set -e
  docker run --privileged --rm -v bootstrap_ci_local_docker:/var/lib/docker aztecprotocol/devbox:3.0 bash -c \"
    docker pull aztecprotocol/build:3.0
  \"
"

# --- Optional AMI Creation (The 'Golden Image' Step) ---

if [ "${NO_AMI:-0}" -eq 0 ]; then
  # FIX: Set region for AMI creation explicitly.
  export AWS_DEFAULT_REGION=us-east-2
  echo "--- Starting AMI Creation in $AWS_DEFAULT_REGION ---"

  ami_name="build-instance-$arch-$(date +'%d%m%y%H%M')"
  
  ami_id=$(aws ec2 create-image \
    --instance-id "$iid" \
    --name "$ami_name" \
    --description "Aztec CI Build Instance with Docker pre-pulled" \
    --query "ImageId" \
    --output text)
    
  echo "Waiting for AMI to be created: $ami_id"
  # Use the --region flag for the wait command to ensure it checks the correct region.
  while ! aws ec2 wait image-available --image-ids "$ami_id" --region "$AWS_DEFAULT_REGION"; do sleep 10; done
  
  echo "$ami_id" > "ami_id_$arch"
  echo "AMI Creation Done. Saved ID to ami_id_$arch."
fi
