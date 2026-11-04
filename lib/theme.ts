import { useColorScheme } from 'react-native';

const light = { bg: '#EDF2EE', surface: '#FFFFFF', surface2: '#E3EBE6', ink: '#10302C', muted: '#566D68', line: '#D3DED8', brand: '#0A6B5E', brandInk: '#FFFFFF', sun: '#FFC02E', sunInk: '#3A2A00', mine: '#FFEBB5', foro: '#C8451F', grupo: '#0A6B5E', canal: '#3B4CB8', news: '#B3261E', onIcon: '#FFFFFF', shade: 'rgba(16,48,44,.45)' };
const dark = { bg: '#0E1A19', surface: '#152523', surface2: '#1E322F', ink: '#E6F0EC', muted: '#9DB3AD', line: '#2A403C', brand: '#3CC2AC', brandInk: '#06211D', sun: '#FFC94D', sunInk: '#2C2000', mine: '#40350F', foro: '#FF8A63', grupo: '#3CC2AC', canal: '#A3B0FF', news: '#FF8A80', onIcon: '#0E1A19', shade: 'rgba(0,0,0,.6)' };
export type Theme = typeof light;
export const useT = (): Theme => (useColorScheme() === 'dark' ? dark : light);
export const F = { display: 'BricolageGrotesque_800ExtraBold', body: 'Figtree_400Regular', semi: 'Figtree_600SemiBold', bold: 'Figtree_700Bold' };
