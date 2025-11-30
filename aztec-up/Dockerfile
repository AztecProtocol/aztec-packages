########################################################################################################################
# A minimal ubuntu setup. Used for testing releases.
FROM ubuntu:noble AS dind
RUN apt update && apt install -y \
      curl \
      git \
      build-essential \
      python3 \
      netcat-openbsd \
      parallel \
      jq \
    && rm -rf /var/lib/apt/lists/*
COPY --chown=1000:1000 verdaccio-storage /home/ubuntu/verdaccio-storage
RUN touch /aztec_release_test_container
