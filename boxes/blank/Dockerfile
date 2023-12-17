FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-prod AS yarn-project-prod

FROM node:18.19.0
COPY --from=yarn-project-prod /usr/src /usr/src
WORKDIR /usr/src/boxes/blank
COPY . .
RUN yarn && yarn build
ENTRYPOINT ["yarn"]
CMD ["start"]