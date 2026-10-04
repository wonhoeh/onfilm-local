const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { once } = require('node:events');
const { ApiProcess } = require('../src/api-process.cjs');

async function fixture(mode = '', options = {}) {
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return new ApiProcess({
    command: process.execPath, args: [path.join(__dirname, 'fixtures/api.cjs')],
    origin: `http://127.0.0.1:${port}`, cwd: __dirname,
    env: { ...process.env, ONFILM_API_PORT: String(port), ONFILM_INSTANCE_ID: 'test-instance', FIXTURE_MODE: mode },
  }, { timeoutMs: 1500, stopTimeoutMs: 500, ...options });
}

test('starts once, verifies identity, and stops the owned process', async (t) => {
  const api = await fixture(); t.after(() => api.stop());
  const first = api.start();
  assert.equal(api.start(), first);
  await first;
  const child = api.child;
  assert.equal(api.ready, true);
  await api.start();
  assert.equal(api.child, child);
  await api.stop();
  assert.equal(api.child, null);
  assert.equal(api.ready, false);
  await api.resume();assert.equal(api.ready,true);assert.notEqual(api.child,child);
});

test('occupied port is rejected without killing its owner', async (t) => {
  const api = await fixture(); t.after(() => api.stop());
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(Number(new URL(api.config.origin).port), '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => socket.close(resolve)));
  await assert.rejects(api.start(), /포트가 사용 중/);
  assert.equal(socket.listening, true);
  assert.equal(api.child, null);
});

for (const mode of ['wrong', 'hang', 'exit']) {
  test(`${mode}: failed startup is cleaned up and can retry`, async (t) => {
    const api = await fixture(mode); t.after(() => api.stop());
    await assert.rejects(api.start());
    assert.equal(api.child, null);
    api.config.env.FIXTURE_MODE = '';
    await api.start();
    assert.equal(api.ready, true);
  });
}

test('missing executable reports an actionable error', async (t) => {
  const api = await fixture(); t.after(() => api.stop());
  api.config.command = path.join(__dirname, 'nonexistent-java');
  await assert.rejects(api.start(), /Java/);
  assert.equal(api.child, null);
});

test('stop during startup cancels and reaps child', async () => {
  const api = await fixture('hang');
  const starting = api.start();
  const rejection = assert.rejects(starting);
  await api.stop();
  await rejection;
  assert.equal(api.child, null);
});

test('unexpected exit after ready notifies UI and permits restart', async (t) => {
  const api = await fixture(); t.after(() => api.stop());
  await api.start();
  const failed = once(api, 'failed');
  api.child.kill();
  await failed;
  await api.start();
  assert.equal(api.ready, true);
});
