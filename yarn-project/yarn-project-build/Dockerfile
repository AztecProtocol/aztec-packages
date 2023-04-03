FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-base AS builder

# TODO better way of ensuring no packages fail to build
WORKDIR /usr/src/yarn-project
RUN yarn build