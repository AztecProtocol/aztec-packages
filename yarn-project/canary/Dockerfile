FROM node:18-alpine
RUN apk update && apk add --no-cache jq bash

ARG COMMIT_TAG="0.1.0-alpha36" 

#Build canary
WORKDIR /usr/src/
COPY ./canary .
RUN ./scripts/update_packages.sh "0.1.0-alpha36"
RUN yarn && yarn build

ENTRYPOINT ["yarn", "test"]