#!/usr/bin/env python3
"""
Commits API - A web service for querying git commit information with Redis caching.

This service provides efficient access to commit information from the aztec-packages
repository using a local reference clone and Redis caching to minimize git operations.

Environment Variables:
    REDIS_HOST: Redis server hostname (default: localhost)
    REDIS_PORT: Redis server port (default: 6379)
    REDIS_PASSWORD: Redis password (optional)
    REPO_PATH: Path to the reference git repository
    PORT: Web server port (default: 8000)
"""

import os
import sys
import subprocess
import re
import json
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from flask import Flask, jsonify, request
import redis

app = Flask(__name__)

# Configuration
REDIS_HOST = os.environ.get('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.environ.get('REDIS_PORT', '6379'))
REDIS_PASSWORD = os.environ.get('REDIS_PASSWORD')
REPO_PATH = os.environ.get('REPO_PATH', '/home/ubuntu/aztec-packages-ci-reference')
PORT = int(os.environ.get('PORT', '8000'))

# Redis key prefixes for clear organization
REDIS_KEY_PREFIX = 'aztec:commits:'
REDIS_KEY_COMMIT_INFO = f'{REDIS_KEY_PREFIX}info:'  # aztec:commits:info:<commit_hash>
REDIS_KEY_COMMIT_BODY = f'{REDIS_KEY_PREFIX}body:'  # aztec:commits:body:<commit_hash>
REDIS_KEY_RANGE_LIST = f'{REDIS_KEY_PREFIX}range:'  # aztec:commits:range:<ref>:<limit>
REDIS_KEY_MERGE_TRAIN = f'{REDIS_KEY_PREFIX}merge_train:'  # aztec:commits:merge_train:<commit_hash>

# Cache TTL (time to live) in seconds
CACHE_TTL_COMMIT_INFO = 3600 * 24 * 7  # 7 days for commit info (immutable)
CACHE_TTL_COMMIT_BODY = 3600 * 24 * 7  # 7 days for commit body (immutable)
CACHE_TTL_RANGE_LIST = 3600  # 1 hour for range lists (can change as new commits arrive)
CACHE_TTL_MERGE_TRAIN = 3600 * 24 * 7  # 7 days for merge train info (immutable)

# Initialize Redis connection
try:
    redis_client = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=REDIS_PASSWORD,
        decode_responses=True,
        socket_connect_timeout=5
    )
    redis_client.ping()
    print(f"Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
except Exception as e:
    print(f"WARNING: Could not connect to Redis: {e}")
    print("Service will run without caching")
    redis_client = None


def run_git_command(cmd: List[str], cwd: str = REPO_PATH) -> str:
    """Run a git command and return its output."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True,
            cwd=cwd
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"Git command failed: {' '.join(cmd)}")
        print(f"Error: {e.stderr}")
        return ""
    except Exception as e:
        print(f"Unexpected error running git command: {e}")
        return ""


def update_reference_repo():
    """Update the reference repository to get latest commits."""
    try:
        # Fetch all branches and tags
        run_git_command(['git', 'fetch', '--all', '--tags'])
        print(f"Updated reference repository at {REPO_PATH}")
        return True
    except Exception as e:
        print(f"Failed to update reference repository: {e}")
        return False


def get_commit_info_from_git(commit: str) -> Optional[Dict]:
    """Get commit information directly from git."""
    # Format: hash|subject|author|author_date_relative
    result = run_git_command([
        'git', 'log', '--format=%H|%s|%an|%ar', '-n1', commit
    ])

    if not result:
        return None

    parts = result.split('|', 3)
    if len(parts) != 4:
        return None

    commit_hash, message, author, date = parts

    return {
        'hash': commit_hash,
        'message': message,
        'author': author,
        'date': date
    }


def get_commit_info(commit: str, use_cache: bool = True) -> Optional[Dict]:
    """Get commit information with Redis caching."""
    cache_key = f'{REDIS_KEY_COMMIT_INFO}{commit}'

    # Try cache first if enabled
    if use_cache and redis_client:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception as e:
            print(f"Cache read error: {e}")

    # Get from git
    info = get_commit_info_from_git(commit)

    # Store in cache if enabled
    if info and redis_client:
        try:
            redis_client.setex(
                cache_key,
                CACHE_TTL_COMMIT_INFO,
                json.dumps(info)
            )
        except Exception as e:
            print(f"Cache write error: {e}")

    return info


def get_commit_body(commit: str, use_cache: bool = True) -> str:
    """Get commit body with Redis caching."""
    cache_key = f'{REDIS_KEY_COMMIT_BODY}{commit}'

    # Try cache first if enabled
    if use_cache and redis_client:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                return cached
        except Exception as e:
            print(f"Cache read error: {e}")

    # Get from git
    body = run_git_command(['git', 'log', '--format=%b', '-n1', commit])

    # Store in cache if enabled
    if redis_client:
        try:
            redis_client.setex(cache_key, CACHE_TTL_COMMIT_BODY, body)
        except Exception as e:
            print(f"Cache write error: {e}")

    return body


def get_pr_number(message: str) -> Optional[str]:
    """Extract PR number from commit message."""
    match = re.search(r'#(\d+)', message)
    return match.group(1) if match else None


def detect_breaking(subject: str, commit: str) -> Tuple[bool, str]:
    """Detect if a commit is breaking."""
    # Check subject for '!'
    m = re.match(r'^(fix|feat|chore|refactor|docs|style|test|perf|ci|build|revert)(\([^)]+\))?(!)?(:)', subject)
    if m and m.group(3):
        return True, ''

    # Check body for BREAKING CHANGE footer
    body = get_commit_body(commit)
    if not body:
        return False, ''

    footer_match = re.search(r'(?im)^(BREAKING(?: CHANGE| CHANGES)?|BREAKING):\s*(.+)?$', body)
    if footer_match:
        summary = footer_match.group(2) or ''
        return True, summary.strip()

    return False, ''


def get_merge_train_commits(merge_commit: str, use_cache: bool = True) -> List[str]:
    """Get commits in a merge train with caching."""
    cache_key = f'{REDIS_KEY_MERGE_TRAIN}{merge_commit}'

    # Try cache first if enabled
    if use_cache and redis_client:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception as e:
            print(f"Cache read error: {e}")

    # Get first parent
    first_parent = run_git_command(['git', 'rev-parse', f'{merge_commit}^1'])
    if not first_parent:
        return []

    # Get all commits in the merge train branch
    commits_output = run_git_command([
        'git', 'rev-list', '--reverse', f'{first_parent}..{merge_commit}^2'
    ])

    if not commits_output:
        return []

    commits = []
    for commit in commits_output.split('\n'):
        if not commit:
            continue

        # Get the commit message
        message = run_git_command(['git', 'log', '--format=%s', '-n1', commit])

        # Skip merge commits without PR numbers
        if message.startswith('Merge branch') and '#' not in message:
            continue

        commits.append(commit)

    # Store in cache if enabled
    if redis_client:
        try:
            redis_client.setex(
                cache_key,
                CACHE_TTL_MERGE_TRAIN,
                json.dumps(commits)
            )
        except Exception as e:
            print(f"Cache write error: {e}")

    return commits


def get_commits_list(ref: str, limit: int, use_first_parent: bool = True, use_cache: bool = True) -> List[Dict]:
    """Get a list of commits with caching."""
    cache_key = f'{REDIS_KEY_RANGE_LIST}{ref}:{limit}:{use_first_parent}'

    # Try cache first if enabled
    if use_cache and redis_client:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception as e:
            print(f"Cache read error: {e}")

    # Build git command
    log_cmd = ['git', 'log', f'--format=%H|%s|%an|%ar', ref, '-n', str(limit)]
    if use_first_parent:
        log_cmd.insert(2, '--first-parent')

    log_output = run_git_command(log_cmd)

    if not log_output:
        return []

    commits = []
    for line in log_output.split('\n'):
        if not line:
            continue

        parts = line.split('|', 3)
        if len(parts) != 4:
            continue

        commit, message, author, date = parts

        commits.append({
            'hash': commit,
            'message': message,
            'author': author,
            'date': date,
            'pr_number': get_pr_number(message)
        })

    # Store in cache if enabled (with shorter TTL since this can change)
    if redis_client:
        try:
            redis_client.setex(
                cache_key,
                CACHE_TTL_RANGE_LIST,
                json.dumps(commits)
            )
        except Exception as e:
            print(f"Cache write error: {e}")

    return commits


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    redis_status = 'connected' if redis_client else 'disabled'

    # Check if repository is accessible
    try:
        repo_check = run_git_command(['git', 'rev-parse', 'HEAD'])
        repo_status = 'ok' if repo_check else 'error'
    except:
        repo_status = 'error'

    return jsonify({
        'status': 'healthy' if repo_status == 'ok' else 'degraded',
        'redis': redis_status,
        'repository': repo_status,
        'repo_path': REPO_PATH
    })


@app.route('/commit/<commit_hash>', methods=['GET'])
def get_commit(commit_hash: str):
    """Get information about a specific commit."""
    info = get_commit_info(commit_hash)

    if not info:
        return jsonify({'error': 'Commit not found'}), 404

    # Add breaking change detection
    is_breaking, breaking_summary = detect_breaking(info['message'], commit_hash)
    info['is_breaking'] = is_breaking
    if is_breaking and breaking_summary:
        info['breaking_summary'] = breaking_summary

    return jsonify(info)


@app.route('/commits', methods=['GET'])
def get_commits():
    """Get a list of commits for a given ref/range."""
    ref = request.args.get('ref', 'HEAD')
    limit = int(request.args.get('limit', '50'))
    first_parent = request.args.get('first_parent', 'true').lower() == 'true'

    # Limit the limit to prevent abuse
    limit = min(limit, 1000)

    commits = get_commits_list(ref, limit, first_parent)

    return jsonify({
        'ref': ref,
        'limit': limit,
        'count': len(commits),
        'commits': commits
    })


@app.route('/merge-train/<commit_hash>', methods=['GET'])
def get_merge_train(commit_hash: str):
    """Get commits in a merge train."""
    commits = get_merge_train_commits(commit_hash)

    # Get detailed info for each commit
    detailed_commits = []
    for commit in commits:
        info = get_commit_info(commit)
        if info:
            detailed_commits.append(info)

    return jsonify({
        'merge_commit': commit_hash,
        'count': len(detailed_commits),
        'commits': detailed_commits
    })


@app.route('/update', methods=['POST'])
def update_repo():
    """Update the reference repository (requires authentication in production)."""
    # In production, this should require authentication
    success = update_reference_repo()

    return jsonify({
        'success': success,
        'message': 'Repository updated' if success else 'Update failed'
    })


@app.route('/cache/stats', methods=['GET'])
def cache_stats():
    """Get cache statistics."""
    if not redis_client:
        return jsonify({'error': 'Redis not available'}), 503

    try:
        # Get all keys with our prefix
        keys = redis_client.keys(f'{REDIS_KEY_PREFIX}*')

        # Count by type
        stats = {
            'total_keys': len(keys),
            'commit_info': len([k for k in keys if k.startswith(REDIS_KEY_COMMIT_INFO)]),
            'commit_body': len([k for k in keys if k.startswith(REDIS_KEY_COMMIT_BODY)]),
            'range_list': len([k for k in keys if k.startswith(REDIS_KEY_RANGE_LIST)]),
            'merge_train': len([k for k in keys if k.startswith(REDIS_KEY_MERGE_TRAIN)])
        }

        # Get memory usage
        info = redis_client.info('memory')
        stats['memory_used'] = info.get('used_memory_human', 'unknown')

        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/cache/clear', methods=['POST'])
def clear_cache():
    """Clear all cached data (requires authentication in production)."""
    if not redis_client:
        return jsonify({'error': 'Redis not available'}), 503

    try:
        # Get all keys with our prefix
        keys = redis_client.keys(f'{REDIS_KEY_PREFIX}*')

        if keys:
            redis_client.delete(*keys)

        return jsonify({
            'success': True,
            'cleared': len(keys)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/', methods=['GET'])
def index():
    """API documentation."""
    return jsonify({
        'name': 'Aztec Commits API',
        'version': '1.0.0',
        'endpoints': {
            '/health': 'Health check',
            '/commit/<hash>': 'Get commit information',
            '/commits?ref=<ref>&limit=<n>&first_parent=<bool>': 'Get list of commits',
            '/merge-train/<hash>': 'Get merge train commits',
            '/update': 'Update reference repository (POST)',
            '/cache/stats': 'Get cache statistics',
            '/cache/clear': 'Clear cache (POST)'
        },
        'redis_keys': {
            'commit_info': f'{REDIS_KEY_COMMIT_INFO}<hash>',
            'commit_body': f'{REDIS_KEY_COMMIT_BODY}<hash>',
            'range_list': f'{REDIS_KEY_RANGE_LIST}<ref>:<limit>:<first_parent>',
            'merge_train': f'{REDIS_KEY_MERGE_TRAIN}<hash>'
        }
    })


if __name__ == '__main__':
    # Ensure repository exists
    if not os.path.exists(REPO_PATH):
        print(f"ERROR: Repository not found at {REPO_PATH}")
        print("Please clone the repository first:")
        print(f"  git clone --bare https://github.com/AztecProtocol/aztec-packages.git {REPO_PATH}")
        sys.exit(1)

    # Update repository on startup
    print("Updating reference repository...")
    update_reference_repo()

    print(f"Starting Commits API on port {PORT}")
    print(f"Repository: {REPO_PATH}")
    print(f"Redis: {REDIS_HOST}:{REDIS_PORT} ({'enabled' if redis_client else 'disabled'})")

    app.run(host='0.0.0.0', port=PORT, debug=False)
