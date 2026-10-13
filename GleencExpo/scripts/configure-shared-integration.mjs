// Run from the GleencExpo root. Only merges permissions/plugins in app.json.
import fs from 'node:fs';
if(fs.existsSync('app.config.ts')||fs.existsSync('app.config.js'))throw new Error('This project has a dynamic app config. Merge the plugin settings from this script into that config instead.');
const file='app.json',config=JSON.parse(fs.readFileSync(file,'utf8'));
if(!config.expo)throw new Error('app.json must contain an expo object.');
const plugins=config.expo.plugins||[],names=new Set(plugins.map(p=>Array.isArray(p)?p[0]:p));
const additions=[
 'expo-apple-authentication','expo-video','expo-font','expo-asset','expo-secure-store','expo-sharing','expo-web-browser','@react-native-community/datetimepicker',
 ['expo-image-picker',{photosPermission:'Allow Gleenc to select photos and videos for product posts, reviews, messages and profile images.',cameraPermission:'Allow Gleenc to take product and profile photos.',microphonePermission:'Allow Gleenc to record audio for videos and voice messages.'}],
 ['expo-camera',{cameraPermission:'Allow Gleenc to scan delivery confirmation QR codes.',recordAudioAndroid:false}],
 ['expo-audio',{microphonePermission:'Allow Gleenc to record voice messages.',recordAudioAndroid:true,enableBackgroundRecording:false,enableBackgroundPlayback:false}],
 ['expo-notifications',{defaultChannel:'activity'}],
];
for(const plugin of additions){const name=Array.isArray(plugin)?plugin[0]:plugin;if(!names.has(name)){plugins.push(plugin);names.add(name);}}
config.expo.plugins=plugins;
config.expo.userInterfaceStyle='automatic';
config.expo.ios={...config.expo.ios,usesAppleSignIn:true};
if(config.expo.scheme!=='gleencexpo')throw new Error('The authentication callback expects gleencexpo. Keep the current scheme and update src/shared/google-flow.js plus mobile OAuth routing together if a different scheme is intentional.');
fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n');
console.log('Merged missing integration plugins. Existing icons, Google settings, EAS project, IDs and plugins were preserved. Rebuild the development client if the native config changed.');
