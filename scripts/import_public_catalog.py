#!/usr/bin/env python3
"""Imports the current public Rebesta storefront catalogue for the independent store.

This uses only anonymous store pages (no Shopify admin token). It flattens Shopify
variants into separate sellable quick-commerce SKUs because the first version of
the independent basket uses one unit per catalogue row.
"""
import json
import re
import shutil
import html
import unicodedata
from pathlib import Path

import requests

APP = Path(__file__).resolve().parents[1]
OUT = APP / 'public' / 'assets' / 'products'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = 'https://rebestafresh.in/products.json?limit=250'
HEADERS = {'User-Agent': 'Rebesta-Independent-Catalogue-Importer/1.0'}
FEATURED = {'potato', 'tomato', 'onion-big', 'carrot-ooty', 'broccoli', 'garlic', 'green-chilli', 'coriander-leaves', 'weekly-family-combo-new', 'mixed-greens-box-main'}


def slug(value):
    value = unicodedata.normalize('NFKD', str(value)).encode('ascii', 'ignore').decode()
    value = re.sub(r'[^a-zA-Z0-9]+', '-', value).strip('-').lower()
    return value or 'item'


def plain(value):
    value = re.sub(r'</p>\s*<p>', '\n\n', value or '')
    value = re.sub(r'<br\s*/?>', '\n', value)
    value = re.sub(r'<[^>]+>', '', value)
    return html.unescape(value).strip()


def image_for(product):
    image_name = f"{product['handle']}.jpg"
    local_legacy = Path('/home/user/vegetable_images') / image_name
    target = OUT / image_name
    if local_legacy.exists():
        shutil.copy2(local_legacy, target)
        return f'/assets/products/{image_name}'
    url = (product.get('images') or [{}])[0].get('src')
    if url:
        response = requests.get(url, headers=HEADERS, timeout=45)
        response.raise_for_status()
        ext = '.jpg'
        target = OUT / image_name
        target.write_bytes(response.content)
        return f'/assets/products/{image_name}'
    return '/assets/brand/basket.jpg'


def split_tags(value):
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [item.strip() for item in str(value or '').split(',') if item.strip()]


def main():
    response = requests.get(SOURCE, headers=HEADERS, timeout=90)
    response.raise_for_status()
    source_products = response.json()['products']
    imported = []
    for product in source_products:
        image = image_for(product)
        variants = product.get('variants') or []
        multiple = len(variants) > 1
        for variant in variants:
            title = variant.get('title') or 'Default Title'
            suffix = slug(title)
            handle = product['handle'] if not multiple or suffix == 'default-title' else f"{product['handle']}-{suffix}"
            price = float(variant.get('price') or 0)
            compare_raw = variant.get('compare_at_price')
            compare = float(compare_raw) if compare_raw not in (None, '') else None
            available = bool(variant.get('available', True)) and product.get('published_at') is not None
            unit_label = type_label = None
            if title and title != 'Default Title':
                unit_label = title
            else:
                unit_label = '1 kg'
            imported.append({
                'handle': handle,
                'baseHandle': product['handle'],
                'title': product['title'] if not multiple else f"{product['title']} — {title}",
                'variantTitle': title if multiple else '',
                'description': plain(product.get('body_html')),
                'vendor': product.get('vendor') or 'Rebesta Fresh',
                'category': product.get('product_type') or 'Fresh Vegetables',
                'tags': split_tags(product.get('tags')),
                'sku': variant.get('sku') or handle.upper().replace('-', '_'),
                'priceInr': price,
                'compareAtInr': compare,
                'image': image,
                'unitLabel': unit_label,
                'weightGrams': int(variant.get('weight') or 1000),
                'stock': 100 if 'weekly-family-combo' not in handle else 50,
                'active': available,
                'featured': product['handle'] in {'potato', 'tomato', 'onion-big', 'carrot-ooty', 'broccoli', 'coriander-leaves', 'weekly-family-combo'},
                'seoTitle': product['title'],
                'seoDescription': plain(product.get('body_html'))[:150]
            })
    imported.sort(key=lambda item: (item['category'], item['title']))
    products_path = APP / 'data' / 'products.json'
    if products_path.exists():
        backup = APP / 'data' / 'products.previous.json'
        shutil.copy2(products_path, backup)
    products_path.write_text(json.dumps(imported, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f'Imported {len(imported)} sellable products from {len(source_products)} Shopify product records')


if __name__ == '__main__':
    main()
