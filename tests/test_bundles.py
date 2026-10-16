"""Ephemeral keys and synthetic manuscripts only; no real credentials."""
import base64
from datetime import timedelta
import json
import os
from pathlib import Path
import unittest
import test_column_release as fixtures
from test_column_release import package, r
from seal_column import crypt

class BundleTests(unittest.TestCase):
    setUp = fixtures.ReleaseTests.setUp
    tearDown = fixtures.ReleaseTests.tearDown

    def seal(self, payload=None):
        slot=r.SLOTS[0]; payload=payload or package(slot)
        env={'REVIA_BUNDLE_KEY':base64.b64encode(os.urandom(32)).decode()}
        output=self.root/'scheduled'/(slot+'.enc.json');output.parent.mkdir(exist_ok=True)
        raw=json.dumps(payload).encode()
        output.write_bytes(crypt('encrypt',slot,raw,env))
        return output,env,raw

    def test_encrypted_release_and_large_image(self):
        p=package(r.SLOTS[0])
        p['assets']={'images/column-2026-10-test.png':base64.b64encode(os.urandom(200000)).decode()}
        p['approval']['sha256']=r.fingerprint(p)
        path,env,raw=self.seal(p)
        self.assertNotIn(b'Synthetic release test.',path.read_bytes())
        self.assertEqual(crypt('decrypt',r.SLOTS[0],path.read_bytes(),env),raw)
        changes,missing,records=r.prepare(self.root,r.release_at(r.SLOTS[0]),env)
        self.assertFalse(missing);self.assertEqual(len(records),1)
        self.assertEqual(len(changes['images/column-2026-10-test.png']),200000)
        r.write_changes(self.root,changes)
        self.assertEqual(r.prepare(self.root,r.release_at(r.SLOTS[0]),{})[0],{})

    def test_wrong_key_and_ciphertext_tampering_fail_closed(self):
        path,env,_=self.seal()
        for key in ('',base64.b64encode(os.urandom(32)).decode()):
            with self.assertRaisesRegex(r.ReleaseError,'BUNDLE_CRYPTO_FAILED'):
                r.prepare(self.root,r.release_at(r.SLOTS[0]),{'REVIA_BUNDLE_KEY':key})
        b=json.loads(path.read_bytes());b['tag']=base64.b64encode(os.urandom(16)).decode();path.write_text(json.dumps(b))
        with self.assertRaisesRegex(r.ReleaseError,'BUNDLE_CRYPTO_FAILED'):
            r.prepare(self.root,r.release_at(r.SLOTS[0]),env)
        self.assertFalse((self.root/r.LEDGER).exists())

    def test_future_and_november_do_not_decrypt(self):
        path,_,_=self.seal();path.write_text('MALFORMED CANARY')
        for at in (r.release_at(r.SLOTS[0])-timedelta(microseconds=1),r.STOP):
            self.assertEqual(r.prepare(self.root,at,{}),({},[],{}))

    def test_encryption_does_not_grant_approval(self):
        p=package(r.SLOTS[0]);p['approval']['by']='not-representative'
        _,env,_=self.seal(p)
        with self.assertRaisesRegex(r.ReleaseError,'REPRESENTATIVE_APPROVAL_REQUIRED'):
            r.prepare(self.root,r.release_at(r.SLOTS[0]),env)

    def test_ambiguous_sources_rejected(self):
        from test_column_release import environment
        _,env,_=self.seal()
        with self.assertRaisesRegex(r.ReleaseError,'AMBIGUOUS_ARTICLE_SOURCE'):
            r.prepare(self.root,r.release_at(r.SLOTS[0]),{**env,**environment(r.SLOTS[0])})
