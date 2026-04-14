"""EC2 instance pricing: live on-demand + spot rates with TTL cache.

Queries the AWS Pricing API (on-demand) and EC2 describe_spot_price_history
(spot) for us-east-2 instance rates. Caches results for 24 hours and falls
back to hardcoded values if the APIs are unavailable.

Exports:
    get_instance_rate(instance_type, is_spot) -> float
    get_fallback_vcpu_rate(is_spot) -> float
"""
import json
import threading
import time
from datetime import datetime, timezone

# ---- Hardcoded fallback rates (us-east-2, USD/hr) ----

_HARDCODED_RATES = {
    ('m6a.xlarge',   True):  0.07,   # spot
    ('m6a.xlarge',   False): 0.1728, # on-demand
    ('m6a.4xlarge',  True):  0.28,
    ('m6a.4xlarge',  False): 0.6912,
    ('m6a.8xlarge',  True):  0.55,
    ('m6a.8xlarge',  False): 1.3824,
    ('m6a.16xlarge', True):  2.77,
    ('m6a.16xlarge', False): 5.52,
    ('m6a.24xlarge', True):  1.66,
    ('m6a.24xlarge', False): 4.1472,
    ('m6a.32xlarge', True):  5.54,
    ('m6a.32xlarge', False): 11.04,
    ('m6a.48xlarge', True):  8.31,
    ('m6a.48xlarge', False): 16.56,
    ('m7a.48xlarge', True):  8.31,
    ('m7a.48xlarge', False): 16.56,
    ('m7a.16xlarge', True):  2.77,
    ('m7a.16xlarge', False): 5.52,
    ('m7i.48xlarge', True):  8.31,
    ('m7i.48xlarge', False): 16.56,
    ('r7g.16xlarge', True):  1.97,
    ('r7g.16xlarge', False): 3.94,
}
_FALLBACK_VCPU_HOUR = {True: 0.0433, False: 0.0864}

# ---- Cache state ----

_REGION = 'us-east-2'
_LOCATION = 'US East (Ohio)'  # Pricing API uses location names, not codes
_CACHE_TTL = 24 * 3600  # 24 hours

_cache = {
    'ondemand': {},   # instance_type -> USD/hr
    'spot': {},       # instance_type -> USD/hr
    'ts': 0,          # last successful fetch time
}
_cache_lock = threading.Lock()


# ---- On-demand pricing (AWS Pricing API) ----

def _fetch_ondemand_rate(pricing_client, instance_type: str) -> float | None:
    """Fetch on-demand hourly rate for a single instance type from AWS Pricing API.

    The Pricing API is only available in us-east-1 and ap-south-1.
    """
    try:
        response = pricing_client.get_products(
            ServiceCode='AmazonEC2',
            Filters=[
                {'Type': 'TERM_MATCH', 'Field': 'instanceType', 'Value': instance_type},
                {'Type': 'TERM_MATCH', 'Field': 'location', 'Value': _LOCATION},
                {'Type': 'TERM_MATCH', 'Field': 'operatingSystem', 'Value': 'Linux'},
                {'Type': 'TERM_MATCH', 'Field': 'preInstalledSw', 'Value': 'NA'},
                {'Type': 'TERM_MATCH', 'Field': 'tenancy', 'Value': 'Shared'},
                {'Type': 'TERM_MATCH', 'Field': 'capacitystatus', 'Value': 'Used'},
            ],
            MaxResults=10,
        )
        for price_item in response.get('PriceList', []):
            product = json.loads(price_item) if isinstance(price_item, str) else price_item
            on_demand = product.get('terms', {}).get('OnDemand', {})
            for term in on_demand.values():
                for dim in term.get('priceDimensions', {}).values():
                    price = dim.get('pricePerUnit', {}).get('USD')
                    if price and float(price) > 0:
                        return float(price)
    except Exception as e:
        print(f"[ec2_pricing] on-demand fetch error for {instance_type}: {e}")
    return None


def _fetch_all_ondemand(instance_types: list[str]) -> dict[str, float]:
    """Fetch on-demand rates for all instance types. Returns {type: rate}."""
    try:
        import boto3
    except ImportError:
        print("[ec2_pricing] boto3 not installed, skipping on-demand fetch")
        return {}

    results = {}
    try:
        # Pricing API is only in us-east-1 and ap-south-1
        pricing = boto3.client('pricing', region_name='us-east-1')
        for itype in instance_types:
            rate = _fetch_ondemand_rate(pricing, itype)
            if rate is not None:
                results[itype] = rate
    except Exception as e:
        print(f"[ec2_pricing] on-demand client error: {e}")
    return results


# ---- Spot pricing (EC2 describe_spot_price_history) ----

def _fetch_all_spot(instance_types: list[str]) -> dict[str, float]:
    """Fetch current spot prices for all instance types. Returns {type: rate}.

    Uses describe_spot_price_history with StartTime=now to get the most recent
    price. Takes the minimum across availability zones.
    """
    try:
        import boto3
    except ImportError:
        print("[ec2_pricing] boto3 not installed, skipping spot fetch")
        return {}

    results = {}
    try:
        ec2 = boto3.client('ec2', region_name=_REGION)
        for itype in instance_types:
            try:
                response = ec2.describe_spot_price_history(
                    InstanceTypes=[itype],
                    ProductDescriptions=['Linux/UNIX'],
                    StartTime=datetime.now(timezone.utc),
                    MaxResults=10,
                )
                prices = []
                for entry in response.get('SpotPriceHistory', []):
                    try:
                        prices.append(float(entry['SpotPrice']))
                    except (KeyError, ValueError):
                        continue
                if prices:
                    # Use the minimum AZ price (what our fleet would target)
                    results[itype] = min(prices)
            except Exception as e:
                print(f"[ec2_pricing] spot fetch error for {itype}: {e}")
    except Exception as e:
        print(f"[ec2_pricing] spot client error: {e}")
    return results


# ---- Cache refresh ----

def _get_known_instance_types() -> list[str]:
    """Return the set of instance types we need pricing for (hardcoded + from DB)."""
    types = {itype for itype, _ in _HARDCODED_RATES}
    try:
        import db
        conn = db.get_db()
        rows = conn.execute(
            "SELECT DISTINCT instance_type FROM ci_runs "
            "WHERE instance_type IS NOT NULL AND instance_type != '' AND instance_type != 'unknown'"
        ).fetchall()
        types.update(r['instance_type'] for r in rows)
    except Exception:
        pass
    return sorted(types)


def _refresh_cache():
    """Fetch fresh pricing data and update the cache. Thread-safe."""
    now = time.time()
    if _cache['ts'] and now - _cache['ts'] < _CACHE_TTL:
        return
    if not _cache_lock.acquire(blocking=False):
        return  # another thread is already refreshing
    try:
        # Double-check after acquiring lock
        if _cache['ts'] and time.time() - _cache['ts'] < _CACHE_TTL:
            return

        instance_types = _get_known_instance_types()
        ondemand = _fetch_all_ondemand(instance_types)
        spot = _fetch_all_spot(instance_types)

        # Only update cache if we got at least some data
        if ondemand or spot:
            if ondemand:
                _cache['ondemand'] = ondemand
            if spot:
                _cache['spot'] = spot
            _cache['ts'] = time.time()
            print(f"[ec2_pricing] Cache refreshed: {len(ondemand)} on-demand, {len(spot)} spot rates")
        else:
            print("[ec2_pricing] No pricing data returned, keeping existing cache/fallbacks")
    except Exception as e:
        print(f"[ec2_pricing] Cache refresh error: {e}")
    finally:
        _cache_lock.release()


def _ensure_cached():
    """Ensure cache is populated. Blocks on first call, async refresh after."""
    if not _cache['ts']:
        _refresh_cache()  # block on first load
    else:
        threading.Thread(target=_refresh_cache, daemon=True).start()


# ---- Public API ----

def get_instance_rate(instance_type: str, is_spot: bool) -> float:
    """Get the hourly rate for an EC2 instance type.

    Tries live pricing cache first, falls back to hardcoded rates.

    Args:
        instance_type: EC2 instance type (e.g. 'm6a.48xlarge')
        is_spot: True for spot pricing, False for on-demand

    Returns:
        Hourly rate in USD.
    """
    _ensure_cached()

    # Try live cache
    cache_key = 'spot' if is_spot else 'ondemand'
    rate = _cache[cache_key].get(instance_type)
    if rate is not None:
        return rate

    # Fall back to hardcoded
    rate = _HARDCODED_RATES.get((instance_type, is_spot))
    if rate is not None:
        return rate

    # Unknown instance type -- return 0 (caller should use vCPU fallback)
    return 0.0


def get_fallback_vcpu_rate(is_spot: bool) -> float:
    """Get the per-vCPU hourly rate for unknown instance types.

    Args:
        is_spot: True for spot, False for on-demand

    Returns:
        Per-vCPU hourly rate in USD.
    """
    return _FALLBACK_VCPU_HOUR[is_spot]
