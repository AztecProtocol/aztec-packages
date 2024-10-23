#!/bin/bash

if grep -qF "$1" ./compose_e2e_test_list; then
  echo "Running compose test"
else
  echo "Running normal test"
fi
