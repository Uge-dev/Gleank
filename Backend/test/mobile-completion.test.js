import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import jwt from 'jsonwebtoken';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gleenc-completion-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_PROVIDER:'sqlite',DATABASE_URL:'',DATABASE_PATH:path.join(dir,'test.sqlite'),UPLOADS_PATH:path.join(dir,'uploads'),SHARED_PRIVATE_STORAGE_PATH:path.join(dir,'private'),STORAGE_PROVIDER:'local',JWT_SECRET:'completion-test-secret-at-least-forty-eight-characters',AUTO_VERIFY_AUTH:'true',PAYMENT_PROVIDER:'local',EMAIL_PROVIDER:'brevo-api',BREVO_API_KEY:'test-only',EMAIL_FROM:'test@gleenc.test',SMTP_HOST:'',FRONTEND_URL:'http://localhost:5173',AUTH_LINK_ORIGIN:'http://localhost:4000',APPLE_CLIENT_IDS:'com.gleenc.app',GOOGLE_WEB_CLIENT_ID:'test.apps.googleusercontent.com',GOOGLE_WEB_CLIENT_SECRET:'test-only',GOOGLE_CLIENT_IDS:'test.apps.googleusercontent.com',GOOGLE_OAUTH_REDIRECT_URI:'https://api.test/api/v2/auth/google/callback',TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'test-only',TWILIO_VERIFY_SERVICE_SID:'VA'+'b'.repeat(32),SELLER_TIER_ENFORCEMENT:'true'});
const {app}=await import('../src/app.js');
const {db}=await import('../src/db/database.js');
const {env}=await import('../src/config/env.js');
const {TERMS_VERSION,hash}=await import('../src/shared/core.js');
const {walletChange}=await import('../src/shared/checkout.js');
const {createSession,adminSessionCookieName}=await import('../src/lib/session.js');
const identities={},sessions={},data={};
const call=(who,method,path,body,key)=>{const q=request(app)[method]('/api/v2'+path);if(sessions[who])q.set('Authorization','Bearer '+sessions[who].accessToken);if(body)q.send(body);if(key)q.set('Idempotency-Key',key);return q;};
const ok=async q=>{const r=await q;assert.equal(r.status,200,JSON.stringify(r.body));return r.body.data;};
const originalFetch=globalThis.fetch;let phoneStatus='approved',phoneRequests=[],emails=[],googleNonce='';
const rsa=crypto.generateKeyPairSync('rsa',{modulusLength:2048});const jwk={...rsa.publicKey.export({format:'jwk'}),kid:'completion-key',alg:'RS256',use:'sig'};
globalThis.fetch=async(url,options)=>{
 if(String(url).startsWith('https://verify.twilio.com/')){phoneRequests.push({url:String(url),body:String(options.body)});return new Response(JSON.stringify({status:phoneStatus}),{status:200});}
 if(String(url)==='https://api.brevo.com/v3/smtp/email'){emails.push(JSON.parse(options.body));return new Response(JSON.stringify({messageId:'test-message'}),{status:201});}
 if(String(url)==='https://oauth2.googleapis.com/token'){const token=jwt.sign({sub:'google-completion',email:'google@completion.test',email_verified:true,nonce:googleNonce},rsa.privateKey,{algorithm:'RS256',keyid:'completion-key',issuer:'https://accounts.google.com',audience:'test.apps.googleusercontent.com',expiresIn:300});return new Response(JSON.stringify({id_token:token}),{status:200});}
 if(String(url)==='https://appleid.apple.com/auth/keys')return new Response(JSON.stringify({keys:[jwk]}),{status:200});
 if(String(url)==='https://www.googleapis.com/oauth2/v3/certs')return new Response(JSON.stringify({keys:[jwk]}),{status:200});
 throw new Error('Unexpected external request: '+url);
};
test('accounts, profile usernames, policies and tier-zero restrictions use real API records',async()=>{
 for(const who of ['seller','buyer','other','admin']){const r=await ok(call(null,'post','/auth/register',{name:'Test '+who,email:who+'@completion.test',password:'StrongPassword123!',client:'mobile'}));identities[who]=r.user.id;sessions[who]=r.session;await ok(call(who,'post','/me/terms',{version:TERMS_VERSION}));}
 for(const who of ['seller','buyer'])await ok(call(who,'patch','/me/profile',{profile:{name:'Test '+who,username:'completion'+who,country:'Nigeria',state:'Delta',city:'Warri',activities:who==='seller'?['selling']:[]}}));
 const duplicate=await call('other','patch','/me/profile',{profile:{name:'Other',username:'completionseller',country:'Nigeria',state:'Delta',city:'Warri'}});assert.equal(duplicate.status,409);
 assert.equal((await ok(call('seller','get','/me'))).user.profile.username,'completionseller');
 const policy=await ok(call(null,'get','/legal/privacy'));assert.equal(policy.version,TERMS_VERSION);assert(policy.sections.some(s=>s[0]==='Your choices and rights'));
 const landing=await request(app).get('/api/v2/auth/verification-link?token='+'A'.repeat(43));assert.equal(landing.status,200);assert.match(landing.text,/gleencexpo:\/\/verify-email/);assert.equal(landing.headers['referrer-policy'],'no-referrer');
 await ok(call('seller','put','/me/selling',{name:'Completion store',coverage:'Delta',deliveryFee:0,deliveryDays:2,dispatchAddress:'5 Test Road',phone:'08012345678'}));
 assert.equal((await ok(call('seller','get','/me/verification'))).tier,0);
});
test('phone verification rejects incorrect codes and records provider-verified phone only',async()=>{
 await ok(call('seller','post','/me/phone/request',{phone:'+2348012345678'}));phoneStatus='pending';assert.equal((await call('seller','post','/me/phone/confirm',{code:'111111'})).status,422);assert.equal(db.prepare('SELECT phone_verified FROM users WHERE id=?').get(identities.seller).phone_verified,0);
 phoneStatus='approved';await ok(call('seller','post','/me/phone/confirm',{code:'123456'}));assert.equal((await ok(call('seller','get','/me/verification'))).tier,1);assert(phoneRequests[0].body.includes('Channel=sms'));
 const incomplete=await call('buyer','post','/me/verification',{tier:2,legalName:'Buyer',documentType:'passport',documentIds:['wrong'],address:'5 Test Road'});assert.equal(incomplete.status,422);
});
test('scanned owner media, tier-one publication limits and variant bounds are enforced',async()=>{
 const png=await sharp({create:{width:12,height:12,channels:3,background:'#eeeeee'}}).png().toBuffer();
 const upload=await request(app).post('/api/v2/media').set('Authorization','Bearer '+sessions.seller.accessToken).field('kind','image').attach('file',png,'product.png');assert.equal(upload.status,200);data.media=upload.body.data.id;
 db.prepare("UPDATE stores SET verified=1,verification_status='verified' WHERE owner_id=?").run(identities.seller);
 const base={name:'Completion bowl',description:'A real test product',category:'Kitchen',priceKobo:500000,stock:20,mediaIds:[data.media],publication:'publish'};
 data.product=await ok(call('seller','post','/products',base));data.post=(await ok(call(null,'get','/feed'))).posts.find(p=>p.product.id===data.product.id).id;
 const high=await call('seller','post','/products',{...base,priceKobo:10000001});assert.equal(high.status,403);
 const variant=await call('seller','post','/products',{...base,variants:[{id:'large',priceKobo:10000001,stock:2}]});assert.equal(variant.status,403);
 assert.equal((await call('seller','post','/me/verification',{tier:3,legalName:'Seller',documentType:'passport',documentIds:['wrong'],address:'5 Test Road'})).status,422);
});
test('verification evidence is owner-scoped and admin review cannot be self-approved',async()=>{
 const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
 const upload=await request(app).post('/api/v2/media').set('Authorization','Bearer '+sessions.seller.accessToken).field('kind','document').attach('file',pdf,'identity.pdf');assert.equal(upload.status,200);data.evidence=upload.body.data.id;
 const body={tier:2,legalName:'Test seller',documentType:'passport',documentIds:[data.evidence],address:'5 Test Road'};
 const status=await ok(call('seller','post','/me/verification',body));assert.equal(status.status,'under_review');assert.equal(status.tier,1);
 assert.equal((await call('buyer','get','/media/'+data.evidence+'/private')).status,404);
 assert.equal((await call('seller','post','/admin/verifications/'+identities.seller+'/review',{decision:'approve',payoutOwnershipConfirmed:true})).status,403);
 db.prepare("UPDATE users SET role='admin' WHERE id=?").run(identities.admin);const adminSession=createSession(identities.admin);const cookie=adminSessionCookieName+'='+adminSession.token;
 const missing=await request(app).post('/api/v2/admin/verifications/'+identities.seller+'/review').set('Cookie',cookie).set('Origin','http://localhost:5173').send({decision:'approve'});assert.equal(missing.status,422);
 const approved=await request(app).post('/api/v2/admin/verifications/'+identities.seller+'/review').set('Cookie',cookie).set('Origin','http://localhost:5173').send({decision:'approve',payoutOwnershipConfirmed:true});assert.equal(approved.status,200,JSON.stringify(approved.body));assert.equal(approved.body.data.tier,2);
});
test('follow, likes, saved products, comments and grouped menu quantities retain server truth',async()=>{
 await ok(call('buyer','post','/people/'+identities.seller+'/follow',{}));assert.equal((await ok(call('buyer','get','/people/'+identities.seller))).followed,true);
 const feed=await ok(call('buyer','get','/feed?mode=following'));assert.equal(feed.posts.length,1);assert.equal(feed.posts[0].author.followed,true);
 await ok(call('buyer','post','/products/'+data.product.id+'/like',{}));await ok(call('buyer','put','/saved/'+data.product.id,{}));assert.equal((await ok(call('buyer','get','/saved')))[0].id,data.product.id);
 const comment=await ok(call('buyer','post','/products/'+data.product.id+'/comments',{body:'A real comment'}));assert.equal((await ok(call(null,'get','/products/'+data.product.id+'/comments')))[0].user.id,identities.buyer);
 const notifications=await ok(call('seller','get','/notifications'));assert(notifications.notifications.some(n=>n.kind==='like'&&n.unread));
 const menu=await ok(call('seller','post','/products',{name:'Lunch menu',description:'Choose meal units',category:'Food',priceKobo:0,stock:20,mediaIds:[data.media],publication:'publish',ordering:{format:'menu',groups:[{name:'Rice',min:1,max:2}],components:[{id:'rice',name:'Rice',group:'Rice',unit:'spoon',priceKobo:100000,stock:100,min:0,max:5}]}}));
 assert.equal((await call('buyer','post','/quote',{productId:menu.id,components:[{id:'rice',quantity:3}]})).status,422);
 assert.equal((await ok(call('buyer','post','/quote',{productId:menu.id,components:[{id:'rice',quantity:2}]}))).sellerKobo,200000);
});
test('offer previews have no side effects, accepted offers preserve exact selections, and 20% caps hold',async()=>{
 const preview=await ok(call('buyer','post','/offers/preview',{productId:data.product.id,discountPercent:20}));assert.equal(preview.sellerKobo,400000);assert.equal(db.prepare('SELECT COUNT(*) n FROM shared_offers').get().n,0);
 assert.equal((await call('buyer','post','/offers',{productId:data.product.id,discountPercent:21})).status,422);
 const offer=await ok(call('buyer','post','/offers',{productId:data.product.id,discountPercent:20}));await ok(call('seller','post','/offers/'+offer.id+'/answer',{decision:'accept'}));
 const owned=await ok(call('buyer','get','/offers/'+offer.id));assert.equal(owned.status,'accepted');assert.equal((await call('other','get','/offers/'+offer.id)).status,404);
 const accepted=await ok(call('buyer','post','/quote',{productId:data.product.id,offerId:offer.id}));assert.equal(accepted.sellerKobo,400000);
 const reshare=await ok(call('buyer','post','/posts/'+data.post+'/reshare',{markupPercent:20}));assert.equal(reshare.markupPercent,20);assert.equal((await call('buyer','post','/posts/'+data.post+'/reshare',{markupPercent:21})).status,422);
});
test('selected cart checkout, wallet escrow and order-only receipts remain authoritative',async()=>{
 const cart=await ok(call('buyer','post','/cart',{productId:data.product.id}));
 walletChange(identities.buyer,'available',2000000,'test-funding');
 const checkout=await ok(call('buyer','post','/checkouts',{cartLineIds:[cart.lineId],method:'wallet',address:{name:'Buyer',phone:'08012345678',address:'12 Test Road',city:'Warri',state:'Delta',country:'Nigeria'}},'completion-checkout-key'));
 const again=await ok(call('buyer','post','/checkouts',{cartLineIds:[cart.lineId],method:'wallet',address:{name:'Buyer',phone:'08012345678',address:'12 Test Road',city:'Warri',state:'Delta',country:'Nigeria'}},'completion-checkout-key'));assert.equal(again.id,checkout.id);
 assert.equal((await ok(call('buyer','post','/checkouts/'+checkout.id+'/pay',{}))).status,'paid');
 assert.equal((await ok(call('buyer','get','/me/checkouts')))[0].id,checkout.id);const orders=await ok(call('buyer','get','/orders'));assert.equal(orders.length,1);
 assert.equal((await call('other','get','/orders/'+orders[0].id+'/receipt')).status,404);assert.equal((await ok(call('buyer','get','/orders/'+orders[0].id+'/receipt'))).amountKobo,checkout.amountKobo);
 assert((await ok(call('seller','get','/wallet'))).heldKobo>0);
});
test('chat sends once, acknowledges real reads and preserves independent settings',async()=>{
 const c=await ok(call('buyer','post','/conversations',{userId:identities.seller}));const first=await ok(call('buyer','post','/conversations/'+c.id+'/messages',{body:'Hello seller'},'completion-message-key'));const second=await ok(call('buyer','post','/conversations/'+c.id+'/messages',{body:'Hello seller'},'completion-message-key'));assert.equal(first.id,second.id);
 await ok(call('seller','post','/conversations/'+c.id+'/ack',{messageIds:[first.id],status:'read'}));const messages=await ok(call('buyer','get','/conversations/'+c.id+'/messages'));assert.equal(messages.messages.find(m=>m.id===first.id).status,'read');
 await ok(call('buyer','put','/conversations/'+c.id+'/settings',{pinned:true}));await ok(call('buyer','put','/conversations/'+c.id+'/settings',{muted:true}));const chat=(await ok(call('buyer','get','/conversations'))).find(x=>x.id===c.id);assert(chat.pinned&&chat.muted);
 assert.equal((await call('other','get','/conversations/'+c.id+'/messages')).status,404);
});
test('email verification links do not approve accounts on GET and delivery is real-provider-backed',async()=>{
 env.autoVerifyAuth=false;
 const registered=await ok(call(null,'post','/auth/register',{name:'Unverified user',email:'unverified@completion.test',password:'StrongPassword123!',client:'mobile'}));assert.equal(registered.emailVerificationRequired,true);assert.equal(registered.user.emailVerified,false);
 await new Promise(resolve=>setImmediate(resolve));assert(emails.length>0);const match=emails.at(-1).textContent.match(/token=([A-Za-z0-9_-]+)/);assert(match);
 await request(app).get('/api/v2/auth/verification-link?token='+match[1]).expect(200);assert.equal(db.prepare('SELECT email_verified FROM users WHERE id=?').get(registered.user.id).email_verified,0);
 await request(app).post('/api/auth/verify-email').send({token:match[1]}).expect(200);assert.equal(db.prepare('SELECT email_verified FROM users WHERE id=?').get(registered.user.id).email_verified,1);env.autoVerifyAuth=true;
});
test('Google callback requires state, issuer/audience/nonce and device-bound single-use exchange',async()=>{
 const verifier='c'.repeat(64);const start=await ok(call(null,'post','/auth/google/start',{verifierHash:hash(verifier)}));const url=new URL(start.url),state=url.searchParams.get('state');googleNonce=url.searchParams.get('nonce');
 assert.equal((await request(app).get('/api/v2/auth/google/callback?state=invalid&code=example')).status,422);
 const callback=await request(app).get('/api/v2/auth/google/callback?state='+state+'&code=example');assert.equal(callback.status,302);assert.match(callback.headers.location,/gleencexpo:\/\/oauth\?code=/);
 assert.equal((await call(null,'post','/auth/google/exchange',{code:state,verifier:'d'.repeat(64),client:'mobile'})).status,401);
 const exchanged=await ok(call(null,'post','/auth/google/exchange',{code:state,verifier,client:'mobile'}));assert.equal(exchanged.user.email,'google@completion.test');assert(exchanged.session.refreshToken);
 assert.equal((await call(null,'post','/auth/google/exchange',{code:state,verifier,client:'mobile'})).status,401);
 assert.equal((await call('buyer','post','/auth/google/start',{verifierHash:hash(verifier),link:true,password:'wrong'})).status,401);
});
test('address editing, readable policies and block controls preserve ownership',async()=>{
 const address=await ok(call('buyer','post','/me/addresses',{label:'Home',name:'Buyer',phone:'08012345678',address:'12 Test Road',city:'Warri',state:'Delta',country:'Nigeria'}));
 const updated=await ok(call('buyer','put','/me/addresses/'+address.id,{label:'Work',name:'Buyer',phone:'08012345678',address:'15 Office Road',city:'Warri',state:'Delta',country:'Nigeria'}));assert.equal(updated.label,'Work');
 assert.equal((await call('other','put','/me/addresses/'+address.id,{label:'Other',name:'Other',phone:'08012345678',address:'20 Test Road',city:'Warri',state:'Delta',country:'Nigeria'})).status,404);
 const html=await request(app).get('/api/v2/legal/privacy/page');assert.equal(html.status,200);assert.match(html.text,/Privacy Policy/);assert.match(html.headers['content-security-policy'],/frame-ancestors 'none'/);
 await ok(call('buyer','put','/me/blocks/'+identities.other,{}));const blocked=await ok(call('buyer','get','/me/blocks'));assert.equal(blocked[0].name,'Test other');await ok(call('buyer','delete','/me/blocks/'+identities.other));
});
test('chat edit, reactions and hide are participant-scoped and server-persisted',async()=>{
 const c=await ok(call('buyer','post','/conversations',{userId:identities.seller})),message=await ok(call('buyer','post','/conversations/'+c.id+'/messages',{body:'Original text'},'completion-edit-message'));
 const route='/conversations/'+c.id+'/messages/'+message.id;
 assert.equal((await call('seller','patch',route,{action:'edit',body:'Not the owner'})).status,403);
 await ok(call('buyer','patch',route,{action:'edit',body:'Updated text'}));await ok(call('seller','patch',route,{action:'react',emoji:'👍'}));
 const messages=await ok(call('buyer','get','/conversations/'+c.id+'/messages'));const view=messages.messages.find(m=>m.id===message.id);assert.equal(view.body,'Updated text');assert.equal(view.reactions[0].emoji,'👍');
 await ok(call('seller','patch',route,{action:'hide'}));assert(!(await ok(call('seller','get','/conversations/'+c.id+'/messages'))).messages.some(m=>m.id===message.id));assert((await ok(call('buyer','get','/conversations/'+c.id+'/messages'))).messages.some(m=>m.id===message.id));
});
test('Apple sign-in validates the hashed nonce, audience and one-time challenge',async()=>{
 const challenge=await ok(call(null,'post','/auth/challenge',{}));
 const token=jwt.sign({sub:'apple-completion',email:'apple@completion.test',email_verified:true,nonce:challenge.appleNonce},rsa.privateKey,{algorithm:'RS256',keyid:'completion-key',issuer:'https://appleid.apple.com',audience:'com.gleenc.app',expiresIn:300});
 const body={provider:'apple',idToken:token,challengeId:challenge.id,nonce:challenge.nonce,name:'Apple buyer',client:'mobile'};
 const account=await ok(call(null,'post','/auth/identity',body));assert.equal(account.user.email,'apple@completion.test');assert(account.session.refreshToken);const {signInIdentity}=await import('../src/shared/identity.js');await assert.rejects(()=>signInIdentity(body),error=>error.status===401);
});
test.after(()=>{globalThis.fetch=originalFetch;});
