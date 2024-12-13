#!/bin/bash
source $(git rev-parse --show-toplevel)/ci3/source

# Trap function to terminate our running instance when the script exits.
function on_exit {
    aws_terminate_instance $iid $sir
}

if [ ! -f $HOME/.aws/build_instance_credentials ]; then
  echo "You need the build instance credentials located at: $HOME/.aws/build_instance_credentials"
  exit 1
fi

# Request new instance.
ip_sir=$(aws_request_instance ami_update 4 x86_64)
parts=(${ip_sir//:/ })
ip="${parts[0]}"
sir="${parts[1]}"
iid="${parts[2]}"
trap on_exit EXIT

# Initial setup.
ssh -t -F build_instance_ssh_config ubuntu@$ip "
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt update
  sudo apt install -y apt-transport-https ca-certificates curl software-properties-common awscli docker-ce
  sudo usermod -aG docker ${USER}
  mkdir .aws
  mkdir .bb-crs
"

# Copy aws credentials onto machine.
scp -F build_instance_ssh_config $HOME/.aws/build_instance_credentials ubuntu@ip:.aws/credentials

# Pull ci:2.0 onto host, and build:2.0 into docker-in-docker volume.
ssh -t -F build_instance_ssh_config ubuntu@$ip "
  docker run --privileged -ti --rm -v boostrap_ci_local_docker:/var/lib/docker aztecprotocol/ci:2.0 bash -c '
    /usr/local/share/docker-init.sh &> /dev/null
    sleep 5
    docker pull aztecprotocol/build:2.0
    '
"

# Untested.
# export AWS_DEFAULT_REGION=us-east-2
# ami_id=$(aws ec2 create-image --instance-id "$iid" --name "build-instance-$(uname -m)-$(date +'%d%m%y')" --query "ImageId" --output text)
# aws ec2 wait image-available --image-ids "$ami_id"
# echo "$ami_id"