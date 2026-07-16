import React from "react";
import { AlertTriangle, LogOut, Wallet } from "lucide-react";
import { Button } from "./Button";
import { auditConfig } from "../config";

export function WalletButton(p: {
  lang: "zh" | "en";
  connected: boolean;
  address: string;
  chainId: number | null;
  onTargetNetwork: boolean;
  targetChainId: number;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const text =
    p.lang === "zh"
      ? { connect: "连接钱包", switch: `切换到 ${auditConfig.chainName}` }
      : { connect: "Connect wallet", switch: `Switch to ${auditConfig.chainName}` };

  if (p.connected && p.onTargetNetwork) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold shadow-sm">
          {p.address.slice(0, 6)}…{p.address.slice(-4)}
          <button className="ml-2 text-slate-500 hover:text-slate-900" onClick={p.onDisconnect} title={p.lang === "zh" ? "断开连接" : "Disconnect"}>
            <LogOut className="inline h-4 w-4" />
          </button>
        </span>
      </div>
    );
  }

  if (p.chainId && !p.onTargetNetwork) {
    return (
      <Button onClick={p.onConnect}>
        <AlertTriangle className="h-4 w-4" />
        {text.switch}
      </Button>
    );
  }

  return (
    <Button onClick={p.onConnect}>
      <Wallet className="h-4 w-4" />
      {text.connect}
    </Button>
  );
}
