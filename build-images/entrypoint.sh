#!/bin/bash
set -eu

# Modify the uid and gid of aztec-dev to match that of the host users.
groupmod -g $LOCAL_GROUP_ID aztec-dev
usermod -u $LOCAL_USER_ID aztec-dev &> /dev/null

# Modify the gid of the docker group to match the docker socket's gid.
# Check if this gid is already being used by another group, modify existing if so.
SOCKET_GID=$(stat -c %g /var/run/docker.sock)
EXISTING_GROUP=$(getent group $SOCKET_GID | cut -d: -f1)
if [ -z "$EXISTING_GROUP" ]; then
    # No existing group with that gid, so create one called 'docker' and add the user to it.
    groupadd -g $SOCKET_GID docker
    usermod -aG docker aztec-dev
else
    # A group with the desired gid already exists, add the user to it.
    usermod -aG $EXISTING_GROUP aztec-dev
fi

# Make npm global installs go the users home directory.
gosu aztec-dev mkdir -p /home/aztec-dev/.npm-global
gosu aztec-dev npm config set prefix '/home/aztec-dev/.npm-global'
export PATH=/home/aztec-dev/.npm-global/bin:/home/aztec-dev/.cargo/bin:$PATH
export CARGO_HOME=/home/aztec-dev/.cargo

exec /usr/sbin/gosu aztec-dev "$@"