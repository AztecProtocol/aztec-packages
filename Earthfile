VERSION 0.8
FROM ubuntu:noble

build:
    # yarn-project has the entry point to Aztec
    BUILD ./yarn-project/+build

release-meta:
    COPY .release-please-manifest.json /usr/src/.release-please-manifest.json
    SAVE ARTIFACT /usr/src /usr/src

scripts:
    FROM scratch
    COPY scripts /usr/src/scripts
    SAVE ARTIFACT /usr/src/scripts scripts

UPLOAD_LOGS:
    FUNCTION
    ARG PULL_REQUEST
    ARG BRANCH
    ARG COMMIT_HASH
    ARG LOG_FILE=./log
    LOCALLY
    LET COMMIT_HASH="${COMMIT_HASH:-$(git rev-parse HEAD)}"
    FROM +base-log-uploader
    COPY $LOG_FILE /usr/var/log
    ENV PULL_REQUEST=$PULL_REQUEST
    ENV BRANCH=$BRANCH
    ENV COMMIT_HASH=$COMMIT_HASH
    RUN --secret AWS_ACCESS_KEY_ID --secret AWS_SECRET_ACCESS_KEY /usr/src/scripts/logs/upload_logs_to_s3.sh /usr/var/log

base-log-uploader:
    # Install awscli on a fresh ubuntu, and copy the repo "scripts" folder, which we'll use to upload logs
    # Note that we cannot do this LOCALLY because Earthly does not support using secrets locally
    FROM ubuntu:noble
    RUN apt update && \
        apt install -y curl git jq unzip
    RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o "awscliv2.zip" && \
        unzip awscliv2.zip && \
        ./aws/install --bin-dir /usr/local/bin --install-dir /usr/local/aws-cli --update && \
        rm -rf aws awscliv2.zip
    COPY +scripts/scripts /usr/src/scripts

bootstrap:
  # Note: Assumes EARTHLY_GIT_HASH has been pushed!
  FROM ./build-images+from-registry
  # Can be set for forced cache hits:
  #ENV AZTEC_CACHE_COMMIT=6abb3ef82027151716dfb7f22fa655cf8f119168
  ARG EARTHLY_GIT_HASH
  WORKDIR /build-volume
  # Use a cache volume for performance
  RUN --secret AWS_ACCESS_KEY_ID --secret AWS_SECRET_ACCESS_KEY --mount type=cache,id=bootstrap-$EARTHLY_GIT_HASH,target=/build-volume \
    rm -rf $(ls -A) && \
    git init 2>/dev/null && \
    git remote add origin https://github.com/aztecprotocol/aztec-packages 2>/dev/null && \
    git fetch --depth 1 origin $AZTEC_CACHE_COMMIT 2>/dev/null && \
    (git fetch --depth 1 origin $EARTHLY_GIT_HASH 2>/dev/null || (echo "The commit was not pushed, run aborted." && exit 1)) && \
    git reset --hard FETCH_HEAD && \
    CI=1 TEST=0 ./bootstrap.sh fast && \
    mv $(ls -A) /usr/src
  WORKDIR /usr/src
  SAVE ARTIFACT /usr/src /usr/src