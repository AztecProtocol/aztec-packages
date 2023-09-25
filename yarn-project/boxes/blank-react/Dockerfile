FROM 278380418400.dkr.ecr.us-east-2.amazonaws.com/yarn-project AS builder

FROM node:18-alpine
COPY --from=builder . .
# COPY /usr/src/yarn-project/circuits.js/dest /usr/src/yarn-project/circuits.js/dest

WORKDIR /usr/src/yarn-project/boxes/blank-react
RUN yarn 
RUN yarn build && yarn formatting

RUN yarn cache clean

WORKDIR /usr/src/yarn-project/boxes/blank-react
ENTRYPOINT ["yarn", "test:ci"] 