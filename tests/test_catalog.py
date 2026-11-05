import datetime as dt
import importlib.util
import json
from pathlib import Path
import unittest
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('catalog', ROOT/'scripts/refresh-catalog.py')
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)
BVID = 'BV1darmBcE4A'


def recommendation(n, author=None, month=None, platform='example'):
    return {'bvid': BVID, 'sourceUrl': f'https://example.org/posts/{n}',
            'platform': platform, 'authorKey': author or str(n),
            'publishedAt': f'2025-{month or n:02d}-01', 'summary': 'Test fixture',
            'sentiment': 'recommend', 'reviewed': True}


class RecommendationEvidenceTests(unittest.TestCase):
    def test_reviewed_distinct_accounts_and_months_qualify(self):
        result = catalog.evidence_for(BVID, [recommendation(i) for i in range(1,4)])
        self.assertTrue(result['qualified'])
        self.assertNotIn('authorKey', result['records'][0])

    def test_one_account_cannot_become_three_people(self):
        result = catalog.evidence_for(BVID, [recommendation(i, author='same') for i in range(1,4)])
        self.assertFalse(result['qualified'])

    def test_one_month_does_not_meet_cross_month_rule(self):
        self.assertFalse(catalog.evidence_for(BVID, [recommendation(i, month=1) for i in range(1,4)])['qualified'])

    def test_platform_identities_are_not_summed(self):
        self.assertFalse(catalog.evidence_for(BVID, [recommendation(i, platform=str(i)) for i in range(1,4)])['qualified'])

    def test_months_and_accounts_must_qualify_on_same_platform(self):
        records = [recommendation(i, month=1) for i in range(1,4)]
        records += [recommendation(i+3, author='one', month=i, platform='elsewhere') for i in range(1,4)]
        self.assertFalse(catalog.evidence_for(BVID, records)['qualified'])

    def test_tracking_urls_do_not_create_extra_recommendations(self):
        original = recommendation(1)
        variants = [original, {**original,'sourceUrl': original['sourceUrl']+'/?utm_source=share#reply'}, {**original,'sourceUrl': original['sourceUrl']+'?spm_id_from=share'}]
        self.assertEqual(len(catalog.evidence_for(BVID, variants)['records']), 1)

    def test_unreviewed_and_negative_mentions_do_not_count(self):
        records = [{**recommendation(1),'reviewed':False}, {**recommendation(2),'sentiment':'negative'}]
        self.assertEqual(catalog.evidence_for(BVID, records)['accounts'], 0)

    def test_future_dates_and_unsafe_sources_are_rejected(self):
        tomorrow = (dt.datetime.now(dt.timezone.utc).date()+dt.timedelta(days=1)).isoformat()
        for changed in ({'publishedAt':tomorrow}, {'sourceUrl':'javascript:alert(1)'}, {'sourceUrl':'https://'}):
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                catalog.evidence_for(BVID, [{**recommendation(1),**changed}])


class SeasonTests(unittest.TestCase):
    def setUp(self):
        self.episodes = [
            {'season_id': 7, 'bvid': bvid, 'aid': n, 'cid': 10*n, 'title': f'Ep{n}',
             'arc': {'aid': n, 'state': 0, 'author': {'mid': 9}},
             'pages': [{'page': 1, 'cid': 10*n, 'duration': 60*n}]}
            for n, bvid in enumerate(['BV1Q34y1E72s', 'BV1uK411x7cp'], 1)
        ]
        self.season = {'id': 7, 'mid': 9, 'title': 'Series', 'ep_count': 2,
                       'sections': [{'episodes': self.episodes}]}
        self.data = {'bvid': self.episodes[0]['bvid'], 'pic': 'cover', 'owner': {'mid': 9},
                     'ugc_season': self.season}

    def test_separate_archives_preserve_order_source_and_total_duration(self):
        result = catalog.season_metadata(self.data, 7)
        self.assertEqual(result['duration'], 180)
        self.assertEqual(result['pages'], [
            {'page': 1, 'part': 'Ep1', 'bvid': 'BV1Q34y1E72s', 'aid': 1, 'cid': 10, 'duration': 60},
            {'page': 2, 'part': 'Ep2', 'bvid': 'BV1uK411x7cp', 'aid': 2, 'cid': 20, 'duration': 120},
        ])

    def test_partial_seasons_and_unusable_source_archives_are_rejected(self):
        with self.assertRaises(ValueError):
            catalog.season_metadata(self.data, 99)
        self.episodes[1]['pages'] = []
        with self.assertRaises(ValueError):
            catalog.season_metadata(self.data, 7)
        self.episodes.pop()
        with self.assertRaises(ValueError):
            catalog.season_metadata(self.data, 7)


class PublishedCatalogTests(unittest.TestCase):
    def test_featured_creators_have_unique_bilibili_profiles(self):
        guide = json.loads((ROOT/'data/guide.json').read_text())
        published = json.loads((ROOT/'dist/catalog.json').read_text())
        profiles = published['featuredCreators']
        self.assertEqual(profiles, guide['featuredCreators'])
        self.assertEqual(len({p['mid'] for p in profiles}), len(profiles))
        for profile in profiles:
            self.assertTrue(profile['name'].strip())
            self.assertGreater(profile['mid'], 0)
            self.assertEqual(profile['url'], f"https://space.bilibili.com/{profile['mid']}")
            self.assertEqual(profile['category'], 'explore')

    def test_all_seeds_have_consistent_verified_public_metadata(self):
        published = json.loads((ROOT/'dist/catalog.json').read_text())
        seeds = json.loads((ROOT/'data/seeds.json').read_text())
        listed = published['videos']
        unlisted = published.get('unlistedVideos', [])
        self.assertTrue(all(not v.get('unlisted') for v in listed))
        self.assertTrue(all(v['unlisted'] for v in unlisted))
        self.assertEqual(len(unlisted), sum(bool(seed.get('unlisted')) for seed in seeds))
        listed_ids = {video['id'] for video in listed}
        for collection in published['collections']:
            self.assertTrue(set(collection['videos']).issubset(listed_ids))
        videos = listed + unlisted
        self.assertEqual(len(videos), len(seeds))
        self.assertEqual(len({v['id'] for v in videos}), len(videos))
        self.assertEqual(published['refreshFailures'], 0)
        for video in videos:
            with self.subTest(bvid=video['id']):
                self.assertRegex(video['id'], r'^BV[0-9A-Za-z]{10}$')
                self.assertEqual(video['url'], f"https://www.bilibili.com/video/{video['id']}/")
                self.assertEqual(urlsplit(video['creatorUrl']).hostname, 'space.bilibili.com')
                self.assertEqual(urlsplit(video['cover']).scheme, 'https')
                self.assertGreater(video['duration'], 0)
                self.assertIn(video['category'], ['ai','code','world','english','health','sports','explore'])
                self.assertTrue(video['pages'])
                self.assertEqual([p['page'] for p in video['pages']], list(range(1,len(video['pages'])+1)))
                self.assertTrue(all(p['cid'] and p['duration'] > 0 for p in video['pages']))
                self.assertTrue(video['creator'] and video['title'] and video['verifiedAt'])
                self.assertFalse(video['metadataStale'])
                self.assertEqual(video['selection']=='community', video['evidence']['qualified'])


if __name__ == '__main__':
    unittest.main()
