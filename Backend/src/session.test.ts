// Run: npm test (from Backend/). Signed sessions from Log in with PayPal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSession, readSession } from './integrations.ts';

test('session round-trips and rejects tampering', () => {
  const tok = newSession({ user: 'PAYER1', name: 'Ana' });
  assert.deepEqual(readSession(tok), { user: 'PAYER1', name: 'Ana' });
  const [p, sig] = tok.split('.');
  const forged = Buffer.from(JSON.stringify({ user: 'PAYER2', name: 'Eve', exp: Date.now() + 1e9 })).toString('base64url');
  assert.equal(readSession(`${forged}.${sig}`), null);
  assert.equal(readSession(`${p}.x`), null);
  assert.equal(readSession(''), null);
});
