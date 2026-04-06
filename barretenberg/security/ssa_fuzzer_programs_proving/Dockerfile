FROM ubuntu:24.04
ARG BB_VERSION

# curl python pip node
RUN apt-get update && \
    apt-get install -y curl jq nodejs npm python3 python3-pip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.bb:/root/.foundry/bin:${PATH}"

# install bb
RUN curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/refs/heads/next/barretenberg/bbup/install | bash
RUN /root/.bb/bbup -v ${BB_VERSION};

# install anvil
RUN curl -L https://foundry.paradigm.xyz | bash
RUN /root/.foundry/bin/foundryup

WORKDIR /app/proving
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages
COPY . .

WORKDIR /app/proving/src
ENV PYTHONUNBUFFERED=1
CMD ["python3", "main.py"]
