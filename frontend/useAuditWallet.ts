import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, type JsonRpcSigner } from "ethers";
import { auditConfig } from "./config";

type Eth = { request(a:{method:string;params?:unknown[]}):Promise<unknown>; on?(e:string,cb:(...a:unknown[])=>void):void; removeListener?(e:string,cb:(...a:unknown[])=>void):void };
const eth = () => (window as unknown as {ethereum?:Eth}).ethereum;
const chain = { chainId:"0x14a34", chainName:"Base Sepolia", nativeCurrency:{name:"Ether",symbol:"ETH",decimals:18}, rpcUrls:[auditConfig.rpcUrl], blockExplorerUrls:[auditConfig.explorer] };

export function useAuditWallet() {
  const [signer,setSigner]=useState<JsonRpcSigner|null>(null);
  const [address,setAddress]=useState("");
  const [chainId,setChainId]=useState<number|null>(null);
  const sync=useCallback(async()=>{ const e=eth(); if(!e)return; const p=new BrowserProvider(e as never); const n=await p.getNetwork(); setChainId(Number(n.chainId)); if(Number(n.chainId)===auditConfig.chainId){ try{const s=await p.getSigner();setSigner(s);setAddress(await s.getAddress());}catch{setSigner(null);setAddress("");} }else{setSigner(null);setAddress("");}},[]);
  useEffect(()=>{const e=eth();if(!e)return;void sync();const cb=()=>void sync();e.on?.("accountsChanged",cb);e.on?.("chainChanged",cb);return()=>{e.removeListener?.("accountsChanged",cb);e.removeListener?.("chainChanged",cb);};},[sync]);
  const connectWallet=useCallback(async()=>{const e=eth();if(!e){window.open("https://metamask.io/download/","_blank");return;}await e.request({method:"eth_requestAccounts"});try{await e.request({method:"wallet_switchEthereumChain",params:[{chainId:chain.chainId}]});}catch(err){if((err as {code?:number}).code===4902)await e.request({method:"wallet_addEthereumChain",params:[chain]});}await sync();},[sync]);
  return {signer,address,chainId,connected:Boolean(signer),onTargetNetwork:chainId===auditConfig.chainId,targetChainId:auditConfig.chainId,connectWallet,disconnectWallet:()=>{setSigner(null);setAddress("");}};
}
