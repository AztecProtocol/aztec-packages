#!/bin/bash
# Utility to get the names of all contracts
echo $(ls -d src/crates/*/Nargo.toml | sed -r "s/src\\/crates\\/(.+)\\/Nargo.toml/\\1/")