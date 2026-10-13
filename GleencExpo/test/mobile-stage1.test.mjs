import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const clientSource = fs.readFileSync(new URL('../src/services/gleenc-api.js', import.meta.url), 'utf8');
const { createGleencApi } = await import('data:text/javascript;base64,' + Buffer.from(clientSource).toString('base64'));
function compile(file, modules = {}, globals = {}) {
  const input = fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
  const output = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require: name => { if (!(name in modules)) throw new Error('Unexpected dependency: ' + name); return modules[name]; }, URL, AbortController, Headers, FormData, fetch, setTimeout, clearTimeout, __DEV__:true, ...globals }, { filename: file });
  return exports;
}
const mapper = compile('features/feed/remote-feed.ts');
const session = suffix => ({ accessToken:'access-' + suffix, refreshToken:'refresh-' + suffix, sessionId:'session-' + suffix, accessExpiresAt:new Date(Date.now()+60000).toISOString(), expiresAt:new Date(Date.now()+3600000).toISOString(), tokenType:'Bearer' });
const ok = data => new Response(JSON.stringify({ data }), { status: 200 });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const post = (id='post1') => ({ id, author:{id:'promoter',name:'Author',username:'author'}, originalOwner:{id:'seller',name:'Seller'}, product:{id:'product1',ownerId:'seller',name:'Bowl',storeName:'Store',category:'Kitchen',description:'Full details',priceKobo:500000,stock:8,media:[{kind:'image',url:'https://cdn.test/image.png'}],presentation:'image'}, counts:{likeCount:2,liked:true,commentCount:3}, markupBps:2000, createdAt:'2026-10-01T12:00:00Z' });
test('feed preserves original product, post, seller and promoter identities and exact 20% markup', () => {
  const item = mapper.mapRemotePost(post());
  assert.equal(item.id,'post1'); assert.equal(item.remote.productId,'product1'); assert.equal(item.remote.authorId,'promoter'); assert.equal(item.sellerId,'seller');
  assert.equal(item.priceKobo,600000); assert.equal(item.likes,2); assert.equal(item.remote.viewerLiked,true);
});
test('video presentation, multiple image gallery, and missing media have no demo fallback', () => {
  const p=post(); p.product.presentation='video'; p.product.media.push({kind:'video',url:'https://cdn.test/movie.mp4'});
  assert.equal(mapper.mapRemotePost(p).videoUrl,'https://cdn.test/movie.mp4'); assert.equal(mapper.mapRemotePost(p).kind,'video');
  p.product.media=[]; assert.equal(mapper.mapRemotePost(p).image,'');
  p.product.media=[{kind:'image',url:'file:///private/key'},{kind:'video',url:'javascript:alert(1)'}];
  assert.equal(mapper.mapRemotePost(p).videoUrl,''); assert.equal(mapper.mapRemotePost(p).images.length,0);
});
test('filtered empty server pages still preserve nextOffset and invalid responses fail visibly', () => {
  assert.equal(mapper.mapRemotePage({posts:[],nextOffset:20}).nextOffset,20);
  assert.throws(() => mapper.mapRemotePage({posts:[]}));
  assert.equal(mapper.mapRemotePost({id:'missing-product'}),null);
});
test('browser transport uses cookies and never stores mobile tokens', async () => {
  let request, saves=0;
  const api=createGleencApi({baseUrl:'https://api.test/api/v2',platform:'web',saveSession:async()=>saves++,fetchImpl:async(_url,options)=>{request=options;return ok({user:{id:'browser'},session:session('browser')});}});
  await api.auth.login({email:'x@test',password:'unused'});
  assert.equal(request.credentials,'include'); assert.equal(request.headers.Authorization,undefined); assert.equal(saves,0);
});
test('native requests share one refresh and retry with the rotated bearer, without cookie auth', async () => {
  let saved=session('old'), refreshes=0;
  const api=createGleencApi({baseUrl:'https://api.test/api/v2',platform:'ios',getSession:async()=>saved,saveSession:async s=>{saved=s;},fetchImpl:async(url,options)=>{
    assert.equal(options.credentials,'omit');
    if(url.endsWith('/auth/refresh')) {refreshes++; await new Promise(r=>setTimeout(r,5));return ok(session('new'));}
    return options.headers.Authorization==='Bearer access-old' ? new Response('{}',{status:401}) : ok({user:{id:'real'}});
  }});
  await Promise.all([api.account.get(),api.account.get()]); assert.equal(refreshes,1); assert.equal(saved.accessToken,'access-new');
});
test('late login cannot restore tokens after logout', async () => {
  const response=deferred(); let stored=null;
  const api=createGleencApi({baseUrl:'https://api.test/api/v2',platform:'android',getSession:async()=>stored,saveSession:async s=>{stored=s;},clearSession:async()=>{stored=null;},fetchImpl:async url=>url.endsWith('/auth/login') ? response.promise : ok({})});
  const login=api.auth.login({email:'buyer@test',password:'unused'}); const rejected=assert.rejects(login,error=>error.status===409);
  await api.auth.logout(); response.resolve(ok({user:{id:'buyer'},session:session('old')})); await rejected; assert.equal(stored,null);
});
test('late refresh cannot restore tokens after logout', async () => {
  const response=deferred(); let stored=session('old'), entered=deferred();
  const api=createGleencApi({baseUrl:'https://api.test/api/v2',platform:'ios',getSession:async()=>stored,saveSession:async s=>{stored=s;},clearSession:async()=>{stored=null;},fetchImpl:async url=>{if(url.endsWith('/auth/refresh')) {entered.resolve(); return response.promise;} return ok({});}});
  const refresh=api.refresh(); await entered.promise; await api.auth.logout(); response.resolve(ok(session('new'))); assert.equal(await refresh,false); assert.equal(stored,null);
});
test('late logout cannot delete a newer login session', async () => {
  const response=deferred(); let stored=session('old');
  const api=createGleencApi({baseUrl:'https://api.test/api/v2',platform:'android',getSession:async()=>stored,saveSession:async s=>{stored=s;},clearSession:async()=>{stored=null;},fetchImpl:async url=>url.endsWith('/auth/logout')?response.promise:ok({user:{id:'new'},session:session('new')})});
  const logout=api.auth.logout(); const rejected=assert.rejects(logout,error=>error.status===409);
  await api.auth.login({email:'new@test',password:'unused'}); response.resolve(ok({})); await rejected; assert.equal(stored.accessToken,'access-new');
});
test('refresh network failure preserves keychain credentials', async () => {
  let clears=0; const api=createGleencApi({baseUrl:'https://api.test/api/v2',platform:'ios',getSession:async()=>session('old'),clearSession:async()=>clears++,fetchImpl:async()=>{throw new Error('offline');}});
  await assert.rejects(api.refresh(),/offline/); assert.equal(clears,0);
});
test('expired refresh invalidates the native session', async () => {
  let clears=0; const api=createGleencApi({baseUrl:'https://api.test/api/v2',platform:'ios',getSession:async()=>session('old'),clearSession:async()=>clears++,fetchImpl:async()=>new Response('{}',{status:401})});
  assert.equal(await api.refresh(),false); assert.equal(clears,1);
});
test('insecure API URLs and cross-origin request paths are rejected', async () => {
  assert.throws(()=>createGleencApi({baseUrl:'http://api.test/api/v2'}));
  assert.throws(()=>createGleencApi({baseUrl:'https://secret@api.test/api/v2'}));
  const api=createGleencApi({baseUrl:'https://api.test/api/v2'});
  await assert.rejects(api.request('//other.test/account'),/Invalid API path/);
});
test('corrupt secure storage is cleared; browser never accesses SecureStore', async () => {
  let removed=0; const native=compile('services/api.ts', {'expo-secure-store':{getItemAsync:async()=>'{invalid',deleteItemAsync:async()=>removed++},'react-native':{Platform:{OS:'ios'}},'@/constants/config':{AppConfig:{sharedApiBaseUrl:'https://api.test/api/v2'}},'./gleenc-api':{createGleencApi}});
  assert.equal(await native.readSession(),null); assert.equal(removed,1);
  const web=compile('services/api.ts', {'expo-secure-store':{getItemAsync:async()=>{throw new Error('browser keychain access');}},'react-native':{Platform:{OS:'web'}},'@/constants/config':{AppConfig:{sharedApiBaseUrl:'https://api.test/api/v2'}},'./gleenc-api':{createGleencApi}});
  assert.equal(await web.readSession(),null);
});
test('menu base zero is labelled as configurable pricing, not a free completed meal', () => {
  const data=compile('features/feed/data.ts'); const p=post(); p.product.priceKobo=0; p.product.ordering={format:'menu'};
  const item=mapper.mapRemotePost(p); assert.equal(data.listingPrice(item),'Choose items for price');
});
test('logout still removes local credentials if the network is unavailable', async () => {
  let saved=session('old'); const api=createGleencApi({baseUrl:'https://api.test/api/v2',platform:'android',getSession:async()=>saved,clearSession:async()=>{saved=null;},fetchImpl:async()=>{throw new Error('offline');}});
  await assert.rejects(api.auth.logout(),/offline/); assert.equal(saved,null);
});
