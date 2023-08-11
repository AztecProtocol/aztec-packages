FROM node:18-alpine AS builder
RUN apk update && apk add --no-cache jq bash

ARG COMMIT_TAG="0.1.0-alpha36" 

#Build canary
WORKDIR /usr/src/
COPY ./canary .
RUN ./scripts/update_packages.sh $COMMIT_TAG
RUN yarn && yarn build

ENTRYPOINT ["yarn", "test"]