"""Core CI rendering logic - minimal dependencies for fast CLI startup."""
import redis
import re
import os
import json
import time
from datetime import datetime
from pathlib import Path

# Color definitions as constants.
YELLOW = "\033[38;2;250;217;121m"
BLUE = "\033[38;2;95;167;241m"
GREEN = "\033[38;2;97;214;104m"
RED = "\033[38;2;230;69;83m"
PURPLE = "\033[38;2;188;109;208m"
BOLD = "\033[1m"
RESET = "\033[0m"
LINK_OPEN = '\033]8;;'
LINK_CLOSE = '\x07'
CLEAR_EOL = "\033[K"
BASE_URL = ""  # Set to full URL in CLI mode

def set_base_url(url: str):
    global BASE_URL
    BASE_URL = url

def hyperlink(link, text):
    return f"{LINK_OPEN}{link}{LINK_CLOSE}{text}{LINK_OPEN}{LINK_CLOSE}"

REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))
r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=False)

def get_list_as_string(key, limit=None):
    try:
        if limit is None:
            values = r.lrange(key, 0, -1)
        else:
            values = r.lrange(key, 0, limit - 1)
        if not values:
            value = ""
        else:
            concatenated = []
            for item in values:
                concatenated.append(item.decode())
            value = "\n".join(concatenated)
    except Exception as e:
        value = f"Error retrieving list: {str(e)}"
    return value

def render(group: list) -> str:
    # Use the first JSON object for common properties.
    data = group[0]
    ts = data['timestamp']
    msg = data['msg']
    name, author, complete = data['name'], data['author'], data.get('complete')

    # Generate comma-delimited job links with color reflecting each job's status.
    valid_jobs = [job for job in group if 'job_id' in job]
    job_links = []
    for job in sorted(valid_jobs, key=lambda j: j['job_id']):
        job_status = job.get('status', '')
        if job_status == 'RUNNING':
            link_color = BLUE
        elif job_status == 'FAILED':
            link_color = RED
        elif job_status == 'PASSED':
            link_color = GREEN
        else:
            link_color = RESET
        job_links.append(f"{link_color}{hyperlink(BASE_URL + '/' + str(job['timestamp']), job['job_id'])}{RESET}")
    links_str = ",".join(job_links)
    date_time = datetime.fromtimestamp(ts // 1000).strftime("%m-%d %H:%M:%S")

    statuses = [job.get('status') for job in group if 'status' in job]
    if statuses and all(s == 'INACTIVE' for s in statuses):
        return f"{date_time}: {links_str} {BOLD}{name}{RESET} {author}: {msg}{CLEAR_EOL}\n"

    current_time = int(time.time() * 1000)
    durations = []
    for job in group:
        # ignore inactive jobs in duration calculation
        if job.get('status') == 'INACTIVE':
            continue
        if 'timestamp' in job:
            job_start = job['timestamp']
            job_complete = job.get('complete')
            job_end = job_complete if job_complete is not None else current_time
            durations.append(job_end - job_start)
    max_duration = max(durations) if durations else 0
    duration = max_duration // 1000
    duration_str = f"({duration // 60}m{duration % 60}s)"
    return f"{date_time}: {links_str} {BOLD}{name}{RESET} {PURPLE}{author}{RESET}: {msg} {duration_str}{CLEAR_EOL}\n"

def get_section_data(section: str, offset: int = 0, limit: int = 100,
                     filter_str: str = '', filter_prop: str = '') -> str:
    """Core logic for fetching and rendering section data."""
    lua_script_path = Path(__file__).parent / 'set-filter.lua'
    with lua_script_path.open('r') as f:
        result = r.eval(f.read(), 1, 'ci-run-' + section, offset, limit, filter_prop, filter_str)

    lines = ""
    if not result:
        lines += "Nothing to see here...\n"
    else:
        groups = {}
        for line in result:
            item = json.loads(line)
            run = item.get('run_id', 'unknown')
            groups.setdefault(run, []).append(item)
        for group in groups.values():
            group_sorted = sorted(group, key=lambda x: x.get('ts', x.get('timestamp', 0)))
            lines += render(group_sorted)

    fail_lines = get_list_as_string("failed_tests_" + section, 100)
    if fail_lines:
        lines += "\n"
        lines += f"Last 100 failed or flaked tests:\n\n"
        lines += fail_lines
    return lines
