FROM python:3.12

RUN apt update && apt install -y jq redis-tools && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt gunicorn
RUN git config --global --add safe.directory /aztec-node
COPY . .
EXPOSE 8081
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8081", "app:app"]
