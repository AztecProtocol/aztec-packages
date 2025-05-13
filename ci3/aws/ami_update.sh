#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

arch=${ARCH:-$(arch)}

[ -t 1 ] && ssh_args="-t" || ssh_args=""

# Trap function to terminate our running instance when the script exits.
function on_exit {
    [ "${NO_TERMINATE:-0}" -eq 0 ] && aws_terminate_instance $iid $sir
}

if [ ! -f $HOME/.aws/build_instance_credentials ]; then
  echo "You need the build instance credentials located at: $HOME/.aws/build_instance_credentials"
  exit 1
fi

case "$arch" in
  "amd64")
    ami="ami-04f167a56786e4b09"
    ;;
  "arm64")
    ami="ami-0ae6f07ad3a8ef182"
    ;;
  *)
    echo "Unknown arch: $ARCH"
    exit 1
esac

# Request new instance (ami: ubuntu 24.04 LTS).
ip_sir=$(AMI=$ami aws_request_instance ami_update_$arch 4 $arch)
parts=(${ip_sir//:/ })
ip="${parts[0]}"
sir="${parts[1]}"
iid="${parts[2]}"
trap on_exit EXIT

echo "Instance ip: $ip"

# Initial setup.
ssh $ssh_args -F build_instance_ssh_config ubuntu@$ip '
  set -e
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt update
  sudo apt install -y apt-transport-https ca-certificates curl software-properties-common docker-ce
  sudo usermod -aG docker ${USER}
  mkdir .aws
'

# Download crs onto machine.
ssh $ssh_args -F build_instance_ssh_config ubuntu@$ip < ../../barretenberg/scripts/download_bb_crs.sh

# Pull devbox onto host, and build into docker-in-docker volume.
ssh $ssh_args -F build_instance_ssh_config ubuntu@$ip "
  docker run --privileged --rm -v bootstrap_ci_local_docker:/var/lib/docker aztecprotocol/devbox:3.0 bash -c \"
    docker pull aztecprotocol/build:3.0
  \"
"

if [ "${NO_AMI:-0}" -eq 0 ]; then
  export AWS_DEFAULT_REGION=us-east-2
  ami_id=$(aws ec2 create-image \
    --instance-id "$iid" \
    --name "build-instance-$arch-$(date +'%d%m%y%H%M')" \
    --query "ImageId" \
    --output text)
  echo "Waiting for AMI to be created: $ami_id"
  while ! aws ec2 wait image-available --image-ids "$ami_id"; do true; done
  echo "$ami_id" > ami_id_$arch
  echo "Done."
fi
