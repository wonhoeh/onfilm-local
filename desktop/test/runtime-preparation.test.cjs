const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {safeEntry,sha256,extract}=require('../scripts/prepare-windows-runtime.cjs');
function zipFixture(name,attributes=0){
  const filename=Buffer.from(name),data=Buffer.from('fixture');let crc=0xffffffff;
  for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);
  local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(0x314,4);central.writeUInt16LE(20,6);
  central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(attributes>>>0,38);
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(46+filename.length,12);end.writeUInt32LE(30+filename.length+data.length,16);
  return Buffer.concat([local,filename,data,central,filename,end]);
}
test('Windows ZIP paths reject traversal, symlinks, devices and alternate streams',()=>{
  for(const name of ['../outside','/absolute','a/../b','a\\b','a//b','a:stream','NUL.txt','x/COM1','a./b','x/ '])assert.throws(()=>safeEntry(name));
  assert.throws(()=>safeEntry('link',0xa1ff0000),/링크/);
  assert.equal(safeEntry('jdk-21+1/bin/java.exe',0x81a40000),'jdk-21+1/bin/java.exe');
  assert.equal(safeEntry('jdk-21+1/'),'jdk-21+1');
});
test('runtime hashes use SHA-256 over original bytes',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'onfilm-hash-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'test');await fs.writeFile(file,'abc');
  assert.equal(await sha256(file),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('ZIP extraction writes only inside fresh staging and rejects links/traversal',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'onfilm-unzip-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const archive=path.join(root,'fixture.zip');await fs.writeFile(archive,zipFixture('jdk/bin/java.exe'));
  const extracted=await extract(archive,path.join(root,'good'));
  assert.equal(await fs.readFile(path.join(extracted,'bin/java.exe'),'utf8'),'fixture');
  await assert.rejects(extract(archive,path.join(root,'good')),/EEXIST/);
  await fs.writeFile(archive,zipFixture('jdk/link',0xa1ff0000));
  await assert.rejects(extract(archive,path.join(root,'link')),/링크/);
  await fs.writeFile(archive,zipFixture('../outside'));
  await assert.rejects(extract(archive,path.join(root,'traversal')));
  await assert.rejects(fs.stat(path.join(root,'outside')),/ENOENT/);
});
