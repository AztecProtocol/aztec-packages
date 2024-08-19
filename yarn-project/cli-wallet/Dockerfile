FROM aztecprotocol/yarn-project AS yarn-project

COPY ./wallet-entrypoint.sh /usr/src/yarn-project/cli-wallet/wallet-entrypoint.sh
ENTRYPOINT ["/usr/src/yarn-project/cli-wallet/wallet-entrypoint.sh"]

# The version has been updated in yarn-project.
# Adding COMMIT_TAG here to rebuild versioned image.
ARG COMMIT_TAG=""
