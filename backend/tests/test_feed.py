import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.app import feed


class FeedTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.patch = patch.multiple(feed, DATA=Path(self.tmp.name), ROOT=Path(self.tmp.name),
                                    SECRET_FILE=Path(self.tmp.name)/'keys.env')
        self.patch.start()
        feed.init()

    def tearDown(self):
        self.patch.stop()
        self.tmp.cleanup()

    def rows(self, count=10):
        return [dict(id=i, source_id=i, url=f'https://site{i}.example/article', title=f'Artykuł {i}',
                     snippet='', published=time.time(), quality=.5, novelty=.5, topic=f'temat {i}',
                     category='', boost=0, source=f'Site {i}', summary='', analyzed=0, rating=0)
                for i in range(1,count+1)]

    def test_opml_idempotent_and_categories(self):
        text='<opml><body><outline text="Nauka"><outline xmlUrl="https://example.com/rss" text="Test"/></outline></body></opml>'
        self.assertEqual(feed.import_opml(text),1)
        self.assertEqual(feed.import_opml(text),0)
        with feed.db() as c:
            self.assertEqual(c.execute('SELECT category FROM sources').fetchone()[0],'Nauka')

    def test_opml_rejects_entities(self):
        with self.assertRaises(Exception):
            feed.import_opml('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><opml>&x;</opml>')

    def test_private_urls_and_redirects_rejected(self):
        for url in ('http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                feed.fetch(url)
        for url in ('file:///etc/passwd','https://user:pass@example.com','http://example.com:8000/'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                feed.valid_url(url)

    def test_dns_is_checked_before_connecting(self):
        with patch.object(feed.socket,'getaddrinfo',return_value=[(2,1,6,'',('10.0.0.2',80))]), patch.object(feed.socket,'create_connection') as connect:
            with self.assertRaises(ValueError): feed.fetch('https://example.com/rss')
            connect.assert_not_called()

    def test_diversity_and_determinism(self):
        rows=self.rows()
        rows[1]['url']='https://site1.example/another'
        rows[2]['source_id']=1
        selected=feed.select(rows,feed.settings(),[],{},'today')
        self.assertEqual(len(selected),5)
        self.assertEqual(len({feed.urlsplit(r['url']).hostname for r in selected}),5)
        self.assertEqual(len({r['source_id'] for r in selected}),5)
        self.assertEqual([r['id'] for r in selected],[r['id'] for r in feed.select(rows,feed.settings(),[],{},'today')])
        self.assertEqual(selected[-1]['reason'],'Losowe odkrycie')

    def test_topic_exposure_penalizes_repetition(self):
        rows=self.rows(2)
        rows[0]['quality']=.6
        history=[dict(source_id=1,topic='temat 1',category='')]*8
        self.assertEqual(feed.select(rows,feed.settings(),history,{1:100},'today')[0]['id'],2)

    def test_digest_send_is_idempotent(self):
        feed.put('chat_id','123')
        with patch.object(feed,'secret',return_value='secret'), patch.object(feed,'selection',return_value=self.rows(5)), patch.object(feed,'telegram',return_value={'message_id':9}) as send:
            # Selection normally attaches the editorial reason.
            with patch.object(feed,'selection',return_value=[dict(r,reason='Odkrycie') for r in self.rows(5)]):
                feed.send_digest(); feed.send_digest()
            send.assert_called_once()
        with feed.db() as c:
            self.assertEqual(c.execute('SELECT state FROM digests').fetchone()[0],'sent')

    def test_timeout_does_not_resend(self):
        feed.put('chat_id','123')
        with patch.object(feed,'secret',return_value='secret'), patch.object(feed,'selection',return_value=[dict(r,reason='Odkrycie') for r in self.rows(5)]), patch.object(feed,'telegram',side_effect=TimeoutError) as send:
            feed.send_digest(); feed.send_digest()
            send.assert_called_once()
        with feed.db() as c:
            self.assertEqual(c.execute('SELECT state FROM digests').fetchone()[0],'uncertain')

    def test_pairing_requires_code_and_cannot_replace_owner(self):
        with patch.object(feed,'secret',return_value='pair'), patch.object(feed,'telegram') as send:
            feed.process_update({'message':{'chat':{'id':1,'type':'private'},'text':'/start wrong'}})
            self.assertFalse(feed.settings()['chat_id'])
            feed.process_update({'message':{'chat':{'id':1,'type':'private'},'text':'/start pair'}})
            feed.process_update({'message':{'chat':{'id':2,'type':'private'},'text':'/start pair'}})
            self.assertEqual(feed.settings()['chat_id'],'1')
            send.assert_called_once()

    def test_api_requires_separate_key(self):
        app=FastAPI();app.include_router(feed.router)
        with TestClient(app) as client, patch.object(feed,'secret',return_value='admin'):
            self.assertEqual(client.get('/api/feed/state').status_code,401)
            result=client.get('/api/feed/state',headers={'Authorization':'Bearer admin'})
            self.assertEqual(result.status_code,200)
            self.assertNotIn('gemini_key',result.json())
            bad=client.put('/api/feed/config',headers={'Authorization':'Bearer admin'},json={'hour':'25:05'})
            self.assertEqual(bad.status_code,422)

    def test_llm_failure_fallback_and_budget(self):
        with patch.object(feed,'secret',return_value='secret'), patch.object(feed.httpx,'post',side_effect=TimeoutError) as call:
            for _ in range(6): feed.analyze(self.rows(),feed.settings())
            self.assertEqual(call.call_count,4)
            self.assertIn('Limit 4',feed.settings()['llm_status'])

    def test_tracking_params_removed(self):
        self.assertEqual(feed.canonical('https://example.com/a?id=3&utm_source=x#foo'),'https://example.com/a?id=3')

    def test_warsaw_dst(self):
        tz=ZoneInfo('Europe/Warsaw')
        self.assertEqual(datetime(2026,1,1,8,5,tzinfo=tz).utcoffset().total_seconds(),3600)
        self.assertEqual(datetime(2026,7,1,8,5,tzinfo=tz).utcoffset().total_seconds(),7200)

    def test_prepare_before_schedule_without_sending(self):
        feed.put('chat_id','123')
        moment=datetime(2026,9,7,7,50,tzinfo=ZoneInfo('Europe/Warsaw'))
        with patch.object(feed,'datetime') as clock, patch.object(feed,'STOP') as stop, patch.object(feed,'refresh') as refresh, patch.object(feed,'analyze') as analyze, patch.object(feed,'send_digest') as send:
            clock.now.return_value=moment
            stop.is_set.side_effect=[False,True]
            feed.worker()
            refresh.assert_called_once()
            analyze.assert_called_once()
            send.assert_not_called()
            self.assertEqual(feed.settings()['prepared_day'],'2026-09-07')

    def test_prepared_digest_sends_without_llm_wait(self):
        day=datetime.now(ZoneInfo('Europe/Warsaw')).date().isoformat()
        feed.put('chat_id','123');feed.put('prepared_day',day)
        with patch.object(feed,'secret',return_value='secret'), patch.object(feed,'selection',return_value=[dict(r,reason='Odkrycie') for r in self.rows(5)]) as select, patch.object(feed,'telegram',return_value={'message_id':1}):
            feed.send_digest()
            self.assertFalse(select.call_args[0][1])


if __name__=='__main__': unittest.main()
