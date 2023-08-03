# Canary

This package is designed for running a comprehensive end to end test of the system using deployed artifacts. It is built and executed after the deployment of artifacts to npm and dockerhub.

## Development

If you have an instance of the aztec-sandbox running, then you can simply run `yarn test uniswap` to execute the test.

To build and execute the test first run `bootstrap_docker.sh` from the root of aztec-packages followed by `docker-compose up` from within `canary/scripts`.
