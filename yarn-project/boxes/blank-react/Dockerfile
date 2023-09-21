FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-base AS builder

COPY . .

WORKDIR /usr/src/yarn-project/boxes/blank-react
RUN yarn build && yarn formatting

RUN yarn cache clean
RUN yarn workspaces focus --production > /dev/null

FROM node:18-alpine
COPY --from=builder /usr/src/yarn-project/boxes/blank-react /usr/src/yarn-project/boxes/blank-react
WORKDIR /usr/src/yarn-project/boxes/blank-react
ENTRYPOINT ["yarn"] 