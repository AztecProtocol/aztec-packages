FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project AS builder

ARG COMMIT_TAG=""

# Update aztec-rpc version if COMMIT_TAG has been used
WORKDIR /usr/src/yarn-project/aztec-rpc
RUN if [[ -n "${COMMIT_TAG}" ]]; then \
  jq --arg v ${COMMIT_TAG} '.version = $v' package.json > _temp && mv _temp package.json; \
  fi

WORKDIR /usr/src/yarn-project/aztec-sandbox
RUN ls
RUN if [[ -n "${COMMIT_TAG}" ]]; then \
  jq --arg v ${COMMIT_TAG} '.version = $v' package.json > _temp && mv _temp package.json; \
  fi

# Productionify. See comment in yarn-project-base/Dockerfile.
RUN yarn cache clean && \
    mv ../.yarnrc.prod.yml ../.yarnrc.yml && \
    yarn workspaces focus --production > /dev/null && \
    rm -rf /usr/src/.yarn

# Create final, minimal size image.
FROM node:18-alpine
COPY --from=builder /usr/src/ /usr/src/
WORKDIR /usr/src/yarn-project/aztec-sandbox
ENTRYPOINT ["yarn"]
CMD [ "start" ]
EXPOSE 8080
