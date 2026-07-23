FROM ubuntu:24.04
ARG BB_VERSION

# curl python pip
RUN apt-get update && \
    apt-get install -y curl python3 python3-pip jq && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# install bb
RUN curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/refs/heads/next/barretenberg/bbup/install | bash
RUN /root/.bb/bbup -v ${BB_VERSION};

WORKDIR /app/proving
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages
COPY . .

# Optional: acir_components_check binary (copy via prepare_binaries.sh before build)
RUN chmod +x /app/proving/acir_components_check 2>/dev/null || true

WORKDIR /app/proving/src
ENV PYTHONUNBUFFERED=1
CMD ["python3", "main.py"] 
