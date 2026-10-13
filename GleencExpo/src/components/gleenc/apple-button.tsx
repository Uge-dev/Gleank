import { useEffect,useState } from 'react';
import { Platform,View,ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/use-auth';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useLive } from '@/features/live/state';
import { getApiErrorMessage } from '@/services/api-client';
export function AppleButton({onError}:{onError:(message:string)=>void}){
 const [Apple,setApple]=useState<typeof import('expo-apple-authentication')>(),[busy,setBusy]=useState(false),{signInWithApple}=useAuth(),{colors,isDark}=useAppTheme(),live=useLive(),router=useRouter();
 useEffect(()=>{let active=true;if(Platform.OS==='ios'&&live.capabilities.appleSignInAvailable){try{const module:typeof import('expo-apple-authentication')=require('expo-apple-authentication');void module.isAvailableAsync().then(available=>{if(active&&available)setApple(module);}).catch(()=>undefined);}catch{}}return()=>{active=false;};},[live.capabilities.appleSignInAvailable]);
 if(!Apple)return null;
 return <View>{busy?<ActivityIndicator color={colors.text}/>:<Apple.AppleAuthenticationButton buttonType={Apple.AppleAuthenticationButtonType.CONTINUE} buttonStyle={isDark?Apple.AppleAuthenticationButtonStyle.WHITE:Apple.AppleAuthenticationButtonStyle.BLACK} cornerRadius={14} style={{height:52,width:'100%'}} onPress={()=>{if(busy)return;setBusy(true);onError('');void signInWithApple().then(session=>router.replace(session.user.profile?.username?'/home':'/edit-profile')).catch(e=>onError(getApiErrorMessage(e))).finally(()=>setBusy(false));}}/>}</View>;
}
