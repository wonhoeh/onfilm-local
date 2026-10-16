const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const window={};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../backend/src/main/resources/static/image-position-editor.js'),'utf8'),{window});
const {drag,normalize}=window.OnfilmImagePosition;
const plain=value=>JSON.parse(JSON.stringify(value));
test('photo position defaults to center and clamps invalid positions',()=>{
 assert.deepEqual(plain(normalize()),{x:50,y:50});
 assert.deepEqual(plain(normalize({x:Infinity,y:-12})),{x:50,y:0});
 assert.deepEqual(plain(normalize({x:150,y:49.6})),{x:100,y:50});
});
test('drag uses cropped overflow rather than frame width, covers landscape/portrait/uncropped',()=>{
 assert.deepEqual(plain(drag({x:50,y:50},-100,99,{x:200,y:0})),{x:100,y:50});
 assert.deepEqual(plain(drag({x:50,y:50},100,0,{x:200,y:0})),{x:0,y:50});
 assert.deepEqual(plain(drag({x:50,y:50},100,25,{x:0,y:100})),{x:50,y:25});
 assert.deepEqual(plain(drag({x:80,y:10},500,-500,{x:0,y:0})),{x:80,y:10});
});
