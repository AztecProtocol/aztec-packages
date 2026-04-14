FROM python:3.12

# Install aws cli.
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o "awscliv2.zip" && \
    unzip awscliv2.zip && \
    ./aws/install --bin-dir /usr/local/bin --install-dir /usr/local/aws-cli --update && \
    rm -rf aws awscliv2.zip

# Install redis cli.
RUN apt update && apt install -y \
      jq \
      netcat-openbsd \
      redis-tools \
      && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /app
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Install ci-metrics dependencies (ci-metrics runs as subprocess)
COPY ci-metrics/requirements.txt ci-metrics/requirements.txt
RUN pip install --no-cache-dir -r ci-metrics/requirements.txt

RUN git config --global --add safe.directory /aztec-packages
COPY . .
EXPOSE 8080 8081
CMD ["gunicorn", "-w", "4", "--threads", "12", "-b", "0.0.0.0:8080", "rk:app"]
