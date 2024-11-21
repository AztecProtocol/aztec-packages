#!/bin/bash

cd $(dirname $0)

ip=$(./build-system/scripts/request_spot)

ssh ubuntu@$ip "
  cd /root
  git clone http://github.com/aztecprotocol/aztec-packages
  cd aztec-packages
  git checkout cl/ci3
  CI=1 ./bootstrap.sh full
"
