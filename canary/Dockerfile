FROM node:18-alpine AS builder
RUN apk update && apk add --no-cache jq

ARG COMMIT_TAG=""

#Build canary
WORKDIR /usr/src/canary
COPY . .
RUN ./scripts/update_packages.sh $COMMIT_TAG
RUN yarn && yarn info --name-only && yarn build

ENTRYPOINT ["yarn", "test"]