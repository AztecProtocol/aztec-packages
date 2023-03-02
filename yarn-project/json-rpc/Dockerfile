FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-base AS builder
COPY json-rpc json-rpc
WORKDIR /usr/src/yarn-project/json-rpc
RUN yarn build && yarn formatting && yarn test

FROM alpine:latest
COPY --from=builder /usr/src/yarn-project/json-rpc /usr/src/yarn-project/json-rpc