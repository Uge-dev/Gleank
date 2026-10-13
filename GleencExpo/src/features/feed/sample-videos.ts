import type { FeedItem } from './data';
// Short H.264 Main / AAC copies of the existing sample footage. Keep stable
// string keys in saved records; native asset IDs can change between builds.
const clips = {
  noodles: require('../../assets/videos/noodles.mp4') as number,
  cake: require('../../assets/videos/cake.mp4') as number,
  shawarma: require('../../assets/videos/shawarma.mp4') as number,
};
export function sampleVideoSource(key?: FeedItem['videoAsset']) { return key ? clips[key] : undefined; }
