FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/aztec-nr as aztec-nr
FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project

# Copy in aztec-nr.
COPY --from=aztec-nr /usr/src/aztec-nr /usr/src/aztec-nr

WORKDIR /usr/src

COPY . .
WORKDIR /usr/src/docs
RUN yarn && yarn build