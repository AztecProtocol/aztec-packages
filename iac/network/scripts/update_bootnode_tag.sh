#!/usr/bin/env bash

# This script will SSH into the provided HOST, write a new tag file and restart the bootnode service

SSH_KEY_FILE=${1:-}
USER=${2:-}
HOST=${3:-}
TAG=${4:-}

FILE=/home/$USER/tag.sh
SERVICE_NAME=aztec-bootnode

ssh -i $SSH_KEY_FILE $USER@$HOST << ENDSSH
  echo "Updating the target file..."
  sudo bash -c 'cat << ENDFILE > $FILE
  #!/usr/bin/env bash
  export TAG=$TAG
ENDFILE'

  # Make the script executable
  sudo chmod +x $FILE

  echo "Restarting the systemd service..."
  sudo systemctl restart $SERVICE_NAME
ENDSSH

if [ $? -eq 0 ]; then
  echo "File updated and service restarted successfully"
else
  echo "Failed to update the file or restart the service"
fi
