#!/usr/bin/env python3
"""Refresh bounded public video metadata; never infer recommendation evidence."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

ROOT = Path(__file__).resolve().parents[1]

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    os.replace(temporary, path)

def get_metadata(seed):
    key = 'bvid' if seed.get('bvid') else 'aid'
    value = str(seed[key])
    if key == 'bvid' and not re.fullmatch(r'BV[0-9A-Za-z]{10}', value):
        raise ValueError('Invalid BVID')
    if key == 'aid' and not value.isdigit():
        raise ValueError('Invalid AID')
    url = 'https://api.bilibili.com/x/web-interface/view?' + key + '=' + value
    body = subprocess.check_output(['curl', '-fsSL', '--connect-timeout', '8', '--max-time', '20', url], text=True)
    result = json.loads(body)
    if result.get('code') != 0 or result.get('data', {}).get('state') != 0:
        raise ValueError('Metadata unavailable: ' + str(result.get('code')))
    data = result['data']
    return {k: data[k] for k in ('bvid', 'aid', 'cid', 'pages', 'title', 'owner', 'pic', 'duration', 'pubdate', 'desc')}

def evidence_for(bvid, recommendations):
    records, seen = [], set()
    for record in recommendations:
        if record.get('bvid') != bvid or record.get('sentiment') != 'recommend' or record.get('reviewed') is not True:
            continue
        required = ['sourceUrl', 'platform', 'authorKey', 'publishedAt', 'summary']
        if any(not isinstance(record.get(k), str) or not record[k].strip() for k in required):
            raise ValueError('Incomplete reviewed recommendation: ' + bvid)
        parsed = urlsplit(record['sourceUrl'])
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError('Recommendation must link to an HTTPS source')
        if dt.date.fromisoformat(record['publishedAt']) > dt.datetime.now(dt.timezone.utc).date():
            raise ValueError('Recommendation date cannot be in the future')
        query = [(k,v) for k,v in parse_qsl(parsed.query) if not k.lower().startswith('utm_') and k.lower() not in ('spm_id_from', 'share_source', 'share_medium')]
        signature = urlunsplit((parsed.scheme, parsed.netloc.lower(), parsed.path.rstrip('/'), urlencode(sorted(query)), ''))
        if signature in seen:
            continue
        seen.add(signature)
        records.append(record)
    # Per-platform accounts are distinguishable; do not claim cross-platform people.
    platforms = {r['platform'] for r in records}
    platform_counts = [(len({r['authorKey'] for r in records if r['platform'] == p}), len({r['publishedAt'][:7] for r in records if r['platform'] == p})) for p in platforms]
    accounts, months = max(platform_counts, key=lambda c: (c[0] >= 3 and c[1] >= 3, min(c), c[0], c[1]), default=(0,0))
    public_records = [{k:r[k] for k in ('sourceUrl','platform','publishedAt','summary')} for r in records]
    return {'accounts': accounts, 'months': months, 'qualified': accounts >= 3 and months >= 3, 'records': public_records}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--offline', action='store_true', help='Rebuild with locally verified metadata')
    args = parser.parse_args()
    seeds = json.loads((ROOT/'data/seeds.json').read_text())
    evidence = json.loads((ROOT/'data/recommendations.json').read_text())
    cache_path = ROOT/'data/metadata.json'
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    videos, failures, seen = [], [], set()
    for seed in seeds:
        key = seed.get('bvid', str(seed.get('aid')))
        item = cache.get(key)
        if not args.offline:
            try:
                item = get_metadata(seed)
                item['_verifiedAt'] = now
                cache[key] = item
                time.sleep(0.35)
            except (subprocess.SubprocessError, ValueError, KeyError) as exc:
                failures.append({'id': key, 'error': str(exc)[:160]})
        if not item:
            continue
        bvid = item['bvid']
        if bvid in seen:
            raise ValueError('Duplicate video: ' + bvid)
        seen.add(bvid)
        ev = evidence_for(bvid, evidence)
        videos.append({**seed, 'id':bvid, 'bvid':bvid, 'title':item['title'], 'creator':item['owner']['name'],
            'aid':item.get('aid'), 'cid':item.get('cid'), 'creatorMid':item['owner']['mid'],
            'creatorAvatar':item['owner'].get('face','').replace('http://','https://'),
            'pages':[{'page':p['page'], 'cid':p.get('cid'), 'title':p.get('part') or item['title'], 'duration':p['duration']} for p in item.get('pages',[])],
            'creatorUrl':'https://space.bilibili.com/'+str(item['owner']['mid']),
            'cover':item['pic'].replace('http://','https://'), 'duration':item['duration'],
            'publishedAt':dt.datetime.fromtimestamp(item['pubdate'], dt.timezone(dt.timedelta(hours=8))).date().isoformat(),
            'url':'https://www.bilibili.com/video/'+bvid+'/', 'verifiedAt':item.get('_verifiedAt'),
            'metadataStale':any(f['id']==key for f in failures), 'evidence':ev,
            'selection': 'community' if ev['qualified'] else 'editorial'})
    cache = {key: {k: value[k] for k in ('bvid', 'aid', 'cid', 'pages', 'title', 'owner', 'pic', 'duration', 'pubdate', 'desc', '_verifiedAt') if k in value} for key,value in cache.items()}
    write_json(cache_path, cache)
    if not videos:
        raise SystemExit('No verified videos; catalog was not overwritten.')
    guide_path = ROOT/'data/guide.json'
    guide = json.loads(guide_path.read_text()) if guide_path.exists() else {}
    write_json(ROOT/'dist/catalog.json', {'schemaVersion':2, 'updatedAt':now, 'videos':videos, 'refreshFailures':len(failures), **guide})
    print(json.dumps({'videos':len(videos), 'failed':failures}, ensure_ascii=False))

if __name__ == '__main__':
    main()
