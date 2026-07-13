import React from "react";
import { AlertTriangle, LogOut, Wallet } from "lucide-react";
import { Button } from "./Button";

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
      ? { connect: "连接钱包", switch: "切换到 Base Sepolia" }
      : { connect: "Connect wallet", switch: "Switch to Base Sepolia" };

  if (p.connected && p.onTargetNetwork) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-emerald-700 sm:inline">Base Sepolia</span>
        <span className="rounded-lg border px-3 py-2 text-xs">
          {p.address.slice(0, 6)}…{p.address.slice(-4)}
          <button onClick={p.onDisconnect} title={p.lang === "zh" ? "断开连接" : "Disconnect"}>
            <LogOut className="ml-1 inline h-3 w-3" />
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
