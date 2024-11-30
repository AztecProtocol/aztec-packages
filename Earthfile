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

bootstrap-test:
    # Note: Assumes EARTHLY_BUILD_SHA has been pushed!
    FROM ./build-images+ci-registry
    WORKDIR /usr/src
    ARG EARTHLY_GIT_HASH
    # Use a cache volume for performance
    RUN --mount type=cache,id=bootstrap-$EARTHLY_GIT_HASH,target=/usr/src/ \
        /usr/local/share/docker-init.sh &> /dev/null
    RUN --mount type=cache,id=bootstrap-$EARTHLY_GIT_HASH,target=/usr/src/ \
        rm -rf * .git
    RUN --mount type=cache,id=bootstrap-$EARTHLY_GIT_HASH,target=/usr/src/ \
        git init
    RUN --mount type=cache,id=bootstrap-$EARTHLY_GIT_HASH,target=/usr/src/ \
        git remote add origin https://github.com/aztecprotocol/aztec-packages
    RUN --mount type=cache,id=bootstrap-$EARTHLY_GIT_HASH,target=/usr/src/ \
        git fetch --depth 1 origin $EARTHLY_GIT_HASH && git reset --hard FETCH_HEAD
    RUN --mount type=cache,id=bootstrap-$EARTHLY_GIT_HASH,target=/usr/src/ \
        scripts/tests/bootstrap/test

bootstrap:
    # Note: Assumes EARTHLY_BUILD_SHA has been pushed!
    FROM ./build-images+from-registry
    WORKDIR /usr/build
    ARG EARTHLY_GIT_HASH
    ENV AZTEC_CACHE_COMMIT=7100222db0a2a326ea4238f783f1c524a2880d8e
    # Use a cache volume for performance
    RUN --secret AWS_ACCESS_KEY_ID --secret AWS_SECRET_ACCESS_KEY --mount type=cache,id=bootstrap-$EARTHLY_GIT_HASH,target=/usr/build/ \
        rm -rf * .git && \
        git init 2>/dev/null && \
        git remote add origin https://github.com/aztecprotocol/aztec-packages 2>/dev/null && \
        # Verify that the commit exists on the remote. It will be the remote tip of itself if so.
        git fetch --depth 1 origin $AZTEC_CACHE_COMMIT 2>/dev/null && \
        (git fetch --depth 1 origin $EARTHLY_GIT_HASH 2>/dev/null || (echo "The commit was not pushed, run aborted." && exit 1)) && \
        git reset --hard FETCH_HEAD && \
        CI=1 TEST=0 ./bootstrap.sh fast && \
        mv /usr/build /usr/src

bootstrap-aztec:
    FROM +bootstrap
    # TODO Copied from yarn-project+build, move into bootstrap.sh before yarn test
    WORKDIR /usr/src/yarn-project
    COPY . .
    ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
    RUN cd ivc-integration && npx playwright install && npx playwright install-deps
    SAVE ARTIFACT /usr/src /usr/src

aztec:
    FROM ubuntu:noble
    RUN apt update && apt install nodejs curl jq -y && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
    COPY +bootstrap-aztec/usr/src /usr/src
    ENV BB_WORKING_DIRECTORY=/usr/src/bb
    ENV BB_BINARY_PATH=/usr/src/barretenberg/cpp/build/bin/bb
    ENV ACVM_WORKING_DIRECTORY=/usr/src/acvm
    ENV ACVM_BINARY_PATH=/usr/src/noir/noir-repo/target/release/acvm
    RUN mkdir -p $BB_WORKING_DIRECTORY $ACVM_WORKING_DIRECTORY /usr/src/yarn-project/world-state/build
    ENTRYPOINT ["node", "--no-warnings", "/usr/src/yarn-project/aztec/dest/bin/index.js"]
    LET port=8080
    ENV PORT=$port
    HEALTHCHECK --interval=10s --timeout=10s --retries=6 --start-period=120s \
        CMD curl -fsS http://127.0.0.1:$port/status
    EXPOSE $port
    ARG EARTHLY_GIT_HASH
    SAVE IMAGE aztecprotocol/aztec:$EARTHLY_GIT_HASH

# We care about creating a slimmed down e2e image because we have to serialize it from earthly to docker for running.
bootstrap-end-to-end:
    FROM +bootstrap
    RUN rm -rf \
        noir-projects \
        l1-contracts \
        barretenberg/ts/src \
        barretenberg/ts/dest/node-cjs \
        barretenberg/ts/dest/browser
    RUN yarn workspaces focus @aztec/end-to-end @aztec/cli-wallet --production && yarn cache clean
    COPY --dir +rollup-verifier-contract/usr/src/bb /usr/src
    COPY --dir +build-dev/usr/src/noir-projects/noir-contracts /usr/src/noir-projects/noir-contracts
    COPY --dir ../spartan/+charts/usr/src/spartan /usr/src/spartan

    SAVE ARTIFACT /usr/src /usr/src
    SAVE ARTIFACT /opt/foundry/bin/anvil

end-to-end:
    FROM ubuntu:noble
    # add repository for chromium
    RUN apt-get update && apt-get install -y software-properties-common \
        && add-apt-repository ppa:xtradeb/apps -y && apt-get update \
        && apt-get install -y wget gnupg \
        && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
        && echo "deb [arch=$(dpkg --print-architecture)] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list \
        && apt update && apt install curl chromium nodejs netcat-openbsd -y \
        && rm -rf /var/lib/apt/lists/* \
        && mkdir -p /usr/local/bin \
        && curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
        && chmod +x /usr/local/bin/kubectl \
        && curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 \
        && chmod +x get_helm.sh \
        && ./get_helm.sh \
        && rm get_helm.sh

    ENV CHROME_BIN="/usr/bin/chromium"
    ENV PATH=/opt/foundry/bin:/usr/local/bin:$PATH
    ENV HARDWARE_CONCURRENCY=""
    ENV FAKE_PROOFS=""
    ENV BB_WORKING_DIRECTORY=/usr/src/bb
    ENV BB_BINARY_PATH=/usr/src/barretenberg/cpp/build/bin/bb
    ENV ACVM_WORKING_DIRECTORY=/usr/src/acvm
    ENV ACVM_BINARY_PATH=/usr/src/noir/noir-repo/target/release/acvm
    ENV PROVER_AGENT_CONCURRENCY=8
    RUN mkdir -p $BB_WORKING_DIRECTORY $ACVM_WORKING_DIRECTORY /usr/src/yarn-project/world-state/build
    RUN ln -s /usr/src/yarn-project/.yarn/releases/yarn-3.6.3.cjs /usr/local/bin/yarn

    COPY +bootstrap-end-to-end/anvil /opt/foundry/bin/anvil
    COPY +bootstrap-end-to-end/usr/src /usr/src
    WORKDIR /usr/src/yarn-project/end-to-end
    ENTRYPOINT ["yarn", "test"]
    ARG EARTHLY_GIT_HASH
    SAVE IMAGE aztecprotocol/aztec:$EARTHLY_GIT_HASH

save-images:
    BUILD +aztec
    BUILD +end-to-end

bootstrap-aztec-fauct:
    FROM +bootstrap
    RUN yarn workspaces focus @aztec/aztec-faucet --production && yarn cache clean
    RUN rm -rf \
        noir-projects \
        l1-contracts \
        barretenberg/ts/src \
        barretenberg/ts/dest/node-cjs \
        barretenberg/ts/dest/browser \
        yarn-project/aztec.js/dest/main.js \
        yarn-project/end-to-end \
        yarn-project/**/src
    SAVE ARTIFACT /usr/src /usr/src

aztec-faucet:
    FROM ubuntu:noble
    RUN apt update && apt install nodejs curl -y && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
    COPY +bootstrap-aztec-faucet/usr/src /usr/src
    ENTRYPOINT ["node", "--no-warnings", "/usr/src/yarn-project/aztec-faucet/dest/bin/index.js"]
    LET port=8080
    ARG DIST_TAG="latest"
    ARG ARCH
    SAVE IMAGE --push aztecprotocol/aztec-faucet:${DIST_TAG}${ARCH:+-$ARCH}
