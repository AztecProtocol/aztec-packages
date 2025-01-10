#!/bin/bash
source $(git rev-parse --show-toplevel)/ci3/source

# Trap function to terminate our running instance when the script exits.
function on_exit {
    [ "${NO_TERMINATE:-0}" -eq 0 ] && aws_terminate_instance $iid $sir
}

if [ ! -f $HOME/.aws/build_instance_credentials ]; then
  echo "You need the build instance credentials located at: $HOME/.aws/build_instance_credentials"
  exit 1
fi

# Request new instance (ami: ubuntu 24.04 LTS).
ip_sir=$(AMI=ami-036841078a4b68e14 aws_request_instance ami_update 4 x86_64)
parts=(${ip_sir//:/ })
ip="${parts[0]}"
sir="${parts[1]}"
iid="${parts[2]}"
trap on_exit EXIT

echo "Instance ip: $ip"

# Initial setup.
ssh -t -F build_instance_ssh_config ubuntu@$ip '
  set -e
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt update
  sudo apt install -y apt-transport-https ca-certificates curl software-properties-common docker-ce
  sudo usermod -aG docker ${USER}
  mkdir .aws
'

# Copy aws credentials onto machine.
scp -F build_instance_ssh_config $HOME/.aws/build_instance_credentials ubuntu@$ip:.aws/credentials

# Download crs onto machine.
ssh -t -F build_instance_ssh_config ubuntu@$ip < ../../barretenberg/scripts/download_bb_crs.sh

# Pull devbox onto host, and build into docker-in-docker volume.
ssh -t -F build_instance_ssh_config ubuntu@$ip "
  docker run --privileged -ti --rm -v bootstrap_ci_local_docker:/var/lib/docker $DEVBOX_IMAGE bash -c \"
    docker pull $ISOLATION_IMAGE
  \"
"

if [ "${NO_AMI:-0}" -eq 0 ]; then
  export AWS_DEFAULT_REGION=us-east-2
  ami_id=$(aws ec2 create-image \
    --instance-id "$iid" \
    --name "build-instance-$(arch)-$(date +'%d%m%y%H%M')" \
    --query "ImageId" \
    --output text)
  echo "Waiting for AMI to be created: $ami_id"
  while ! aws ec2 wait image-available --image-ids "$ami_id"; do true; done
  echo "Done."
fi