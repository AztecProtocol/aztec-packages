FROM node:18-alpine
RUN apk update && apk add --no-cache jq bash udev ttf-freefont chromium

ARG COMMIT_TAG="0.1.0-alpha59"

#Build canary
WORKDIR /usr/src/
COPY ./canary .
RUN ./scripts/update_packages.sh $COMMIT_TAG
RUN yarn && yarn build

ENTRYPOINT ["yarn", "test"]