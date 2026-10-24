import { Home, Radio, MessageCircle, WalletCards, Menu } from 'lucide-react';
export type MainTab='dashboard'|'live'|'assistant'|'money'|'settings';
export default function NyxBottomNav({active,onChange}:{active:MainTab;onChange:(tab:MainTab)=>void}){
 const entries=[{tab:'dashboard',label:'Home',icon:Home},{tab:'live',label:'Live',icon:Radio},{tab:'assistant',label:'Chat',icon:MessageCircle},{tab:'money',label:'Money',icon:WalletCards},{tab:'settings',label:'More',icon:Menu}] as const;
 return <nav className="nx31-bottom" aria-label="Mobile main navigation">{entries.map(i=><button key={i.tab} className={active===i.tab?'active':''} onClick={()=>onChange(i.tab)}><i.icon size={21}/><span>{i.label}</span></button>)}</nav>;
}