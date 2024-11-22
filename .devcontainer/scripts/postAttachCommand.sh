#!/usr/bin/env bash

apt update
apt install gh
gh codespace ports visibility 8080:public -c $CODESPACE_NAME

aztec start --sandbox
