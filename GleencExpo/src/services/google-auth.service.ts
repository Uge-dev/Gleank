import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { api } from './api';
/** Browser-based OIDC keeps the client secret on the backend and binds the return code to this device. */
export async function requestGoogleCredential(link=false,password?:string) {
 if(Platform.OS==='web')throw new Error('Use the website’s configured Google sign-in flow.');
 if(link)await api.account.get();
 const verifier=Array.from(Crypto.getRandomBytes(32)).map(v=>v.toString(16).padStart(2,'0')).join('');
 const verifierHash=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,verifier);
 const start=await api.request<{url:string;returnUrl:string}>('/auth/google/start',{method:'POST',body:{verifierHash,link,...(password?{password}:{})}});
 if(start.returnUrl!=='gleencexpo://oauth'||!start.url.startsWith('https://accounts.google.com/'))throw new Error('Invalid sign-in address.');
 const result=await WebBrowser.openAuthSessionAsync(start.url,start.returnUrl);
 if(result.type!=='success')throw new Error('Google sign-in was cancelled.');
 const url=new URL(result.url);if(url.protocol!=='gleencexpo:'||url.hostname!=='oauth')throw new Error('Invalid sign-in response.');
 const code=url.searchParams.get('code');if(!code)throw new Error('Google sign-in could not be verified. Use email sign-in or try again.');
 return {code,verifier};
}
