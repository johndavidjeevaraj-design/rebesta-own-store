#!/usr/bin/env python3
"""Safe production smoke test. It never creates an order."""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get('BASE_URL', 'http://127.0.0.1:3000').rstrip('/')


def call(method, path, payload=None, timeout=90):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode()
        headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode()
    return json.loads(raw)


def expect(condition, message):
    if not condition:
        raise SystemExit(f'FAIL: {message}')


def main():
    health = call('GET', '/health')
    expect(health.get('ok') is True, '/health did not return ok')

    products = call('GET', '/api/products')
    expect(products.get('count', 0) >= 100, f'Expected at least 100 products, received {products.get("count")}')

    near_address = {
        'line1': 'Hosur - Denkanikottai Road',
        'area': 'Shanthi Nagar West',
        'city': 'Hosur',
        'pincode': '635109',
    }
    near = call('POST', '/api/quote', {
        'items': [{'handle': 'potato', 'qty': 1}],
        'address': near_address,
        'location': {'lat': 12.730378, 'lng': 77.824745, 'label': 'Smoke-test near-hub pin'},
    })
    quote = near.get('quote', {})
    expect(quote.get('eligible') is True, f'near pin should be eligible: {quote}')
    expect(quote.get('deliveryFeeInr') == 20, f'near pin should be ₹20, received {quote.get("deliveryFeeInr")}')

    free = call('POST', '/api/quote', {
        'items': [{'handle': 'potato', 'qty': 16}],
        'address': near_address,
        'location': {'lat': 12.730378, 'lng': 77.824745},
    })
    expect(free.get('quote', {}).get('deliveryFeeInr') == 0, '₹560 basket should receive free delivery')

    far = call('POST', '/api/quote', {
        'items': [{'handle': 'potato', 'qty': 1}],
        'address': {
            'line1': 'Athimugam - Perandapalli - Thorapalli Road',
            'city': 'Kelamangalam',
            'pincode': '635113',
        },
        'location': {'lat': 12.660095, 'lng': 77.867623},
    })
    expect(far.get('quote', {}).get('eligible') is False, f'far pin should not be eligible: {far.get("quote")}')
    expect(far.get('quote', {}).get('distanceKm', 0) > 9, f'far pin should be beyond 9 road km: {far.get("quote")}')

    print({
        'base': BASE,
        'products': products.get('count'),
        'nearDistanceKm': quote.get('distanceKm'),
        'nearFeeInr': quote.get('deliveryFeeInr'),
        'freeBasketFeeInr': free.get('quote', {}).get('deliveryFeeInr'),
        'farDistanceKm': far.get('quote', {}).get('distanceKm'),
        'farEligible': far.get('quote', {}).get('eligible'),
        'status': 'PASS (no order created)',
    })


if __name__ == '__main__':
    try:
        main()
    except urllib.error.HTTPError as error:
        print(error.read().decode(), file=sys.stderr)
        raise
