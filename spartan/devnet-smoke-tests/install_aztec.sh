# Install aztec and set version
bash -i <(curl -s https://install.aztec.network)

# Add the bin directory to the current PATH
export PATH="$HOME/.aztec/bin:$PATH"

aztec-up -v $AZTEC_VERSION
