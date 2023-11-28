FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project
WORKDIR /usr/src
COPY . .
COPY ../boxes /usr/src/boxes
WORKDIR /usr/src/docs
RUN yarn && yarn build