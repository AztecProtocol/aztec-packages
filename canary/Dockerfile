FROM node:18-alpine AS builder

# Build canary
WORKDIR /usr/src/canary
COPY . .
RUN yarn && yarn build

# Create final, minimal size image.
FROM node:18-alpine
RUN apk update && apk add --no-cache curl jq bash
COPY --from=builder /usr/src /usr/src
WORKDIR /usr/src/canary
ENTRYPOINT ["yarn", "test"]