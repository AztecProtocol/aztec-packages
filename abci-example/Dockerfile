FROM node:18
RUN apt update && apt install lsof sudo -y
RUN echo 'ALL ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers
WORKDIR /usr/src
COPY package.json .yarnrc.yml .
COPY .yarn .yarn
RUN yarn
# 🤷‍♂️
ENV PATH=${PATH}:/usr/src/node_modules/.bin
COPY . .
RUN yarn generate
ENTRYPOINT ["/usr/src/entrypoint.sh"]
RUN useradd -m -u 1001 user && echo 'user:user' | chpasswd && adduser user sudo