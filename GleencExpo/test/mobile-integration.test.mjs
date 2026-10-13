import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=fs.readFileSync(new URL('../src/services/gleenc-api.js',import.meta.url),'utf8');
const {createGleencApi}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function publisher(){
 const bodies=[],uploads=[];
 const api={products:{save:async(body,id)=>{bodies.push({body,id});return {id:id||'created'};}}};
 const modules={'expo-crypto':{CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:async(_,value)=>crypto.createHash('sha256').update(value).digest('hex')},'@/services/api':{api},'@/features/create/catalog':{CATEGORIES:[{id:'kitchen',name:'Kitchen'}],categoryById:id=>id==='kitchen'?{name:'Kitchen'}:null},'@/features/create/model':{blankDraft:ownerId=>({ownerId,colorHex:{},images:[],options:[],variants:[]})},'@/features/marketplace/domain':{defaultPlan:()=>({minimumPercent:80,groups:[],components:[]}),naira:value=>Math.round(Number(value)*100)},'./media':{uploadFile:async(uri,name,type,kind)=>{uploads.push({uri,name,type,kind});return {id:'media_new_'+uploads.length};}}};
 const input=fs.readFileSync(new URL('../src/features/live/publishing.ts',import.meta.url),'utf8'),exports={};
 vm.runInNewContext(ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:name=>{assert(name in modules,name);return modules[name];},Map,Date},{filename:'publishing.ts'});
 return {exports,bodies,uploads};
}
const draft=()=>({ownerId:'seller',name:'Bowl',description:'A complete description',categoryId:'kitchen',basePrice:'5000',baseStock:'12',productType:'physical',presentation:'image',images:[{id:'media_image',uri:'https://cdn.test/bowl.jpg',color:''}],colorHex:{},attributes:{},variants:[],pickup:true,localDelivery:true,interstate:false,localFee:'500'});
test('image and video use the same independent ordering format and offer policy',async()=>{
 const p=publisher(),d=draft();d.orderingPlan={mode:'menu',baseKobo:0,stock:12,unit:'serving',groups:[{name:'rice',min:1,max:3}],components:[{id:'rice',name:'Rice',group:'rice',unit:'spoon',description:'One standard serving spoon',priceKobo:100000,stock:30,min:1,max:3,available:true}],hours:'09:00–18:00',ingredients:'Rice',allergens:'milk, soy',packagingKobo:20000,allowOffers:true,minimumPercent:85};
 await p.exports.publishDraft(d,'publish');await p.exports.publishDraft({...d,presentation:'video',videoUri:'file:///new.mp4'},'publish');
 assert.equal(p.bodies[0].body.ordering.format,'menu');assert.equal(p.bodies[1].body.ordering.format,'menu');assert.equal(p.bodies[0].body.minimumOfferPercent,85);assert.equal(p.bodies[1].body.posterId,'media_image');assert.equal(p.bodies[1].body.priceKobo,0);assert.equal(p.uploads.length,1);
});
test('editing digital products retains private IDs without a physical ordering plan',()=>{
 const p=publisher(),d=p.exports.productDraft({id:'product',kind:'digital',category:'Kitchen',name:'Template',description:'Complete details',priceKobo:100000,stock:10,media:[],fileIds:['media_private'],files:[{id:'media_private',name:'template.pdf',bytes:100,mimeType:'application/pdf'}],ordering:{format:'single',unit:'licence'},attributes:{}},'seller');
 assert.equal(d.orderingPlan,undefined);assert.equal(d.serverFileIds[0],'media_private');assert.equal(d.digital.files[0].name,'template.pdf');
});
test('editing variants reconstructs options, prices, stock and the offer floor',()=>{
 const p=publisher(),d=p.exports.productDraft({id:'product',kind:'physical',category:'Kitchen',name:'Bowl',description:'Details',priceKobo:100000,stock:10,media:[],variants:[{id:'variant-0',labels:{Size:'Large',Color:'Black'},priceKobo:150000,stock:4,sku:'SKU-1'}],minimumOfferPercent:90,ordering:{format:'single',unit:'piece'},attributes:{}},'seller');
 assert.equal(d.options.find(o=>o.name==='Size').values[0],'Large');assert.equal(d.variants[0].sku,'SKU-1');assert.equal(d.orderingPlan.minimumPercent,90);
});
test('native Google exchange never sends a stale account token',async()=>{
 let header;
 const api=createGleencApi({baseUrl:'https://api.test/api/v2',platform:'ios',getSession:async()=>({accessToken:'old'}),fetchImpl:async(_url,options)=>{header=options.headers.Authorization;return new Response(JSON.stringify({data:{user:{id:'new'}}}));}});
 await api.auth.googleExchange({code:'state',verifier:'proof'});assert.equal(header,undefined);
});
test('a response body cannot commit data after sign-out',async()=>{
 let release;const body=new Promise(resolve=>{release=resolve;});
 const api=createGleencApi({baseUrl:'https://api.test/api/v2',platform:'android',fetchImpl:async url=>String(url).endsWith('/auth/logout')?new Response(JSON.stringify({data:{ok:true}})):{ok:true,status:200,json:()=>body}});
 const pending=api.account.get();await new Promise(resolve=>setImmediate(resolve));await api.auth.logout();release({data:{user:{id:'old-user'}}});await assert.rejects(pending,/sign-in changed/);
});
