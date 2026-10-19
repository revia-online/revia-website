// Exercise the worker's real mock response with the site's real calendar helpers.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const workerSource = (await readFile('cloudflare/worker.template.js', 'utf8'))
  .replace('__ROUTES__', '{}').replace('__PUBLIC_FILES__', '[]').replace('__PRODUCTION_APPROVED__', 'false');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);
const response = await worker.fetch(new Request('https://validation.pages.dev/__qa/booking'), {});
const { slots: [slot], testOnly } = await response.json();
assert.equal(testOnly, true);
assert.equal(slot.id, `${slot.date}T${slot.time}`);
assert.equal(slot.startIso, slot.id + ':00+09:00');
assert.equal(Date.parse(slot.endIso) - Date.parse(slot.startIso), 30 * 60000);
assert.match(slot.label, /2026年10月20日 10:00〜10:30/);
const site = await readFile('script.js', 'utf8');
const helpers = site.slice(site.indexOf('const slotIdToGoogleDate ='), site.indexOf('const buildMailUrl ='));
const context = { URLSearchParams, REVIA_SETTINGS: { meetingMinutes: 30 }, slot };
vm.createContext(context);
const calendar = vm.runInContext(helpers + '\nbuildCalendarUrl({slotId:slot.id})', context);
assert.equal(new URL(calendar).searchParams.get('dates'), '20261020T100000/20261020T103000');
assert.ok(!calendar.includes('NaN'));
console.log('MOCK_CALENDAR_VERIFIED 20261020T100000/20261020T103000');
