const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../../backend/src/main/resources');
test('public filmography displays only populated groups and hides headings when last item is removed',async()=>{
  const elements={};
  const get=id=>elements[id]??=(id.endsWith('Films')?{children:[],section:{hidden:true},replaceChildren(){this.children=[];},append(card){this.children.push(card);},closest(){return this.section;}}:{hidden:false,textContent:''});
  let films=['ACTING','DIRECTING','LEAD','SUPPORTING','MINOR'].map(category=>({category}));
  vm.runInNewContext(fs.readFileSync(path.join(root,'public-portfolio/public-filmography.js'),'utf8'),{document:{getElementById:get},window:{createPublicFilmCard:f=>f},fetch:async()=>({ok:true,json:async()=>({profile:{name:'배우'},films})})});
  await new Promise(r=>setImmediate(r));
  for(const group of ['video','directing','lead','supporting','experience'])assert.equal(get(group+'Films').section.hidden,false);
  films=[{category:'MINOR'}];await get('retryFilms').onclick();
  assert.equal(get('experienceFilms').section.hidden,false);assert.equal(get('leadFilms').section.hidden,true);
  films=[];await get('retryFilms').onclick();
  for(const group of ['video','directing','lead','supporting','experience'])assert.equal(get(group+'Films').section.hidden,true);
  assert.equal(get('filmsStatus').textContent,'등록된 작품이 없습니다.');
});
