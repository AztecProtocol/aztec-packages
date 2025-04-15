########################################################################################################################
# A pure ubuntu + docker install. Used for testing releases.
FROM ubuntu:noble AS dind
RUN apt-get update && apt-get install -y curl
RUN curl -fsSL https://raw.githubusercontent.com/devcontainers/features/refs/heads/main/src/docker-in-docker/install.sh | bash
RUN touch /aztec_release_test_container
