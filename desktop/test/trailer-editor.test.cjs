const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../../backend/src/main/resources/static/trailer-editor.js'),'utf8'),context);
const {time,seconds,validRange}=context.window.OnfilmTrailerEditor;
test('trailer editor time conversion and bounds',()=>{
  assert.equal(time(65.3),'00:01:05.3');assert.equal(seconds('01:05.3'),65.3);
  assert.equal(seconds('15.5'),15.5);assert(Number.isNaN(seconds('invalid')));
  assert(validRange(0,300,600));assert(!validRange(0,301,600));
  assert(!validRange(-1,5,10));assert(!validRange(5,4,10));
  assert(!validRange(0,11,10));assert(!validRange(0,Infinity,600));
});
