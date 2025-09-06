FROM ubuntu:24.04 AS builder

# install curl jq git rustup parallel gcc gpg
RUN apt-get update && \
    apt-get install -y curl jq git rustup parallel gcc gpg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build

# bootstrap asks for git identity
RUN git config --global user.email "you@example.com"
RUN git config --global user.name "Your Name"

# cargo binstall
RUN rustup default stable
RUN cargo install cargo-binstall
ENV PATH="/root/.cargo/bin:$PATH"

# install yarn
RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
RUN echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list
RUN apt-get update && apt-get install -y yarn

# clone aztec-packages
RUN git clone https://github.com/AztecProtocol/aztec-packages.git --depth 1

# bootstrap noir
# TODO(sn): fix when predicates and final version of ssa fuzzer are merged
RUN cd /build/aztec-packages/noir && \
    echo "b1b62e65f0140ea398db060c539178f796305885" > noir-repo-ref && \
    sed -i -e '83s/.*/    "cargo build --locked --release --target-dir target"/' -e '84d' bootstrap.sh && \
    ./bootstrap.sh

# bootstrap transpiler
# TODO(sn): fix when predicates and final version of ssa fuzzer are merged
COPY avm.diff /build/aztec-packages
RUN cd /build/aztec-packages && git apply avm.diff
RUN cd /build/aztec-packages/avm-transpiler &&\
    cargo build --release


FROM ubuntu:24.04
WORKDIR /app

RUN apt-get update && \
    apt-get install -y python3 python3-pip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# copy transpiler
COPY --from=builder /build/aztec-packages/avm-transpiler/target/release/avm-transpiler /app/transpiler

COPY requirements.txt /app/requirements.txt
RUN pip install -r requirements.txt --break-system-packages
COPY main.py /app/main.py

CMD ["python3", "main.py"]
