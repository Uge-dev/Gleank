import { useState } from 'react';
import { Image,Platform,Pressable,View,ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { GText } from './text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/hooks/use-auth';
import { useLive } from '@/features/live/state';
import { getApiErrorMessage } from '@/services/api-client';
export function GoogleButton({onError}:{onError:(message:string)=>void}) {
 const live=useLive(),{signInWithGoogle}=useAuth(),{colors}=useAppTheme(),router=useRouter(),[busy,setBusy]=useState(false);
 if(!live.capabilities.googleSignInAvailable||Platform.OS==='web')return null;
 return <Pressable accessibilityRole="button" disabled={busy} onPress={()=>{setBusy(true);onError('');void signInWithGoogle().then(session=>router.replace(session.user.profile?.username?'/home':'/edit-profile')).catch(e=>onError(getApiErrorMessage(e))).finally(()=>setBusy(false));}} style={{borderWidth:1,borderColor:colors.border,borderRadius:14,minHeight:52,flexDirection:'row',justifyContent:'center',alignItems:'center',gap:10}}>{busy?<ActivityIndicator color={colors.text}/>:<Image source={require('../../assets/images/google-g.png')} style={{width:22,height:22}}/>}<GText weight="bold">Continue with Google</GText></Pressable>;
}
