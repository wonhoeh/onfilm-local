const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {randomBytes, createCipheriv, createDecipheriv} = require('node:crypto');
const {authorizedCloudflareSender, normalize, createConnectionStore, createConnectionActions} = require('../src/cloudflare/connection.cjs');
const {createConnectionChecker} = require('../src/cloudflare/check.cjs');

const config = () => ({accountId:'a'.repeat(32),bucket:'onfilm-media',project:'onfilm-test',
  siteOrigin:'https://onfilm.co.kr',mediaOrigin:'https://media.onfilm.co.kr',publicSlug:'wonhoe_01',
  accessKeyId:'b'.repeat(32),secretAccessKey:'c'.repeat(64),pagesToken:'d'.repeat(40)});
// OS encryption is covered manually per OS. This cipher verifies the persistence contract.
function testEncryption() {
  const key = randomBytes(32);
  return {
    isEncryptionAvailable:() => true,
    encryptString(value) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm',key,iv);
      const bytes = Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
      return Buffer.concat([iv,cipher.getAuthTag(),bytes]);
    },
    decryptString(bytes) {
      const cipher = createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
      cipher.setAuthTag(bytes.subarray(12,28));
      return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8');
    },
  };
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'onfilm-cloudflare-'));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const directory = path.join(root,'data.connections'), encryption = testEncryption();
  return {directory,encryption,store:createConnectionStore({directory,encryption})};
}

test('Cloudflare IPC only accepts the owning local main frame on its settings page', () => {
  const origin = 'http://127.0.0.1:18765', contents = {mainFrame:{url:origin+'/cloudflare.html'}};
  const event = {sender:contents,senderFrame:contents.mainFrame};
  assert.equal(authorizedCloudflareSender(event,contents,origin),true);
  assert.equal(authorizedCloudflareSender({...event,sender:{}},contents,origin),false);
  assert.equal(authorizedCloudflareSender({...event,senderFrame:{...contents.mainFrame}},contents,origin),false);
  for (const url of [origin+'/profile.html',origin+'/api/exports/id/site/cloudflare.html','https://evil.example/cloudflare.html',origin.replace('18765','9999')+'/cloudflare.html']) {
    contents.mainFrame.url = url; assert.equal(authorizedCloudflareSender(event,contents,origin),false);
  }
});

test('validate settings, preserve blank keys, and require new credentials on account changes', () => {
  const previous = config();
  assert.deepEqual(normalize({...previous,accessKeyId:'',secretAccessKey:'',pagesToken:''},previous),previous);
  for (const change of [{accountId:'evil.example'}, {bucket:'../outside'}, {project:'a?token=x'},
    {siteOrigin:'http://onfilm.co.kr'}, {mediaOrigin:'https://user:pass@example.com'},
    {mediaOrigin:'https://example.com/secret'}, {mediaOrigin:'https://127.0.0.1'},
    {mediaOrigin:previous.siteOrigin}, {pagesToken:'test\nsecret'},
    {accountId:'e'.repeat(32),pagesToken:''}, {accessKeyId:'e'.repeat(32),secretAccessKey:''}]) {
    assert.throws(() => normalize({...previous,...change},previous));
  }
});

test('optional management token is encrypted, preserved on blank and never returned to renderer',async t=>{
  const {store,directory}=await fixture(t),token='management-token-'.repeat(3);
  const actions=createConnectionActions({store,check:async()=>[]});
  const result=await actions.run('save',{...config(),r2ManagementToken:token});
  assert.equal(result.hasR2ManagementToken,true);assert.equal(result.r2ManagementToken,undefined);
  assert(!(await fs.readFile(path.join(directory,'cloudflare.enc'))).includes(Buffer.from(token)));
  await actions.run('save',{...config(),r2ManagementToken:''});assert.equal((await store.read()).r2ManagementToken,token);
  assert.equal(normalize({...config(),accountId:'f'.repeat(32)},await store.read()).r2ManagementToken,undefined);
});

test('encrypted settings persist across store recreation and no IPC response returns credentials', async t => {
  const fixtureData = await fixture(t), {directory,encryption,store} = fixtureData;
  const actions = createConnectionActions({store,check:async () => []});
  assert.equal((await actions.run('load')).configured,false);
  const saved = await actions.run('save',config());
  assert.equal(saved.status,'saved');
  const bytes = await fs.readFile(path.join(directory,'cloudflare.enc'));
  for (const value of Object.values(config())) assert.equal(bytes.includes(Buffer.from(value)),false);
  if (process.platform !== 'win32') assert.equal((await fs.stat(path.join(directory,'cloudflare.enc'))).mode & 0o777,0o600);
  const recreated = createConnectionStore({directory,encryption});
  assert.deepEqual(await recreated.read(),config());
  const loaded = await actions.run('load');
  assert.equal(loaded.publicSlug,'wonhoe_01');
  assert.equal(loaded.publicUrl,'https://onfilm.co.kr/wonhoe_01');
  for (const key of ['accessKeyId','secretAccessKey','pagesToken']) {
    assert.equal(saved[key],undefined); assert.equal(loaded[key],undefined);
    assert.equal(JSON.stringify(loaded).includes(config()[key]),false);
  }
  const bad = await actions.run('save',{...config(),accountId:'bad'});
  assert.equal(bad.status,'error'); assert.deepEqual(await recreated.read(),config());
  const updated = {...config(),project:'other-project',accessKeyId:'',secretAccessKey:'',pagesToken:''};
  assert.equal((await actions.run('save',updated)).status,'saved');
  assert.equal((await recreated.read()).secretAccessKey,config().secretAccessKey);
  assert.equal((await actions.run('clear')).status,'cleared'); assert.equal(await recreated.read(),null);
});

test('public address permits lowercase, digits, hyphens and underscores with length and reserved-name checks', () => {
  for (const slug of ['abc','123','won-ho_01','a'.repeat(30),'_actor-']) {
    assert.equal(normalize({...config(),publicSlug:slug}).publicSlug,slug);
  }
  assert.equal(normalize({...config(),publicSlug:' won_ho-01 '}).publicSlug,'won_ho-01');
  for (const slug of ['', 'ab', 'a'.repeat(31), 'Wonhoe', '배우', 'ab cd', '../actor', 'ab/cd', 'a%2fb', 'ab?c', 'ab#c', 'ab\\cd', 'ab\ncd', 'assets', 'media', '_headers', '_redirects']) {
    assert.throws(() => normalize({...config(),publicSlug:slug}),/공개 주소|주소 이름/);
  }
});

test('legacy credentials load and check without a slug, then save an address without reentering keys', async t => {
  const {directory,encryption,store} = await fixture(t);
  const legacy = config(); delete legacy.publicSlug;
  await store.write(legacy);
  const file = path.join(directory,'cloudflare.enc'), before = await fs.readFile(file);
  const actions = createConnectionActions({store,check:async saved => {
    assert.equal(saved.accessKeyId,legacy.accessKeyId); return [];
  }});
  const loaded = await actions.run('load');
  assert.equal(loaded.status,'loaded'); assert.equal(loaded.configured,true);
  assert.equal(loaded.publicSlug,''); assert.equal(loaded.publicUrl,null);
  assert.equal((await actions.run('check')).status,'checked');
  assert.deepEqual(await fs.readFile(file),before);
  assert.equal((await actions.run('save',{...legacy,publicSlug:'media'})).status,'error');
  assert.deepEqual(await fs.readFile(file),before);
  assert.equal((await actions.run('save',{...legacy,publicSlug:'won-ho_01',accessKeyId:'',secretAccessKey:'',pagesToken:''})).status,'saved');
  const recreated = createConnectionStore({directory,encryption});
  assert.equal((await recreated.read()).publicSlug,'won-ho_01');
  assert.equal((await recreated.read()).pagesToken,legacy.pagesToken);
});

test('unavailable encryption, encryption failures and corrupted files never fall back to plaintext', async t => {
  const {directory,encryption,store} = await fixture(t);
  await store.write(config()); const file = path.join(directory,'cloudflare.enc'), original = await fs.readFile(file);
  for (const changes of [{isEncryptionAvailable:() => false}, {getSelectedStorageBackend:() => 'basic_text'},
    {encryptString:() => {throw new Error(config().secretAccessKey);}}]) {
    const unsafeStore = createConnectionStore({directory,encryption:{...encryption,...changes}});
    const result = await createConnectionActions({store:unsafeStore}).run('save',config());
    assert.equal(result.status,'error'); assert.equal(result.message.includes(config().secretAccessKey),false);
    assert.deepEqual(await fs.readFile(file),original);
  }
  await fs.writeFile(file,'broken encrypted data');
  const actions = createConnectionActions({store});
  assert.equal((await actions.run('load')).status,'error');
  assert.equal((await actions.run('save',config())).status,'error');
  assert.equal((await actions.run('clear')).status,'cleared');
  assert.equal((await actions.run('save',config())).status,'saved');
});

test('connection checks send only fixed-host read requests and do not expose object names or keys', async () => {
  let destroyed = false;
  const check = createConnectionChecker({
    makeS3:options => {
      assert.equal(options.endpoint,`https://${config().accountId}.r2.cloudflarestorage.com`);
      assert.equal(options.credentials.secretAccessKey,config().secretAccessKey);
      assert.equal(options.maxAttempts,1);
      return {send:async command => {
        assert.equal(command.constructor.name,'ListObjectsV2Command');
        assert.deepEqual(command.input,{Bucket:'onfilm-media',MaxKeys:1});
        return {Contents:[{Key:'private-file-name'}]};
      },destroy:() => {destroyed = true;}};
    },
    fetchImpl:async (url,options) => {
      assert.equal(url,`https://api.cloudflare.com/client/v4/accounts/${config().accountId}/pages/projects/onfilm-test`);
      assert.equal(options.method,'GET'); assert.equal(options.redirect,'error');
      assert.equal(options.headers.Authorization,`Bearer ${config().pagesToken}`);
      return new Response(JSON.stringify({success:true,result:{name:'onfilm-test'}}));
    },
  });
  const result = await check(config(),new AbortController().signal);
  assert.deepEqual(result.map(item => item.ok),[true,true]); assert.equal(destroyed,true);
  assert.equal(JSON.stringify(result).includes('private-file-name'),false);
});

test('read failures stay independent and do not leak Cloudflare responses or thrown secrets', async () => {
  const check = createConnectionChecker({
    makeS3:() => ({send:async () => {throw Object.assign(new Error(config().secretAccessKey),{$metadata:{httpStatusCode:403}});},destroy:() => {}}),
    fetchImpl:async () => new Response(config().pagesToken,{status:404}),
  });
  const results = await check(config(),new AbortController().signal);
  assert.deepEqual(results.map(item => item.ok),[false,false]);
  assert.match(results[0].message,/권한/); assert.match(results[1].message,/프로젝트/);
  for (const value of [config().secretAccessKey,config().pagesToken]) assert.equal(JSON.stringify(results).includes(value),false);
  const controller = new AbortController(); controller.abort();
  assert.ok((await check(config(),controller.signal)).every(item => item.message.includes('초과')));
});

test('concurrent settings changes are rejected during checks and dispose cancels the request', async t => {
  const {store} = await fixture(t); await store.write(config());
  let started, finish;
  const ready = new Promise(resolve => {started = resolve;});
  const actions = createConnectionActions({store,check:async (saved,signal) => {
    assert.equal(saved.bucket,'onfilm-media'); started();
    return new Promise(resolve => {finish=resolve;signal.addEventListener('abort',() => resolve([]),{once:true});});
  }});
  const checking = actions.run('check'); await ready;
  assert.equal((await actions.run('clear')).status,'error');
  actions.dispose(); await checking;
  assert.deepEqual(await store.read(),config());
  assert.equal((await actions.run('load')).status,'error');
});
