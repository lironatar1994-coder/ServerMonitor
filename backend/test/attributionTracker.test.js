const test=require('node:test'), assert=require('node:assert/strict'), vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../../ops/growth-tracker.js'),'utf8');
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
function page({session=storage(),local=storage(),search='',pathname='/alenu/',cookie='',referrer=''}={}){
 const sent=[];
 const scope={URL,URLSearchParams,Date,Set,Map,WeakSet,crypto:require('node:crypto'),queueMicrotask,
  location:{hostname:'lawebs.co.il',pathname,search},document:{cookie,referrer,readyState:'complete',currentScript:{dataset:{prefix:'/alenu'}},addEventListener(){}},
  sessionStorage:session,localStorage:local,innerWidth:390,navigator:{webdriver:false},addEventListener(){},history:{pushState(){},replaceState(){}},
  fetch:async(url,req)=>{sent.push(JSON.parse(req.body));},__monitorNavigationIdentity:()=>({session:'navigation_session_1234'})};
 scope.window=scope;vm.runInNewContext(code,scope);
 return {scope,sent,arrival:scope.__monitorAttribution?.()};
}
test('campaign and content survive navigation and first touch survives a new arrival',()=>{
 const session=storage(),local=storage();
 const first=page({session,local,search:'?utm_source=facebook&utm_campaign=launch&utm_content=pinned'});
 assert.equal(first.sent[0].content,'pinned');assert.equal(first.sent[0].evidence,'tagged');
 const next=page({session,local,pathname:'/alenu/start.html'});
 assert.equal(next.arrival.current.source,'facebook');assert.equal(next.arrival.navigation_session_id,'navigation_session_1234');
 const later=page({session:storage(),local,search:'?utm_source=whatsapp&utm_content=message'});
 assert.equal(later.arrival.first.source,'facebook');assert.equal(later.arrival.current.source,'whatsapp');
 assert.equal(later.arrival.latest.source,'whatsapp');
});
test('unavailable storage keeps safe current tags, and internal visits send nothing',()=>{
 const unavailable={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 const p=page({session:unavailable,local:unavailable,search:'?utm_source=facebook&utm_campaign=launch&name=private'});
 assert.equal(p.arrival.current.source,'facebook');assert.ok(!JSON.stringify(p.sent).includes('private'));
 assert.equal(page({cookie:'monitor_internal=1'}).sent.length,0);
});
