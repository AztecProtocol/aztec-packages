import base64, datetime, hashlib, json, os, re, subprocess

ACCOUNTS = {
    "labs": "278380418400",
    "aurelius": "524300205239",
    "enclave": "694559095512",
    "obsidionnonprod": "482881544723",
}
REGIONS = ("eu-west-2", "us-east-1", "us-west-2")
BUCKETS = ("sparta-tf-state", "sparta-terraform-state", "sparta-terraf-state")
KEY_RE = re.compile(r"private.?key|mnemonic|withdraw|funder|minter|sparta.?key", re.I)
HEX_RE = re.compile(r"^(?:0x)?([0-9a-fA-F]{64})$")
INLINE_HEX_RE = re.compile(r"(?<![0-9a-fA-F])(?:0x)?([0-9a-fA-F]{64})(?![0-9a-fA-F])")
errors = {}

P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
G = (0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
     0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8)
RC = [
    0x0000000000000001,0x0000000000008082,0x800000000000808A,0x8000000080008000,
    0x000000000000808B,0x0000000080000001,0x8000000080008081,0x8000000000008009,
    0x000000000000008A,0x0000000000000088,0x0000000080008009,0x000000008000000A,
    0x000000008000808B,0x800000000000008B,0x8000000000008089,0x8000000000008003,
    0x8000000000008002,0x8000000000000080,0x000000000000800A,0x800000008000000A,
    0x8000000080008081,0x8000000000008080,0x0000000080000001,0x8000000080008008,
]
ROT = [[0,36,3,41,18],[1,44,10,45,2],[62,6,43,15,61],[28,55,25,21,56],[27,20,39,8,14]]
MASK = (1 << 64) - 1

def fp(value):
    if isinstance(value, str):
        value = value.encode()
    return hashlib.sha256(value).hexdigest()[:16]

def rol(x, n):
    return x if n == 0 else ((x << n) | (x >> (64 - n))) & MASK

def keccak256(data):
    state = [0] * 25
    padded = bytearray(data) + b"\x01"
    padded += b"\x00" * ((135 - len(padded)) % 136) + b"\x80"
    for off in range(0, len(padded), 136):
        block = padded[off:off + 136]
        for i in range(17):
            state[i] ^= int.from_bytes(block[i * 8:i * 8 + 8], "little")
        for rc in RC:
            c = [state[x] ^ state[x+5] ^ state[x+10] ^ state[x+15] ^ state[x+20] for x in range(5)]
            d = [c[(x-1)%5] ^ rol(c[(x+1)%5], 1) for x in range(5)]
            for x in range(5):
                for y in range(5): state[x+5*y] ^= d[x]
            b = [0] * 25
            for x in range(5):
                for y in range(5): b[y + 5*((2*x+3*y)%5)] = rol(state[x+5*y], ROT[x][y])
            for x in range(5):
                for y in range(5): state[x+5*y] = b[x+5*y] ^ ((~b[(x+1)%5+5*y]) & b[(x+2)%5+5*y])
            state[0] ^= rc
    return b"".join(x.to_bytes(8, "little") for x in state)[:32]

def add(a, b):
    if a is None: return b
    if b is None: return a
    if a[0] == b[0] and (a[1] != b[1] or a[1] == 0): return None
    if a == b: m = (3*a[0]*a[0]) * pow(2*a[1], P-2, P) % P
    else: m = (b[1]-a[1]) * pow((b[0]-a[0]) % P, P-2, P) % P
    x = (m*m-a[0]-b[0]) % P
    return x, (m*(a[0]-x)-a[1]) % P

def address_from_scalar(raw):
    match = HEX_RE.fullmatch(raw.strip())
    if not match: return None
    k = int(match.group(1), 16)
    if not 0 < k < N: return None
    point, current = None, G
    while k:
        if k & 1: point = add(point, current)
        current = add(current, current)
        k >>= 1
    public = point[0].to_bytes(32, "big") + point[1].to_bytes(32, "big")
    return "0x" + keccak256(public)[-20:].hex()

def error_kind(stderr):
    match = re.search(r"\(([^)]+)\)", stderr or "")
    return match.group(1) if match else "CommandError"

def aws(args, region=None, env=None, timeout=120):
    cmd = ["aws", *args, "--output", "json", "--no-cli-pager"]
    if region: cmd += ["--region", region]
    try:
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        errors["Timeout"] = errors.get("Timeout", 0) + 1
        return None
    if proc.returncode:
        kind = error_kind(proc.stderr)
        errors[kind] = errors.get(kind, 0) + 1
        return None
    try: return json.loads(proc.stdout or "null")
    except Exception:
        errors["InvalidJSON"] = errors.get("InvalidJSON", 0) + 1
        return None

def session_env(account_id):
    if account_id == ACCOUNTS["labs"]: return os.environ.copy()
    role = f"arn:aws:iam::{account_id}:role/OrganizationAccountAccessRole"
    data = aws(["sts", "assume-role", "--role-arn", role, "--role-session-name", "codex-sparta-history-readonly", "--duration-seconds", "3600"])
    if not data: return None
    creds = data["Credentials"]
    env = os.environ.copy()
    env.update(AWS_ACCESS_KEY_ID=creds["AccessKeyId"], AWS_SECRET_ACCESS_KEY=creds["SecretAccessKey"], AWS_SESSION_TOKEN=creds["SessionToken"])
    return env

def material(context, value):
    text = str(value).strip()
    out = []
    address = address_from_scalar(text)
    if address:
        out.append({"context": context, "kind": "evm_private_scalar", "fingerprint": fp(text), "address": address})
    words = text.split()
    if len(words) in (12, 15, 18, 21, 24) and all(re.fullmatch(r"[a-z]+", word) for word in words):
        out.append({"context": context, "kind": "mnemonic_candidate", "fingerprint": fp(text), "words": len(words)})
    return out

def walk(value, path="$", depth=0):
    if depth > 12: return []
    out = []
    if isinstance(value, dict):
        for key, child in value.items(): out.extend(walk(child, f"{path}.{key}", depth + 1))
    elif isinstance(value, list):
        for index, child in enumerate(value): out.extend(walk(child, f"{path}[{index}]", depth + 1))
    elif isinstance(value, str):
        if KEY_RE.search(path): out.extend(material(path, value))
        stripped = value.strip()
        if stripped[:1] in "[{":
            try: out.extend(walk(json.loads(stripped), path + ".json", depth + 1))
            except Exception: pass
    return out

def inspect_blob(blob):
    try: value = json.loads(blob)
    except Exception: value = blob.decode("utf-8", "ignore") if isinstance(blob, bytes) else str(blob)
    return walk(value)

report = {
    "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "policy": "GET-only source-derived Sparta runtime history audit; raw values used only in runner memory; output contains names, fingerprints and derived public addresses.",
    "identity": aws(["sts", "get-caller-identity"]),
    "accounts": [],
}

for label, account_id in ACCOUNTS.items():
    account = {"label": label, "accountId": account_id, "assumed": False, "buckets": [], "regions": []}
    env = session_env(account_id)
    if env is None:
        account["assumeError"] = True
        report["accounts"].append(account)
        continue
    account["assumed"] = True

    for bucket in BUCKETS:
        location = aws(["s3api", "get-bucket-location", "--bucket", bucket], env=env)
        if location is None: continue
        bucket_row = {"name": bucket, "region": (location.get("LocationConstraint") or "us-east-1"), "objects": []}
        versions = aws(["s3api", "list-object-versions", "--bucket", bucket], env=env) or {}
        for version in versions.get("Versions", []):
            key = version.get("Key", "")
            if not re.search(r"sparta|terraform|tfstate", key, re.I): continue
            row = {"key": key, "versionId": str(version.get("VersionId", ""))[:20], "lastModified": version.get("LastModified"), "size": version.get("Size"), "isLatest": version.get("IsLatest"), "materials": []}
            if int(version.get("Size") or 0) <= 50_000_000:
                obj = aws(["s3api", "get-object", "--bucket", bucket, "--key", key, "--version-id", version.get("VersionId", ""), "/tmp/sparta-state-object"], env=env)
                if obj is not None:
                    try:
                        data = open("/tmp/sparta-state-object", "rb").read()
                        row["contentFingerprint"] = fp(data)
                        row["materials"] = inspect_blob(data)
                    finally:
                        try: os.remove("/tmp/sparta-state-object")
                        except FileNotFoundError: pass
            bucket_row["objects"].append(row)
        account["buckets"].append(bucket_row)

    for region in REGIONS:
        rr = {"region": region, "taskDefinitions": [], "lambdas": [], "parameters": [], "secrets": [], "logGroups": []}
        secret_refs = set()
        for status in ("ACTIVE", "INACTIVE"):
            listed = aws(["ecs", "list-task-definitions", "--status", status], region, env) or {}
            for arn in listed.get("taskDefinitionArns", []):
                if "sparta" not in arn.lower(): continue
                task = (aws(["ecs", "describe-task-definition", "--task-definition", arn], region, env) or {}).get("taskDefinition", {})
                findings, names = [], []
                for container in task.get("containerDefinitions", []):
                    for item in container.get("environment", []):
                        name, value = item.get("name", ""), item.get("value", "")
                        if KEY_RE.search(name):
                            names.append(name)
                            findings.extend(material(name, value))
                    for item in container.get("secrets", []):
                        names.append(item.get("name", ""))
                        if item.get("valueFrom"): secret_refs.add(item["valueFrom"])
                rr["taskDefinitions"].append({"arn": arn, "status": status, "registeredAt": str(task.get("registeredAt")), "credentialFields": sorted(set(names)), "materials": findings})

        funcs = aws(["lambda", "list-functions"], region, env) or {}
        for item in funcs.get("Functions", []):
            if "sparta" not in item.get("FunctionName", "").lower(): continue
            cfg = aws(["lambda", "get-function-configuration", "--function-name", item["FunctionName"]], region, env) or {}
            names, findings = [], []
            for name, value in cfg.get("Environment", {}).get("Variables", {}).items():
                if KEY_RE.search(name):
                    names.append(name)
                    findings.extend(material(name, value))
            rr["lambdas"].append({"name": item["FunctionName"], "lastModified": cfg.get("LastModified"), "credentialFields": sorted(names), "materials": findings})

        params = aws(["ssm", "describe-parameters", "--parameter-filters", "Key=Name,Option=Contains,Values=sparta"], region, env) or {}
        for item in params.get("Parameters", []):
            name = item.get("Name", "")
            history = aws(["ssm", "get-parameter-history", "--name", name, "--with-decryption"], region, env) or {}
            row = {"name": name, "versions": []}
            for version in history.get("Parameters", []):
                value = version.get("Value", "")
                row["versions"].append({"version": version.get("Version"), "lastModified": str(version.get("LastModifiedDate")), "fingerprint": fp(value), "materials": material(name, value) + inspect_blob(value)})
            rr["parameters"].append(row)

        listed = aws(["secretsmanager", "list-secrets", "--include-planned-deletion"], region, env) or {}
        names = {item.get("ARN") or item.get("Name") for item in listed.get("SecretList", []) if "sparta" in item.get("Name", "").lower()}
        names.update(secret_refs)
        for secret_id in sorted(x for x in names if x):
            versions = aws(["secretsmanager", "list-secret-version-ids", "--secret-id", secret_id, "--include-deprecated"], region, env) or {}
            row = {"idFingerprint": fp(secret_id), "name": secret_id.rsplit(":", 1)[-1] if secret_id.startswith("arn:") else secret_id, "versions": []}
            for version in versions.get("Versions", []):
                vid = version.get("VersionId", "")
                value = aws(["secretsmanager", "get-secret-value", "--secret-id", secret_id, "--version-id", vid], region, env)
                if not value: continue
                raw = value.get("SecretString", "")
                row["versions"].append({"versionId": vid[:16], "stages": version.get("VersionStages", []), "fingerprint": fp(raw), "materials": inspect_blob(raw)})
            rr["secrets"].append(row)

        groups = aws(["logs", "describe-log-groups", "--log-group-name-pattern", "sparta"], region, env) or {}
        for group in groups.get("logGroups", []):
            name = group.get("logGroupName", "")
            row = {"name": name, "storedBytes": group.get("storedBytes"), "retentionDays": group.get("retentionInDays"), "materials": []}
            seen = set()
            for term in ('"private-key"', '"PRIVATE_KEY"', '"mnemonic"'):
                events = aws(["logs", "filter-log-events", "--log-group-name", name, "--filter-pattern", term, "--limit", "100"], region, env) or {}
                for event in events.get("events", []):
                    message = event.get("message", "")
                    for match in INLINE_HEX_RE.finditer(message):
                        raw = match.group(1)
                        address = address_from_scalar(raw)
                        key = (fp(raw), address)
                        if address and key not in seen:
                            seen.add(key)
                            row["materials"].append({"kind": "log_context_scalar", "fingerprint": key[0], "address": address, "timestamp": event.get("timestamp")})
            rr["logGroups"].append(row)
        account["regions"].append(rr)
    report["accounts"].append(account)

report["errors"] = errors
encoded = base64.b64encode(json.dumps(report, separators=(",", ":"), sort_keys=True).encode()).decode()
print("SPARTA_AUDIT_RESULT_B64=" + encoded)
