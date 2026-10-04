const {test} = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const {configuration} = require('../src/config.cjs');

test('isolated data path, per-launch identity and no inherited service config', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onfilm-local-config-'));
  t.after(() => fs.rmSync(dir, {recursive:true,force:true}));
  const jar = path.join(dir, 'test jar.jar'); fs.writeFileSync(jar, 'fixture');
  process.env.DB_PASSWORD = 'do-not-inherit';
  t.after(() => { delete process.env.DB_PASSWORD; });
  const config = configuration(dir,{jar});
  assert.equal(config.env.ONFILM_DATA_DIR, dir);
  assert.equal(config.env.DB_PASSWORD, undefined);
  assert.equal(config.env.ONFILM_TOKEN.length,64);
  assert.notEqual(configuration(dir,{jar}).env.ONFILM_TOKEN, config.env.ONFILM_TOKEN);
  assert.equal(config.args[1],jar);
  assert.throws(() => configuration('relative',{jar}));
  assert.throws(() => configuration(dir,{jar,port:99999}));
  assert.throws(() => configuration(dir,{jar:path.join(dir,'absent.jar')}));
});
