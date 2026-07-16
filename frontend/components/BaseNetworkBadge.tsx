import React from "react";

/** 这里只显示钱包连接状态；真实签名前仍由 chainId 与合约字节码检查决定是否放行。 */
export function BaseNetworkBadge({ connected }: { connected: boolean }) {
  return (
    <div
      className={`flex h-10 shrink-0 items-center gap-2.5 rounded-xl border bg-white px-3 text-sm font-bold shadow-sm ${connected ? "border-emerald-200 text-emerald-700" : "border-red-200 text-red-700"}`}
      title={connected ? "Connected to Base Sepolia" : "Base Sepolia not connected"}
      aria-label={connected ? "Connected to Base Sepolia" : "Base Sepolia not connected"}
    >
      <span className={`h-3 w-3 rounded-full ${connected ? "bg-emerald-400" : "bg-red-500"}`} aria-hidden="true" />
      <span aria-hidden="true">Base</span>
    </div>
  );
}
