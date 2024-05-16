#!/bin/bash
set -eu

EBS_CACHE_TAG=$1
SIZE=$2
REGION="us-east-2"
AVAILABILITY_ZONE="us-east-2a"
INSTANCE_ID=$(curl http://169.254.169.254/latest/meta-data/instance-id)

# Check for existing volume
# we don't filter by available - we want to just error if it's attached already
# this means we are in a weird state (two spot instances running etc)
EXISTING_VOLUME=$(aws ec2 describe-volumes \
  --region $REGION \
  --filters "Name=tag:username,Values=$EBS_CACHE_TAG-$SIZE-gp3" \
  --query "Volumes[0].VolumeId" \
  --output text)

# Check if someone else is doing this
if [ -f ~/.ebs-cache-mounted ] ; then
  MAX_WAIT_TIME=300 # Maximum wait time in seconds
  WAIT_INTERVAL=10  # Interval between checks in seconds
  elapsed_time=0
  # Check for existing mount, assume we can continue if existing

  while ! mount | grep -q "/var/lib/docker type ext4"; do
    echo "Someone already marked as mounting, terminating any stopped instances and waiting..."
    # Identify and terminate instances in 'STOPPED' state that are using this volume
    STOPPED_INSTANCES=$(aws ec2 describe-instances \
      --region $REGION \
      --filters "Name=instance-state-name,Values=stopped" "Name=block-device-mapping.volume-id,Values=$EXISTING_VOLUME" \
      --query "Reservations[*].Instances[*].InstanceId" \
      --output text)

    for instance in $STOPPED_INSTANCES; do
      echo "Terminating instance $instance"
      aws ec2 terminate-instances --instance-ids $instance
    done
    if [ $elapsed_time -ge $MAX_WAIT_TIME ]; then
      echo "Cache mount did not become available within $MAX_WAIT_TIME seconds... race condition?"
      exit 1
    fi

    sleep $WAIT_INTERVAL
    elapsed_time=$((elapsed_time + WAIT_INTERVAL))
  done
  echo "Detected existing mount, continuing..."

  for i in {1..60} ; do
    [ -f ~/.setup-complete ] && break
    sleep 1
    echo "Waiting for other mount to finish."
  done
  if [ -f ~/.setup-complete ] ; then
    echo "Failed to find mount! Taking mount lock and trying..."
    rm -f ~/.ebs-cache-mounted
  else
    exit 0
  fi
fi

# Mark to prevent race conditions
touch ~/.ebs-cache-mounted

# Check for existing mount, assume we can continue if existing
if mount | grep -q "/var/lib/docker/volumes type ext4"; then
  echo "Detected mount existing on /var/lib/docker/volumes. This is our old mount."
  echo "Run the stop spot workflow https://github.com/AztecProtocol/aztec-packages/actions/workflows/stop-spot.yml and rerun all steps in this workflow."
  exit 0
fi

# Check for existing mount, assume we can continue if existing
if mount | grep -q "/var/lib/docker type ext4"; then
  echo "Detected mount existing on /var/lib/docker already"
  echo "Continuing..."
  exit 0
fi

# If no existing volume, create one
if [ "$EXISTING_VOLUME" == "None" ]; then
  VOLUME_ID=$(aws ec2 create-volume \
    --region $REGION \
    --availability-zone $AVAILABILITY_ZONE \
    --size $SIZE \
    --volume-type gp3 \
    --throughput 1000 \
    --iops 5000 \
    --tag-specifications "ResourceType=volume,Tags=[{Key=username,Value=$EBS_CACHE_TAG-$SIZE-gp3}]" \
    --query "VolumeId" \
    --output text)
else
  VOLUME_ID=$EXISTING_VOLUME
fi

MAX_WAIT_TIME=300 # Maximum wait time in seconds
WAIT_INTERVAL=10  # Interval between checks in seconds
elapsed_time=0
# Wait for the volume to become available
echo "Waiting for volume $VOLUME_ID to become available..."
while [ "$(aws ec2 describe-volumes \
  --region $REGION \
  --volume-ids $VOLUME_ID \
  --query "Volumes[0].State" \
  --output text)" != "available" ]; do
  if [ $elapsed_time -ge $MAX_WAIT_TIME ]; then
    echo "Volume $VOLUME_ID did not become available within $MAX_WAIT_TIME seconds."
    exit 1
  fi

  sleep $WAIT_INTERVAL
  elapsed_time=$((elapsed_time + WAIT_INTERVAL))
done

# Attach volume to the instance
aws ec2 attach-volume \
  --region $REGION \
  --volume-id $VOLUME_ID \
  --instance-id $INSTANCE_ID \
  --device /dev/xvdb

# Wait for the volume to be attached
while [ "$(aws ec2 describe-volumes \
  --region $REGION \
  --volume-ids $VOLUME_ID \
  --query "Volumes[0].Attachments[0].State" \
  --output text)" != "attached" ]; do
  sleep 1
done

# We are expecting the device to come up as /dev/nvme1n1, but include generic code from
# https://github.com/slavivanov/ec2-spotter/blob/master/ec2spotter-remount-root
while true; do
    if lsblk /dev/nvme1n1; then
        BLKDEVICE=/dev/nvme1n1
        # DEVICE=/dev/nvme1n1p1
        break
    fi
    if lsblk /dev/xvdb; then
        BLKDEVICE=/dev/xvdb
        # DEVICE=/dev/xvdb1
        break
    fi
    echo "waiting for device to attach"
    sleep 5
done

# Create a file system if it does not exist
if ! file -s $BLKDEVICE | grep -q ext4; then
  mkfs -t ext4 $BLKDEVICE
fi

# Create a mount point and mount the volume
mkdir -p /var/lib/docker
mount $BLKDEVICE /var/lib/docker
# clear our images temp folder
rm -rf /var/lib/docker/tmp-images
systemctl restart docker
# important: everything (except earthly ls) should go through earthly-ci
scripts/earthly-ci bootstrap
touch /home/ubuntu/.setup-complete
