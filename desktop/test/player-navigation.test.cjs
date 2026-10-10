const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../backend/src/main/resources/static/video-player.js'), 'utf8');
function player(search, publicPortfolio = false) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      listeners: {}, attributes: {}, style: {}, volume: 1,
      addEventListener(type, listener) { this.listeners[type] = listener; },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute() {}, pause() {}, load() {},
    });
    return nodes.get(id);
  };
  const location = { search, href: '' };
  vm.runInNewContext(source, {
    URLSearchParams, location, setTimeout: () => 1, clearTimeout() {},
    document: { getElementById: node, querySelector: node, querySelectorAll: () => [],
      documentElement: { dataset: { publicPortfolio: String(publicPortfolio) } }, addEventListener() {} },
    window: { createTimelinePreview: () => ({ destroy() {} }), addEventListener() {} },
  });
  return { back: node('backBtn'), location };
}

for (const [name, search, publicPortfolio, expected, label] of [
  ['profile entry', '', false, '/profile.html', '프로필로 돌아가기'],
  ['filmography entry', '?from=filmography', false, '/filmography.html', '필모그래피로 돌아가기'],
  ['untrusted destination', '?from=https://example.com', false, '/profile.html', '프로필로 돌아가기'],
  ['public profile', '', true, 'index.html', '프로필로 돌아가기'],
  ['public filmography', '?from=filmography', true, 'filmography.html', '필모그래피로 돌아가기'],
  ['public untrusted destination', '?from=https://example.com', true, 'index.html', '프로필로 돌아가기'],
]) {
  test(`player return: ${name}, including failed playback`, () => {
    const { back, location } = player(search, publicPortfolio);
    assert.equal(back.attributes['aria-label'], label);
    back.listeners.click();
    assert.equal(location.href, expected);
    location.href = '';
    back.listeners.keydown({ key: 'Enter', preventDefault() {} });
    assert.equal(location.href, expected);
  });
}
