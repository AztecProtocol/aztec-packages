#!/bin/bash
(cd cpp && ./bootstrap.sh)
cd ts
yarn install
yarn build
npm link
