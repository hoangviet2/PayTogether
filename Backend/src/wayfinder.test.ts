// Tool arguments come from the model, so they are Zod-checked before any store write.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as s from './store.ts';
import { toolsFor } from './wayfinder.ts';

test('tool args are validated before running', async () => {
  const t = s.createTrip('Test', 'USD', ['Ana', 'Ben']);
  const { tools, web } = toolsFor(t);
  const run = (name: string, args: string) => tools.find((x) => x.def.name === name)!.run(args);
  assert.equal(web.length, 1); // DESTINATIONS gets web search
  assert.equal(JSON.parse(await run('get_trip_state', '')).phase, 'DESTINATIONS');
  assert.match(await run('propose_destinations', '{"destinations":[]}'), /^Error: invalid arguments/);
  assert.match(await run('propose_destinations', 'not json'), /^Error: arguments were not valid JSON/);
  assert.equal(t.destinations.length, 0);
  assert.match(await run('propose_destinations', '{"destinations":["Lisbon"],"start_date":"2027-05-14","end_date":"2027-05-17"}'), /Saved/);
  assert.deepEqual(t.destinations, ['Lisbon']);
});
