########################################################################################################################
# A minimal ubuntu setup. Used for testing releases.
FROM ubuntu:noble AS dind
RUN apt update && apt install -y \
      curl \
      git \
      build-essential \
      python3 \
      nodejs \
    rm -rf /var/lib/apt/lists/*
RUN npm i -g verdaccio
RUN touch /aztec_release_test_container
