# cspell: disable

########################################################################################################################
# Base build. Used as base in subsequent builds of foundry, wasi-sdk, osxcross, etc.
FROM ubuntu:noble AS base-build
RUN export DEBIAN_FRONTEND="noninteractive" \
    && apt update && apt install --no-install-recommends -y \
      build-essential \
      ca-certificates \
      bash \
      clang \
      cmake \
      make \
      ninja-build \
      git \
      curl \
      gnupg \
      python3 \
      wget \
    && apt-get -y autoremove \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*


########################################################################################################################
# Build wasi-sdk.
FROM base-build AS wasi-sdk
RUN apt update && apt install cargo -y
RUN git clone --depth 1 --recursive --branch wasi-sdk-22 https://github.com/WebAssembly/wasi-sdk.git \
    && mkdir -p /wasi-sdk/build/install/opt/wasi-sdk \
    && cd /wasi-sdk \
    && export MAKEFLAGS="-j$(nproc)" \
    && make build/llvm.BUILT \
    && make build/wasi-libc.BUILT \
    && make build/compiler-rt.BUILT \
    && make build/libcxx.BUILT \
    && make build/config.BUILT \
    && make build/version.BUILT \
    && mv build/install/opt/wasi-sdk /opt/wasi-sdk \
    && cd / && rm -rf /wasi-sdk


########################################################################################################################
# Build osxcross.
FROM base-build AS osxcross
RUN apt update && apt-get install --no-install-recommends -y \
        binutils-multiarch-dev \
        libbz2-dev \
        libmpc-dev \
        libmpfr-dev \
        libgmp-dev \
        liblzma-dev \
        libpsi3-dev \
        libssl-dev \
        libxml2-dev \
        libz-dev \
        lzma-dev \
        patch \
        uuid-dev \
        xz-utils \
        zlib1g-dev \
    && apt-get -y autoremove \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
RUN git clone https://github.com/tpoechtrager/osxcross.git \
    && cd /osxcross \
    && git reset --hard ff8d100f3f026b4ffbe4ce96d8aac4ce06f1278b \
    && export OSX_SDK="MacOSX14.0.sdk" \
    && export OSX_SDK_URL="https://github.com/joseluisq/macosx-sdks/releases/download/14.0/${OSX_SDK}.tar.xz" \
    && curl -sSL "$OSX_SDK_URL" -o "./tarballs/$OSX_SDK.tar.xz" \
    && OSX_VERSION_MIN=14.0 UNATTENDED=1 ENABLE_COMPILER_RT_INSTALL=1 TARGET_DIR=/opt/osxcross ./build.sh \
    && rm -rf /osxcross /opt/osxcross/SDK/$OSX_SDK


########################################################################################################################
# Build foundry.
FROM base-build AS foundry
ENV FOUNDRY_VERSION=nightly-99634144b6c9371982dcfc551a7975c5dbf9fad8
ENV FOUNDRY_BIN_DIR="/root/.foundry/bin"
ENV RUSTUP_HOME=/opt/rust/rustup
ENV CARGO_HOME=/opt/rust/cargo
ENV PATH="/opt/rust/cargo/bin:$PATH"
ENV RUSTFLAGS="-C target-cpu=generic"
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
RUN curl -L https://foundry.paradigm.xyz | bash \
    && $FOUNDRY_BIN_DIR/foundryup -i $FOUNDRY_VERSION \
    && mkdir -p /opt/foundry/bin \
    && for t in forge cast anvil chisel; do \
        mv $FOUNDRY_BIN_DIR/$t /opt/foundry/bin/$t; \
        strip /opt/foundry/bin/$t; \
    done \
    && rm -rf $FOUNDRY_BIN_DIR


########################################################################################################################
# Build the build image.
# This image contains *just* what's needed to perform a full build of the aztec project and to run individual tests.
# This is not sufficient for development, as it lacks many useful developer tools.
# This is not sufficient for testing everything as per in CI, as that requires docker-in-docker.
# You should use the devbox image for development and CI runs.
# We favour using the devbox in CI as we can drop into a familiar environment on error.
# It also means we're effectively testing the devbox in CI.
# We use this image for test isolation.
FROM base-build AS build

# APT repo for node (22.15.0)
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
ENV NODE_MAJOR=22
RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list

RUN apt update && \
    apt install -y \
        # Utils
        curl \
        git \
        wget \
        time \
        jq \
        gawk \
        unzip \
        netcat-openbsd \
        parallel \
        xz-utils \
        lsof \
        xxd \
        zstd \
        # C++ (clang=18, which we will move to. 16 is for current build.)
        build-essential \
        cmake \
        ninja-build \
        clang \
        clang-16 \
        clang-format-16 \
        libc++-dev \
        libomp-dev \
        doxygen \
        nodejs \
        # Python (clang bindings for wasm bindgen.)
        python3 \
        python3-clang \
        # Unminimize ubuntu installation.
        unminimize \
    && apt-get -y autoremove \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install wasi-sdk.
COPY --from=wasi-sdk /opt/wasi-sdk /opt/wasi-sdk

# Install foundry.
COPY --from=foundry /opt/foundry /opt/foundry
ENV PATH="/opt/foundry/bin:$PATH"

# Install rust and cross-compilers. Noir specifically uses 1.85.0.
# We give everyone write ownership so downstream boxes can write.
ENV RUSTUP_HOME=/opt/rust/rustup
ENV CARGO_HOME=/opt/rust/cargo
ENV PATH="/opt/rust/cargo/bin:$PATH"
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.85.0 && \
    rustup target add wasm32-unknown-unknown wasm32-wasip1 aarch64-apple-darwin && \
    chmod -R a+w /opt/rust

# Install corepack and yarn.
RUN npm install --global corepack && corepack enable && corepack install --global yarn@4.5.2

# Install solhint.
RUN npm install --global solhint

# Install aws cli.
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o "awscliv2.zip" && \
    unzip awscliv2.zip && \
    ./aws/install --bin-dir /usr/local/bin --install-dir /usr/local/aws-cli --update && \
    rm -rf aws awscliv2.zip

# Install gcloud cli.
RUN apt-get update && apt-get install apt-transport-https gnupg -y \
    && curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list \
    && apt-get update && apt-get -y install google-cloud-cli google-cloud-cli-gke-gcloud-auth-plugin

# Install terraform.
RUN curl -fsSL https://releases.hashicorp.com/terraform/1.7.5/terraform_1.7.5_linux_$(dpkg --print-architecture).zip -o terraform.zip \
    && unzip terraform.zip -d /usr/local/bin \
    && chmod +x /usr/local/bin/terraform \
    && rm terraform.zip

# Install wasmtime.
RUN curl -fsSL https://github.com/bytecodealliance/wasmtime/releases/download/v20.0.2/wasmtime-v20.0.2-$(uname -m)-linux.tar.xz | tar xJ \
    && mv wasmtime-v20.0.2-$(uname -m)-linux/wasmtime /usr/local/bin \
    && rm -rf wasmtime*

# Install yq
RUN curl -sL https://github.com/mikefarah/yq/releases/download/v4.42.1/yq_linux_$(dpkg --print-architecture) \
        -o /usr/local/bin/yq && chmod +x /usr/local/bin/yq

# Install playwright for browser testing. Ensure accessible for other users.
RUN npx -y playwright@1.49 install --with-deps && mv /root/.cache/ms-playwright /opt/ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright


########################################################################################################################
# We want to produce downstream images: devbox and sysbox. This image is the base image for each.
# It contains a suite of tools that developers might use to develop aztec.
FROM build AS basebox
RUN yes | unminimize

# Install stuff devs need.
RUN apt update && \
    apt install -y \
        cgroup-tools \
        clangd-16 \
        fzf \
        gnupg \
        htop \
        iproute2 \
        iputils-ping \
        lcov \
        less \
        libfuse2 \
        lldb \
        lsb-release \
        man \
        neovim \
        psmisc \
        python3-blessed \
        redis-tools \
        rsync \
        software-properties-common \
        ssh \
        strace \
        sudo \
        telnet \
        tmux \
        vim \
        zsh \
        inotify-tools \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install osxcross. Requires developer to mount SDK from their mac host.
COPY --from=osxcross /opt/osxcross /opt/osxcross
ENV PATH="/opt/osxcross/bin:$PATH"
ENV LD_LIBRARY_PATH="/opt/osxcross/lib:$LD_LIBRARY_PATH"

# Install gh (github cli).
RUN mkdir -p -m 755 /etc/apt/keyrings && wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg > /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt update \
    && apt install gh -y

# Install gt (graphite).
RUN npm install -g @withgraphite/graphite-cli@stable

# fzf seems to not install this file for some reason.
COPY ./key-bindings.zsh /usr/share/doc/fzf/examples/key-bindings.zsh

# Sets LANG explicitly. Ensures tmux shows unicode symbols.
ENV LANG=C.UTF-8
# Ensure we get color terminal.
ENV TERM=xterm-256color

# Cargo home and bin path should be set within users home dir at login.
RUN echo 'export CARGO_HOME="$HOME/.cargo"' >> /etc/zsh/zshenv
RUN echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> /etc/zsh/zshenv

# sudo group can sudo without password.
RUN echo '%sudo ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers


########################################################################################################################
# This devbox container can be used to provide a full development environment.
#
# It can be used as a dev container:
# - Configuration in .devcontainer/devcontainer.json.
# - To run locally install "Dev Containers" plugin in vscode.
# - To run in GitHub codespaces, visit the repo in github, press '.', and open the terminal.
#
# It can be used independently:
# - The user should use the ./run.sh script to launch.
# - A persistent volume will be mounted to /home/aztec-dev.
# - It provides docker via the hosts docker instance, mounted at /var/lib/docker.sock.
# - It uses an entrypoint script at runtime to perform uid/gid alignment with the host and drop into user account.
FROM basebox AS devbox

# Install gosu so we can start as root, adjust uid/gid, and then use gosu to become aztec-dev.
RUN apt install -y gosu

# Detect if the host machine is Mac, if so set an env var, and disable prompts vcs info for performance.
RUN echo ' \
  if mount | grep -q /host_mark/Users; then \
      export HOST_OSTYPE=darwin; \
      export PROMPT_LEAN_VCS=0; \
  fi \
  ' >> /etc/zsh/zshrc

# Create the user we'll run as (remove ubuntu first).
RUN userdel -r ubuntu && useradd --shell /bin/zsh -G sudo -m aztec-dev
WORKDIR /home/aztec-dev

# Add dotfiles.
COPY --chown=aztec-dev:aztec-dev home .

# The .npmrc config is set to install global bins here, update PATH.
ENV PATH=/home/aztec-dev/.npm-global/bin:$PATH

# Need to ensure correct permissions, under some conditions these would otherwise be created by root.
RUN mkdir .vscode-server .npm-global .ssh && chown aztec-dev:aztec-dev .*

# Install docker using docker-in-docker dev-container feature install script.
COPY docker_daemon.json /etc/docker/daemon.json
RUN curl -fsSL https://raw.githubusercontent.com/devcontainers/features/refs/heads/main/src/docker-in-docker/install.sh | bash

# Use as entrypoint when running in an environment that requires uid/gid alignment (e.g. vanilla linux docker).
COPY ./entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
CMD ["/bin/zsh"]


########################################################################################################################
# This sysbox container can be used to provide a full development environment.
# It's more advanced than devbox in that it uses nestybox's sysbox container runtime to provide more of a vm experience.
# It's used primarily by internal aztec developers who have sysboxes running on a powerful underlying mainframe.
# It provides better isolation and security guarantees than a plain devbox.
FROM basebox AS sysbox

###################### START OF STOCK NESTYBOX SYSTEMD CONTAINER ###############################
#
# Systemd installation
#
RUN apt-get update &&                            \
    apt-get install -y --no-install-recommends   \
            systemd                              \
            systemd-sysv                         \
            libsystemd0                          \
            ca-certificates                      \
            dbus                                 \
            iptables                             \
            iproute2                             \
            kmod                                 \
            locales                              \
            sudo                                 \
            udev &&                              \
                                                \
    # Prevents journald from reading kernel messages from /dev/kmsg
    echo "ReadKMsg=no" >> /etc/systemd/journald.conf &&               \
                                                                      \
    # Housekeeping
    apt-get clean -y &&                                               \
    rm -rf                                                            \
      /var/cache/debconf/*                                           \
      /var/lib/apt/lists/*                                           \
      /var/log/*                                                     \
      /tmp/*                                                         \
      /var/tmp/*                                                     \
      /usr/share/local/* &&                                          \
                                                                      \
    # Create default 'ubuntu/ubuntu' user
    echo "ubuntu:ubuntu" | chpasswd && adduser ubuntu sudo

# Disable systemd services/units that are unnecessary within a container.
RUN systemctl mask systemd-udevd.service \
                  systemd-udevd-kernel.socket \
                  systemd-udevd-control.socket \
                  systemd-modules-load.service \
                  sys-kernel-config.mount \
                  sys-kernel-debug.mount \
                  sys-kernel-tracing.mount \
                  e2scrub_reap.service

# Make use of stopsignal (instead of sigterm) to stop systemd containers.
STOPSIGNAL SIGRTMIN+3

# Set systemd as entrypoint.
ENTRYPOINT [ "/sbin/init", "--log-level=err" ]

###################### END OF STOCK NESTYBOX SYSTEMD CONTAINER ###############################

# Install docker.
COPY docker_daemon.json /etc/docker/daemon.json
RUN curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh \
    # Add user "ubuntu" to the Docker group
    && usermod -a -G docker ubuntu
RUN curl -fsSL https://raw.githubusercontent.com/docker/docker-ce/master/components/cli/contrib/completion/bash/docker -o /etc/bash_completion.d/docker.sh
# Temp hack to downgrade containerd.io: https://github.com/opencontainers/runc/issues/4542
RUN apt install containerd.io=1.6.33-1 --allow-downgrades -y

# Install sshd.
RUN apt install --no-install-recommends -y openssh-server \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir /home/ubuntu/.ssh \
    && chown ubuntu:ubuntu /home/ubuntu/.ssh \
    && echo 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDagCvr/+CA1jmFaJf+e9+Kw6iwfhvaKOpfbGEl5zLgB+rum5L4Kga6Jow1gLQeMnAHfqc2IgpsU4t04c8PYApAt8AWNDL+KxMiFytfjKfJ2DZJA73CYkFnkfnMtU+ki+JG9dAHd6m7ShtCSzE5n6EDO2yWCVWQfqE3dcnpwrymSWkJYrbxzeOixiNZ4f1nD9ddvFvTWGB4l+et5SWgeIaYgJYDqTI2teRt9ytJiDGrCWXs9olHsCZOL6TEJPUQmNekwBkjMAZ4TmbBMjwbUlIxOpW2UxzlONcNn7IlRcGQg0Gdbkpo/zOlCNXsvacvnphDk5vKKaQj+aQiG916LU5P charlie@aztecprotocol.com' >> /home/ubuntu/.ssh/authorized_keys \
    && echo 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDb5OVc+9S9nXx3/34F7eLVXjoPgQ3YHSdlfhTb8WflAGmpKJTLxtAYngtDBvhKofH5HrjPPkBWxOHP9KOTo0jxUQSr0suMpggLLOHuIrCszJKXIVi7whnQ4p2RHyzyS2ANwmpxWZmYxfgamzYst9JIvQYJgAPjTFweKBsG/Lc03knJ/qgz9BHqDSZHweMTnhv1dJNhZRKy1Lxyl/CjXKF374i8qbzVWJMeDgLEH6C84vCeaH89KMmM9J0+T31uEqxzIhZxNmRz9v+x6cQAVJtGi9OIveGT9qUQwKXZsk6/zorzxV+NiIvTWHxIn9epX/FUjgUmb/jFvpbEjDkbIngj adomurad@localhost.localdomain' >> /home/ubuntu/.ssh/authorized_keys \
    && echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFKlUeOh9DyAL85NJ10LE+nyfi8oYm+CwxQ9JMaB6H+t root@mainframe' >> /home/ubuntu/.ssh/authorized_keys \
    && chown ubuntu:ubuntu /home/ubuntu/.ssh/authorized_keys

# Install google authenticator for setting up 2fa.
RUN apt update && apt install -y libpam-google-authenticator

# We login to sysbox via ssh. This loses env vars set with ENV, so add them here.
# Sets RUSTUP_HOME.
# Adds foundry and cargo bin dirs to PATH.
COPY environment /etc/environment

EXPOSE 22
