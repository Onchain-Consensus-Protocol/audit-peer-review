import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { Contract, JsonRpcProvider, formatUnits, getAddress, keccak256, parseUnits, type EventLog, type JsonRpcSigner, type Provider } from "ethers";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import "./index.css";
import { Button } from "./components/Button";
import { BaseNetworkBadge } from "./components/BaseNetworkBadge";
import { LanguageToggle } from "./components/LanguageToggle";
import { OCPHeaderBrand } from "./components/OCPHeaderBrand";
import { WalletButton } from "./components/WalletButton";
import { auditConfig, ERC20_ABI, FACTORY_ABI, VAULT_ABI } from "./config";
import { sha256Hex } from "./pdfAudit";
import { useAuditWallet } from "./useAuditWallet";

type Lang = "en" | "zh";
type Review = { reviewer: string; side: number; review: string; hash: string; tx: string; block: number; duplicateCount: number; stake: bigint };

const names = ["YES", "NO", "INVALID"];
const byteLength = (v: string) => new TextEncoder().encode(v).length;
const shortHash = (v: string) => `${v.slice(0, 10)}…${v.slice(-8)}`;
const findingTitle = (v: string) => {
  const line = (v || "").split(/\r?\n/).map((x) => x.trim()).find(Boolean) || "Audit finding";
  const clean = line.replace(/[*`#_]/g, "").replace(/\s+/g, " ");
  return clean.length > 180 ? `${clean.slice(0, 177)}...` : clean;
};

async function assertTrustedVaultForSigning(signer: JsonRpcSigner, vaultAddress: string) {
  const provider = signer.provider;
  const factoryAddress = getAddress(auditConfig.factoryAddress);
  const tokenAddress = getAddress(auditConfig.usdcAddress);
  const trustedVaultAddress = getAddress(vaultAddress);

  /*
   * 安全边界：页面展示可以使用配置的只读 RPC，但授权和交易前的判断必须重新从
   * 钱包 provider 读取。钱包 provider 才是用户即将签名并广播交易的那条链，不能
   * 信任先前页面状态或另一个 RPC 返回的 isVault/factory/token 数据。
   *
   * 这相当于在签名前执行链下 modifier：链、Factory、Vault 字节码、注册关系、
   * 官方 Token、Vault immutable 和协议版本必须同时匹配；任何一项失败都不得 approve。
   */
  const [network, factoryCode, vaultCode, tokenCode] = await Promise.all([
    provider.getNetwork(),
    provider.getCode(factoryAddress),
    provider.getCode(trustedVaultAddress),
    provider.getCode(tokenAddress),
  ]);
  if (Number(network.chainId) !== auditConfig.chainId) throw new Error("Wallet is connected to the wrong network.");
  if (factoryCode === "0x" || vaultCode === "0x" || tokenCode === "0x") throw new Error("Wallet-side contract code verification failed.");
  if (!/^0x[0-9a-f]{64}$/i.test(auditConfig.factoryCodeHash) || keccak256(factoryCode).toLowerCase() !== auditConfig.factoryCodeHash.toLowerCase()) {
    throw new Error("Factory runtime code does not match the published deployment manifest.");
  }

  const factory = new Contract(factoryAddress, FACTORY_ABI, provider);
  const vault = new Contract(trustedVaultAddress, VAULT_ABI, provider);
  const [isRegistered, officialToken, reportedFactory, reportedToken, version, factoryVersion, meta] = await Promise.all([
    factory.isVault(trustedVaultAddress),
    factory.officialStakeToken(),
    vault.factory(),
    vault.stakeToken(),
    vault.auditReviewVersion(),
    factory.auditReviewFactoryVersion(),
    factory.getDisputeMeta(trustedVaultAddress),
  ]);

  if (
    !isRegistered
    || getAddress(String(officialToken)) !== tokenAddress
    || getAddress(String(reportedFactory)) !== factoryAddress
    || getAddress(String(reportedToken)) !== tokenAddress
    || BigInt(version) !== 2n
    || BigInt(factoryVersion) !== 2n
    || BigInt(await factory.minStake()) !== auditConfig.minStake
    || BigInt(await factory.minCreatorNoStake()) !== auditConfig.minCreatorNoStake
  ) {
    throw new Error("Wallet-side Vault verification failed. No transaction was sent.");
  }
  return { vault, meta };
}

const copy = {
  en: {
    sourceAudit: "Source audit",
    deadline: "Deadline",
    creator: "Creator",
    showFinding: "View full finding",
    hideFinding: "Hide full finding",
    distribution: "Vault distribution",
    totalPrincipal: "Total principal",
    sideMeanings: ["Capital supports the Finding", "Capital opposes the Finding", "No strict capital majority"],
    capitalNotice: "This is a capital-weighted public signal, not a technical audit verdict. One USDC equals one unit of voting weight; any non-winning side, including INVALID, can lose its full real-USDC principal.",
    riskConfirm: "I understand this uses real USDC; any non-winning side, including INVALID, can lose 100%. My side is permanently locked, there is no early exit, and large capital can reverse the result before the deadline.",
    auditMatch: "Report bytes match the onchain SHA-256 commitment.",
    auditMismatch: "Report bytes do not match the onchain SHA-256 commitment. Staking is blocked.",
    auditUnavailable: "The report could not be verified automatically. Select the same local report to compare its bytes.",
    provisionalOutcome: "Provisional outcome (not finalized)",
    finalOutcome: "Final outcome",
    rule:
      "Resolution rule: YES or NO wins only when that side is strictly above 50% of total principal. The winning side shares the losing-side funds pro rata by stake.",
    invalidNote:
      "INVALID is both an active position and the fallback outcome. If neither YES nor NO is strictly above 50%, the Vault resolves INVALID and every participant recovers the settlement pool pro rata by principal.",
    addressStake: "Address stake",
    addStake: (side: string) => `Add ${side} stake`,
    submitStake: "Submit Review + Stake",
    reviewPlaceholder: "200-4096 bytes of verifiable review reasoning",
    approveSubmit: "Approve + Submit",
    finalize: "Finalize",
    withdraw: (outcome: string) => `Withdraw · Outcome ${outcome}`,
    peerReviews: "Onchain Peer Reviews",
    loadingReviews: "Reading onchain reviews…",
    noReviews: "No reviews yet",
    reviewLoadError: "Review events were not fully loaded:",
    viewTx: "View transaction",
    hash: "Review hash",
    duplicate: (n: number) => `Same review ×${n}`,
    addressNotIdentity: "Addresses are not identities. Review count is not an independent-expert count.",
    concentration: (address: string, pct: number) => `Largest address ${address}: ${pct}% of total principal`,
    loadMore: "Load more reviews",
    errors: {
      notVault: "This address was not created by the current Audit Factory.",
      badVault: "Vault parameter check failed.",
      noUsdc: "Insufficient USDC balance.",
    },
  },
  zh: {
    sourceAudit: "原始审计",
    deadline: "截止",
    creator: "创建者",
    showFinding: "查看完整 Finding",
    hideFinding: "收起完整 Finding",
    distribution: "Vault 质押分布",
    totalPrincipal: "总本金",
    sideMeanings: ["资金支持该 Finding", "资金反对该 Finding", "资金未形成严格多数"],
    capitalNotice: "这是资金加权的公开信号，不是技术审计结论。1 USDC 等于一单位权重，任何非获胜方向（包括 INVALID）的真实 USDC 本金都可能全部损失。",
    riskConfirm: "我理解这里使用真实 USDC；任何非获胜方向（包括 INVALID）都可能损失 100%。方向永久锁定、不能提前退出，截止前大额资金仍可反转结果。",
    auditMatch: "报告原始字节与链上 SHA-256 承诺一致。",
    auditMismatch: "报告原始字节与链上 SHA-256 承诺不一致，已禁止质押。",
    auditUnavailable: "无法自动验证报告，请选择同一份本地报告比对原始字节。",
    provisionalOutcome: "暂定结果（尚未终局）",
    finalOutcome: "最终结果",
    rule:
      "结算规则：YES 或 NO 必须严格超过总本金 50% 才获胜；胜方按各自质押本金比例分取输方资金。",
    invalidNote:
      "INVALID 既是可主动质押的立场，也是默认熄断结果。若 YES 和 NO 都未严格超过 50%，Vault 终局为 INVALID，所有参与者按本金比例取回结算池。",
    addressStake: "该地址链上质押",
    addStake: (side: string) => `追加 ${side} 资金`,
    submitStake: "提交 Review + Stake",
    reviewPlaceholder: "200–4096 bytes 的可核验审查理由",
    approveSubmit: "Approve + Submit",
    finalize: "Finalize",
    withdraw: (outcome: string) => `Withdraw · Outcome ${outcome}`,
    peerReviews: "链上 Peer Reviews",
    loadingReviews: "正在读取链上 Review…",
    noReviews: "尚无 Review",
    reviewLoadError: "Review 事件暂时没有完整加载：",
    viewTx: "查看交易",
    hash: "Review hash",
    duplicate: (n: number) => `相同 Review ×${n}`,
    addressNotIdentity: "地址不等于身份，Review 数量不代表独立专家人数。",
    concentration: (address: string, pct: number) => `最大地址 ${address}：占总本金 ${pct}%`,
    loadMore: "加载更多 Review",
    errors: {
      notVault: "该地址不是当前 Audit Factory 创建的 Vault",
      badVault: "Vault 参数校验失败",
      noUsdc: "USDC 余额不足",
    },
  },
};

function App() {
  const wallet = useAuditWallet();
  const [lang, setLang] = useState<Lang>("en");
  const t = copy[lang];
  const vaultParam = new URLSearchParams(location.search).get("vault") || "";
  const [vaultAddress, setVaultAddress] = useState("");
  const [meta, setMeta] = useState<any>(null);
  const [showFinding, setShowFinding] = useState(true);
  const [totals, setTotals] = useState<bigint[]>([0n, 0n, 0n]);
  const [deadline, setDeadline] = useState(0);
  const [resolved, setResolved] = useState(false);
  const [outcome, setOutcome] = useState(0);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [visibleReviewCount, setVisibleReviewCount] = useState(50);
  const [largestPosition, setLargestPosition] = useState<{ address: string; stake: bigint }>({ address: "", stake: 0n });
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewsComplete, setReviewsComplete] = useState(false);
  const [reviewsWalletVerified, setReviewsWalletVerified] = useState(false);
  const [hasReview, setHasReview] = useState(false);
  const [lockedSide, setLockedSide] = useState(0);
  const [userStake, setUserStake] = useState<bigint[]>([0n, 0n, 0n]);
  const [side, setSide] = useState(0);
  const [review, setReview] = useState("");
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [chainNow, setChainNow] = useState(0);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [auditVerification, setAuditVerification] = useState<"checking" | "match" | "mismatch" | "unavailable">("checking");
  const [riskAccepted, setRiskAccepted] = useState(false);
  const loadGeneration = useRef(0);

  const loadReviews = useCallback(async (addr: string, provider: Provider, v: Contract, factory: Contract, generation: number, walletBacked: boolean) => {
    if (generation !== loadGeneration.current) return;
    setReviewsLoading(true);
    setReviewError("");
    setReviewsComplete(false);
    setReviewsWalletVerified(false);
    try {
      const latest = await provider.getBlockNumber();
      const step = 1999;
      const from = Number(await factory.creationBlockOf(addr));
      if (!from || from > latest) throw new Error("Invalid Vault creation block.");
      const filter = v.filters.ReviewSubmitted();
      const chunks: { fromBlock: number; toBlock: number }[] = [];
      for (let start = from; start <= latest; start += step + 1) chunks.push({ fromBlock: start, toBlock: Math.min(latest, start + step) });
      const out: EventLog[] = [];
      for (let i = 0; i < chunks.length; i += 6) {
        const batch = chunks.slice(i, i + 6);
        const settled = await Promise.allSettled(batch.map((c) => v.queryFilter(filter, c.fromBlock, c.toBlock) as Promise<EventLog[]>));
        for (const item of settled) {
          if (item.status === "fulfilled") out.push(...item.value);
          else throw item.reason;
        }
      }
      if (generation !== loadGeneration.current) return;
      const raw = out.map((l) => ({
        reviewer: String(l.args.reviewer),
        side: Number(l.args.side),
        hash: String(l.args.reviewHash),
        review: String(l.args.review),
        tx: l.transactionHash,
        block: l.blockNumber,
      }));
      const stakeByAddress = new Map<string, bigint>();
      for (let i = 0; i < raw.length; i += 20) {
        const batch = raw.slice(i, i + 20);
        const positions = await Promise.all(batch.map((item) => v.stakeOf(item.reviewer, { blockTag: latest })));
        positions.forEach((position, index) => {
          stakeByAddress.set(batch[index].reviewer.toLowerCase(), BigInt(position[0]) + BigInt(position[1]) + BigInt(position[2]));
        });
      }
      if (generation !== loadGeneration.current) return;
      const largest = [...stakeByAddress.entries()].reduce(
        (best, [address, stake]) => stake > best.stake ? { address, stake } : best,
        { address: "", stake: 0n },
      );
      const grouped = new Map<string, Review>();
      for (const item of raw) {
        const key = `${item.side}:${item.hash.toLowerCase()}`;
        const stake = stakeByAddress.get(item.reviewer.toLowerCase()) ?? 0n;
        const existing = grouped.get(key);
        if (existing) {
          existing.duplicateCount += 1;
          existing.stake += stake;
          if (item.block > existing.block) Object.assign(existing, { tx: item.tx, block: item.block });
        } else {
          grouped.set(key, { ...item, duplicateCount: 1, stake });
        }
      }
      setLargestPosition(largest);
      setVisibleReviewCount(50);
      setReviews([...grouped.values()].sort((a, b) => b.block - a.block));
      setReviewsComplete(true);
      setReviewsWalletVerified(walletBacked);
    } catch (e) {
      if (generation !== loadGeneration.current) return;
      setReviewError((e as Error).message || "Review events failed");
    } finally {
      if (generation === loadGeneration.current) setReviewsLoading(false);
    }
  }, []);

  const verifyAudit = useCallback(async (m: any, generation: number) => {
    setAuditVerification("checking");
    try {
      const raw = String(m.auditUrl);
      const source = raw.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${raw.slice(7)}` : raw;
      const response = await fetch(source, { credentials: "omit", headers: { Accept: "application/pdf,application/octet-stream,*/*;q=.5" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const declared = Number(response.headers.get("content-length") || 0);
      if (declared > 20_000_000) throw new Error("Report exceeds 20 MB verification limit.");
      const data = new Uint8Array(await response.arrayBuffer());
      if (data.byteLength > 20_000_000) throw new Error("Report exceeds 20 MB verification limit.");
      const digest = await sha256Hex(data);
      if (generation !== loadGeneration.current) return;
      setAuditVerification(digest.toLowerCase() === String(m.auditHash).toLowerCase() ? "match" : "mismatch");
    } catch {
      if (generation === loadGeneration.current) setAuditVerification("unavailable");
    }
  }, []);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setError("");
    setReviewsComplete(false);
    setReviewsWalletVerified(false);
    setAuditVerification("checking");
    try {
      const addr = getAddress(vaultParam);
      // 已连接钱包时，展示状态与最终签名使用同一个 provider，避免双 RPC 伪造决策语义。
      const provider: Provider = wallet.signer?.provider ?? new JsonRpcProvider(auditConfig.rpcUrl);
      const factory = new Contract(auditConfig.factoryAddress, FACTORY_ABI, provider);
      if (!(await factory.isVault(addr))) throw new Error(t.errors.notVault);
      const v = new Contract(addr, VAULT_ABI, provider);
      const [f, token, d, r, o, m, latestBlock] = await Promise.all([
        v.factory(),
        v.stakeToken(),
        v.resolutionTime(),
        v.resolved(),
        v.outcome(),
        factory.getDisputeMeta(addr),
        provider.getBlock("latest"),
      ]);
      if (String(f).toLowerCase() !== auditConfig.factoryAddress.toLowerCase() || String(token).toLowerCase() !== auditConfig.usdcAddress.toLowerCase()) {
        throw new Error(t.errors.badVault);
      }
      const ts = await Promise.all([v.totalStakeYes(), v.totalStakeNo(), v.totalStakeInvalid()]);
      if (generation !== loadGeneration.current) return;
      setVaultAddress(addr);
      setMeta(m);
      setTotals(ts);
      setDeadline(Number(d));
      setResolved(Boolean(r));
      setOutcome(Number(o));
      setChainNow(Number(latestBlock?.timestamp ?? 0));
      if (wallet.address) {
        const [hr, position, alreadyClaimed, sideInfo] = await Promise.all([
          v.hasReview(wallet.address),
          v.stakeOf(wallet.address),
          v.claimed(wallet.address),
          v.sideOf(wallet.address),
        ]);
        if (generation !== loadGeneration.current) return;
        setHasReview(Boolean(hr));
        setHasClaimed(Boolean(alreadyClaimed));
        setUserStake([BigInt(position[0]), BigInt(position[1]), BigInt(position[2])]);
        if (hr && sideInfo[1]) setLockedSide(Number(sideInfo[0]));
      } else {
        setHasReview(false);
        setLockedSide(0);
        setUserStake([0n, 0n, 0n]);
        setHasClaimed(false);
      }
      void verifyAudit(m, generation);
      void loadReviews(addr, provider, v, factory, generation, Boolean(wallet.signer));
    } catch (e) {
      if (generation === loadGeneration.current) setError((e as Error).message);
    }
  }, [vaultParam, wallet.address, wallet.signer, loadReviews, verifyAudit, t.errors.badVault, t.errors.notVault]);

  useEffect(() => {
    void load();
  }, [load]);

  async function verifyLocalReport(file?: File) {
    if (!file || !meta) return;
    if (file.size > 20_000_000) return setAuditVerification("mismatch");
    setAuditVerification("checking");
    const digest = await sha256Hex(new Uint8Array(await file.arrayBuffer()));
    setAuditVerification(digest.toLowerCase() === String(meta.auditHash).toLowerCase() ? "match" : "mismatch");
  }

  const total = totals.reduce((a, b) => a + b, 0n);
  const pct = (v: bigint) => (total ? Number((v * 1000n) / total) / 10 : 0);
  const currentOutcome = totals[0] > total - totals[0] ? "YES" : totals[1] > total - totals[1] ? "NO" : "INVALID";
  const displayedOutcome = resolved ? names[outcome - 1] || "INVALID" : currentOutcome;
  const sideRules = meta ? [String(meta.yesRule), String(meta.noRule), String(meta.invalidRule)] : [];
  const userStakeTotal = userStake.reduce((sum, value) => sum + value, 0n);
  const userEligible = resolved && !hasClaimed && userStakeTotal > 0n && (outcome === 3 || userStake[outcome - 1] > 0n);

  async function transact(kind: "stake" | "finalize" | "withdraw") {
    if (!wallet.signer) {
      await wallet.connectWallet();
      return;
    }
    if (!vaultAddress) return;
    setBusy(true);
    setError("");
    try {
      const trusted = await assertTrustedVaultForSigning(wallet.signer, vaultAddress);
      const v = new Contract(vaultAddress, VAULT_ABI, wallet.signer);
      const owner = await wallet.signer.getAddress();
      const [walletDeadline, walletResolved, walletMeta, walletHasReview, walletMinStake, latestBlock, walletTotals, walletPosition, walletSide, walletClaimed] = await Promise.all([
        trusted.vault.resolutionTime(),
        trusted.vault.resolved(),
        Promise.resolve(trusted.meta),
        trusted.vault.hasReview(owner),
        trusted.vault.minStake(),
        wallet.signer.provider.getBlock("latest"),
        Promise.all([trusted.vault.totalStakeYes(), trusted.vault.totalStakeNo(), trusted.vault.totalStakeInvalid()]),
        trusted.vault.stakeOf(owner),
        trusted.vault.sideOf(owner),
        trusted.vault.claimed(owner),
      ]);
      setChainNow(Number(latestBlock?.timestamp ?? 0));
      if (
        !meta
        || String(walletMeta.claimHash).toLowerCase() !== String(meta.claimHash).toLowerCase()
        || String(walletMeta.auditHash).toLowerCase() !== String(meta.auditHash).toLowerCase()
      ) throw new Error("Wallet-side Finding metadata differs from the page. Refresh before signing.");
      const freshTotals = walletTotals.map(BigInt);
      const freshPosition = [BigInt(walletPosition[0]), BigInt(walletPosition[1]), BigInt(walletPosition[2])];
      const decisionStateChanged = freshTotals.some((value, index) => value !== totals[index])
        || freshPosition.some((value, index) => value !== userStake[index])
        || Boolean(walletHasReview) !== hasReview
        || (Boolean(walletSide[1]) && Number(walletSide[0]) !== lockedSide)
        || Boolean(walletClaimed) !== hasClaimed;
      if (decisionStateChanged) {
        setTotals(freshTotals);
        setUserStake(freshPosition);
        setHasReview(Boolean(walletHasReview));
        if (Boolean(walletSide[1])) setLockedSide(Number(walletSide[0]));
        setHasClaimed(Boolean(walletClaimed));
        throw new Error("Onchain stake state changed. The wallet-confirmed values are now displayed; review them and submit again.");
      }
      if (kind === "stake") {
        if (!reviewsComplete || !reviewsWalletVerified) throw new Error("Wallet-verified Review history must load before staking.");
        if (auditVerification !== "match") throw new Error("The report must match its onchain SHA-256 before staking.");
        if (!Boolean(walletHasReview) && !riskAccepted) throw new Error("Confirm the real-USDC risk disclosure before the first stake.");
        if (Boolean(walletResolved) || Number(walletDeadline) <= Number(latestBlock?.timestamp ?? 0)) throw new Error("Staking has ended.");
        const value = parseUnits(amount, 6);
        if (value < BigInt(walletMinStake)) throw new Error(`Minimum stake is ${formatUnits(walletMinStake, 6)} USDC.`);
        const token = new Contract(auditConfig.usdcAddress, ERC20_ABI, wallet.signer);
        if ((await token.balanceOf(owner)) < value) throw new Error(t.errors.noUsdc);
        if ((await token.allowance(owner, vaultAddress)) < value) {
          const a = await token.approve(vaultAddress, value);
          await a.wait(2);
        }
        const onchainHasReview = Boolean(walletHasReview);
        const tx = onchainHasReview ? await v.addStake(value) : await v.stakeWithReview(side, value, review);
        await tx.wait(2);
      } else {
        if (kind === "finalize" && Boolean(walletResolved)) throw new Error("Vault is already finalized.");
        if (kind === "finalize" && Number(walletDeadline) > Number(latestBlock?.timestamp ?? 0)) throw new Error("The onchain deadline has not passed.");
        if (kind === "withdraw" && !Boolean(walletResolved)) throw new Error("Vault is not finalized.");
        const tx = kind === "finalize" ? await v.finalize() : await v.withdraw();
        await tx.wait(2);
      }
      await load();
    } catch (e) {
      setError((e as any).shortMessage || (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="sticky top-0 z-50 border-b border-border bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <OCPHeaderBrand />
          <div className="flex items-center gap-3">
            <BaseNetworkBadge connected={wallet.connected && wallet.onTargetNetwork} />
            <LanguageToggle lang={lang} setLang={setLang} />
            <WalletButton
              lang={lang}
              connected={wallet.connected}
              address={wallet.address}
              chainId={wallet.chainId}
              onTargetNetwork={wallet.onTargetNetwork}
              targetChainId={wallet.targetChainId}
              onConnect={wallet.connectWallet}
              onDisconnect={wallet.disconnectWallet}
            />
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-5 py-9">
        {error && <div className="mb-5 rounded-lg bg-red-50 p-4 text-xs text-red-700">{error}</div>}
        {meta && (
          <>
            <header>
              <div className="text-xs font-semibold text-orange-600">{meta.findingLabel}</div>
              <h1 className="mt-2 max-w-4xl font-display text-2xl font-bold leading-tight text-slate-950">{findingTitle(String(meta.finding))}</h1>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                <a href={meta.auditUrl} target="_blank" rel="noreferrer" className="text-orange-600">
                  {t.sourceAudit} <ExternalLink className="inline h-3 w-3" />
                </a>
                <span>{t.deadline}: {new Date(deadline * 1000).toLocaleString()}</span>
                <span>{t.creator}: {String(meta.creator).slice(0, 8)}…</span>
                <span>Claim: {String(meta.claimHash).slice(0, 12)}…</span>
                <span className="break-all">Audit SHA-256: <code>{String(meta.auditHash)}</code></span>
                <button className="text-slate-700 underline underline-offset-4" onClick={() => setShowFinding((v) => !v)}>
                  {showFinding ? t.hideFinding : t.showFinding}
                </button>
              </div>
              {showFinding && <pre className="mt-4 max-h-80 overflow-auto rounded-lg border bg-white p-4 whitespace-pre-wrap break-words text-xs leading-6 text-slate-700">{String(meta.finding)}</pre>}
              <div className={`mt-4 rounded-lg border p-3 text-xs leading-5 ${auditVerification === "match" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : auditVerification === "mismatch" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                {auditVerification === "checking" ? "Verifying report SHA-256…" : auditVerification === "match" ? t.auditMatch : auditVerification === "mismatch" ? t.auditMismatch : t.auditUnavailable}
                {auditVerification !== "match" && <input className="mt-2 block w-full text-xs" type="file" accept="application/pdf,text/plain,text/markdown" onChange={(e) => void verifyLocalReport(e.target.files?.[0])} />}
              </div>
            </header>
            <section className="mt-6 rounded-2xl border bg-white p-6">
              <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{t.capitalNotice}</p>
              <div className="flex justify-between">
                <b className="font-display">{t.distribution}</b>
                <span>{t.totalPrincipal} {formatUnits(total, 6)} USDC</span>
              </div>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
                <i className="bg-emerald-500" style={{ width: `${pct(totals[0])}%` }} />
                <i className="bg-red-500" style={{ width: `${pct(totals[1])}%` }} />
                <i className="bg-slate-500" style={{ width: `${pct(totals[2])}%` }} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {totals.map((v, i) => (
                  <div className="flex min-h-44 flex-col rounded-xl border p-4" key={i}>
                    <b>{names[i]}</b>
                    <div className="mt-2 text-2xl font-bold">{pct(v)}%</div>
                    <small>{formatUnits(v, 6)} USDC</small>
                    <div className="mt-4 border-t pt-3 text-xs font-semibold text-slate-900">{t.sideMeanings[i]}</div>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{sideRules[i]}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-600">{t.rule}</p>
              <p className="mt-2 text-xs leading-5 text-slate-600">{t.invalidNote}</p>
              <p className="mt-3 text-sm font-semibold text-slate-800">
                {resolved ? t.finalOutcome : t.provisionalOutcome}: {displayedOutcome}
              </p>
            </section>
            <div className="mt-6 grid items-start gap-6 lg:grid-cols-[.8fr_1.2fr]">
              <section className="rounded-2xl border bg-white p-6">
                <h2 className="font-display font-bold">{hasReview ? t.addStake(names[lockedSide]) : t.submitStake}</h2>
                {wallet.address && userStakeTotal > 0n && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{t.addressStake}</span>
                      <code>{wallet.address.slice(0, 8)}…{wallet.address.slice(-6)}</code>
                    </div>
                    <div className="mt-2 text-lg font-bold text-slate-950">
                      {names[lockedSide]} · {formatUnits(userStakeTotal, 6)} USDC
                    </div>
                  </div>
                )}
                {!hasReview && (
                  <>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {names.map((n, i) => (
                        <button onClick={() => setSide(i)} className={`rounded-lg border-2 p-3 ${side === i ? "border-orange-500 bg-orange-50" : "border-slate-200"}`} key={n}>
                          {n}
                        </button>
                      ))}
                    </div>
                    <textarea className="input mt-4" rows={10} value={review} onChange={(e) => byteLength(e.target.value) <= 4096 && setReview(e.target.value)} placeholder={t.reviewPlaceholder} />
                    <div className="text-right text-xs">{byteLength(review)} / 4096</div>
                    <label className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                      <input className="mt-1" type="checkbox" checked={riskAccepted} onChange={(e) => setRiskAccepted(e.target.checked)} />
                      <span>{t.riskConfirm}</span>
                    </label>
                  </>
                )}
                <input className="input mt-4" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="USDC" />
                <Button className="mt-4 h-12 w-full" disabled={busy || resolved || chainNow >= deadline || auditVerification !== "match" || !reviewsComplete || !reviewsWalletVerified || (!hasReview && (byteLength(review) < 200 || !riskAccepted))} onClick={() => transact("stake")}>
                  {busy ? <Loader2 className="animate-spin" /> : t.approveSubmit}
                </Button>
                {!resolved && chainNow >= deadline && <Button className="mt-3 w-full" onClick={() => transact("finalize")}>{t.finalize}</Button>}
                {userEligible && <Button className="mt-3 w-full" onClick={() => transact("withdraw")}>{t.withdraw(names[outcome - 1] || "INVALID")}</Button>}
              </section>
              <section className="rounded-2xl border bg-white p-6">
                <div className="flex justify-between">
                  <h2 className="font-display font-bold">{t.peerReviews}</h2>
                  <button onClick={load} disabled={reviewsLoading}><RefreshCw className={`h-4 w-4 ${reviewsLoading ? "animate-spin" : ""}`} /></button>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-600">{t.addressNotIdentity}</p>
                {largestPosition.address && <p className="mt-1 text-xs font-semibold text-slate-800">{t.concentration(`${largestPosition.address.slice(0, 8)}…${largestPosition.address.slice(-6)}`, pct(largestPosition.stake))}</p>}
                {reviewError && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{t.reviewLoadError} {reviewError}</p>}
                <div className="mt-4 space-y-3">
                  {reviewsLoading && !reviews.length ? (
                    <p className="text-sm text-slate-500">{t.loadingReviews}</p>
                  ) : reviews.length ? (
                    reviews.slice(0, visibleReviewCount).map((r, i) => (
                      <article className="rounded-xl border p-4" key={`${r.tx}-${i}`}>
                        <div className="flex justify-between text-xs">
                          <b>{names[r.side]} · {r.reviewer.slice(0, 8)}…{String(meta.creator).toLowerCase() === r.reviewer.toLowerCase() ? " · Creator anchor" : ""}</b>
                          <a href={`${auditConfig.explorer}/tx/${r.tx}`} target="_blank" rel="noreferrer">Block {r.block}</a>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-slate-600">
                          <span>{formatUnits(r.stake, 6)} USDC</span>
                          {r.duplicateCount > 1 && <span className="text-orange-700">{t.duplicate(r.duplicateCount)} · {formatUnits(r.stake, 6)} USDC</span>}
                        </div>
                        <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6">{r.review}</pre>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-slate-400">
                          <span>{t.hash}: <code>{shortHash(r.hash)}</code></span>
                          <a className="text-orange-600" href={`${auditConfig.explorer}/tx/${r.tx}`} target="_blank" rel="noreferrer">{t.viewTx}</a>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">{t.noReviews}</p>
                  )}
                  {reviews.length > visibleReviewCount && <Button className="w-full" onClick={() => setVisibleReviewCount((n) => n + 50)}>{t.loadMore}</Button>}
                </div>
              </section>
            </div>
          </>
        )}
      </main>
      <style>{`.input{box-sizing:border-box;width:100%;border:1px solid #cbd5e1;border-radius:.75rem;padding:.75rem;font:inherit;font-size:.78rem;outline:none}`}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
