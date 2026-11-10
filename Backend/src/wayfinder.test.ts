// Tool arguments come from the model, so they are Zod-checked before any store write.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as s from './store.ts';
import { plainText, runTurn, toolsFor } from './wayfinder.ts';

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

test('a burst of triggers while a turn is queued becomes one turn, not a backlog', async () => {
  delete process.env.OPENAI_API_KEY; // the turn fails fast and says so: one message per turn, no network
  const t = s.createTrip('Burst', 'USD', ['Ana', 'Ben']);
  const before = t.chat.length;
  await Promise.all([1, 2, 3, 4, 5].map((n) => runTurn(t, `edit ${n}`, () => {})));
  assert.equal(t.chat.length - before, 1);
  assert.equal(t.busy, false);
});

test('chat replies: paragraphs, no bullet points; ranges keep their dash', () => {
  assert.equal(plainText('Stops for the trip:\n- Hanoi, 3 nights\n- Hue, 2 nights\nPress Confirm.'), 'Stops for the trip: Hanoi, 3 nights, Hue, 2 nights.\nPress Confirm.');
  assert.equal(plainText('Options\n• Hotel A\n* Hotel B\n1. Hotel C'), 'Options: Hotel A, Hotel B, Hotel C.');
  assert.equal(plainText('Da Lat — 2 nights - then Hue'), 'Da Lat, 2 nights, then Hue');
  assert.equal(plainText('Nov 9–10, $10-$20, 5 – 7 nights, check-in'), 'Nov 9–10, $10-$20, 5 – 7 nights, check-in');
});
