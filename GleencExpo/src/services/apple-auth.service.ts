import { Platform } from 'react-native';
import { api } from './api';
export async function requestAppleCredential(){
 if(Platform.OS!=='ios')throw new Error('Apple sign-in is available on iOS.');
 const Apple:typeof import('expo-apple-authentication')=require('expo-apple-authentication');
 if(!(await Apple.isAvailableAsync()))throw new Error('Apple sign-in is unavailable on this device.');
 const challenge=await api.auth.challenge();
 const credential=await Apple.signInAsync({requestedScopes:[Apple.AppleAuthenticationScope.FULL_NAME,Apple.AppleAuthenticationScope.EMAIL],nonce:challenge.appleNonce,state:challenge.id});
 if(credential.state!==challenge.id||!credential.identityToken)throw new Error('Apple sign-in could not be verified.');
 const name=credential.fullName?[credential.fullName.givenName,credential.fullName.familyName].filter(Boolean).join(' '):undefined;
 return {provider:'apple' as const,idToken:credential.identityToken,challengeId:challenge.id,nonce:challenge.nonce,...(name?{name}:{})};
}
