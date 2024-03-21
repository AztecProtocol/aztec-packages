#!/bin/bash

# Setup environment variables
echo "Setting up environment variables..."
echo FORCE_COLOR=1 >> $GITHUB_ENV

# Docker login
echo "Logging in to Docker..."
echo $1 | docker login -u aztecprotocolci --password-stdin

# Install earthly-cloud and earthly-cloud-bench
echo "PATH=$(dirname $(realpath $0)):$PATH" >> $GITHUB_ENV