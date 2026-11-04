import { Platform } from 'react-native';
import { WEB_URL } from './config';
export const linkFor = (path: string) => (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : WEB_URL) + path;
