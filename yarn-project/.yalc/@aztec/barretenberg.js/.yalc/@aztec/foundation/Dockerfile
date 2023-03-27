FROM node:18-alpine
RUN apk update && apk add --no-cache git curl bash jq
WORKDIR /usr/src
COPY . .
RUN yarn --immutable && yarn build && yarn formatting && yarn test

FROM alpine:latest
COPY --from=0 usr/src /usr/src