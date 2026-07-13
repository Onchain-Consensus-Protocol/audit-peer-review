import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { Contract, JsonRpcProvider, formatUnits, getAddress, parseUnits, type EventLog } from "ethers";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import "./index.css";
import { Button } from "./components/Button";
import { WalletButton } from "./components/WalletButton";
import { auditConfig, ERC20_ABI, FACTORY_ABI, VAULT_ABI } from "./config";
import { useAuditWallet } from "./useAuditWallet";

type Lang = "en" | "zh";
type Review = { reviewer: string; side: number; review: string; hash: string; tx: string; block: number };

const names = ["YES", "NO", "INVALID"];
const byteLength = (v: string) => new TextEncoder().encode(v).length;
const shortHash = (v: string) => `${v.slice(0, 10)}…${v.slice(-8)}`;
const findingTitle = (v: string) => {
  const line = (v || "").split(/\r?\n/).map((x) => x.trim()).find(Boolean) || "Audit finding";
  const clean = line.replace(/[*`#_]/g, "").replace(/\s+/g, " ");
  return clean.length > 180 ? `${clean.slice(0, 177)}...` : clean;
};

const copy = {
  en: {
    sourceAudit: "Source audit",
    deadline: "Deadline",
    creator: "Creator",
    showFinding: "View full finding",
    hideFinding: "Hide full finding",
    distribution: "Vault distribution",
    totalPrincipal: "Total principal",
    currentOutcome: "Current result",
    rule:
      "Resolution rule: YES or NO wins only when that side is strictly above 50% of total principal. The winning side shares the losing-side funds pro rata by stake. If neither YES nor NO is above 50%, the result is INVALID and principal is refunded pro rata.",
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
    errors: {
      notVault: "This address was not created by the current Audit Factory.",
      badVault: "Vault parameter check failed.",
      noUsdc: "Insufficient test USDC balance.",
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
    currentOutcome: "按当前本金",
    rule:
      "结算规则：YES 或 NO 必须严格超过总本金 50% 才获胜；胜方按各自质押本金比例分取输方资金。若 YES 和 NO 都没有超过 50%，结果为 INVALID，本金按比例退款。",
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
    errors: {
      notVault: "该地址不是当前 Audit Factory 创建的 Vault",
      badVault: "Vault 参数校验失败",
      noUsdc: "测试 USDC 余额不足",
    },
  },
};

function LangToggle({ lang, setLang }: { lang: Lang; setLang: (v: Lang) => void }) {
  return (
    <div className="flex rounded-lg border bg-white p-1 text-xs">
      <button className={`rounded-md px-3 py-1 ${lang === "en" ? "bg-slate-900 text-white" : "text-slate-500"}`} onClick={() => setLang("en")}>
        EN
      </button>
      <button className={`rounded-md px-3 py-1 ${lang === "zh" ? "bg-slate-900 text-white" : "text-slate-500"}`} onClick={() => setLang("zh")}>
        中文
      </button>
    </div>
  );
}

function App() {
  const wallet = useAuditWallet();
  const [lang, setLang] = useState<Lang>("en");
  const t = copy[lang];
  const vaultParam = new URLSearchParams(location.search).get("vault") || "";
  const [vaultAddress, setVaultAddress] = useState("");
  const [meta, setMeta] = useState<any>(null);
  const [showFinding, setShowFinding] = useState(false);
  const [totals, setTotals] = useState<bigint[]>([0n, 0n, 0n]);
  const [deadline, setDeadline] = useState(0);
  const [resolved, setResolved] = useState(false);
  const [outcome, setOutcome] = useState(0);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [hasReview, setHasReview] = useState(false);
  const [lockedSide, setLockedSide] = useState(0);
  const [side, setSide] = useState(0);
  const [review, setReview] = useState("");
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadReviews = useCallback(async (addr: string, provider: JsonRpcProvider, v: Contract, factory: Contract) => {
    setReviewsLoading(true);
    setReviewError("");
    try {
      const latest = await provider.getBlockNumber();
      const step = 1999;
      const oldest = Math.max(0, latest - 200000);
      let from = Math.max(0, latest - step);
      const createdFilter = factory.filters.AuditReviewVaultCreated(addr);
      for (let to = latest; to >= oldest; to -= step + 1) {
        const fromBlock = Math.max(oldest, to - step);
        const created = (await factory.queryFilter(createdFilter, fromBlock, to)) as EventLog[];
        if (created.length) {
          from = created[0].blockNumber;
          break;
        }
      }
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
      setReviews(
        out
          .map((l) => ({
            reviewer: String(l.args.reviewer),
            side: Number(l.args.side),
            hash: String(l.args.reviewHash),
            review: String(l.args.review),
            tx: l.transactionHash,
            block: l.blockNumber,
          }))
          .sort((a, b) => b.block - a.block),
      );
    } catch (e) {
      setReviewError((e as Error).message || "Review events failed");
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      const addr = getAddress(vaultParam);
      const provider = new JsonRpcProvider(auditConfig.rpcUrl);
      const factory = new Contract(auditConfig.factoryAddress, FACTORY_ABI, provider);
      if (!(await factory.isVault(addr))) throw new Error(t.errors.notVault);
      const v = new Contract(addr, VAULT_ABI, provider);
      const [f, token, d, r, o, m] = await Promise.all([
        v.factory(),
        v.stakeToken(),
        v.resolutionTime(),
        v.resolved(),
        v.outcome(),
        factory.getDisputeMeta(addr),
      ]);
      if (String(f).toLowerCase() !== auditConfig.factoryAddress.toLowerCase() || String(token).toLowerCase() !== auditConfig.usdcAddress.toLowerCase()) {
        throw new Error(t.errors.badVault);
      }
      const ts = await Promise.all([v.totalStakeYes(), v.totalStakeNo(), v.totalStakeInvalid()]);
      setVaultAddress(addr);
      setMeta(m);
      setTotals(ts);
      setDeadline(Number(d));
      setResolved(Boolean(r));
      setOutcome(Number(o));
      if (wallet.address) {
        const hr = await v.hasReview(wallet.address);
        setHasReview(hr);
        if (hr) setLockedSide(Number(await v.reviewSideOf(wallet.address)));
      }
      void loadReviews(addr, provider, v, factory);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [vaultParam, wallet.address, loadReviews, t.errors.badVault, t.errors.notVault]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = totals.reduce((a, b) => a + b, 0n);
  const pct = (v: bigint) => (total ? Number((v * 1000n) / total) / 10 : 0);
  const currentOutcome = totals[0] > total - totals[0] ? "YES" : totals[1] > total - totals[1] ? "NO" : "INVALID";

  async function transact(kind: "stake" | "finalize" | "withdraw") {
    if (!wallet.signer) {
      await wallet.connectWallet();
      return;
    }
    if (!vaultAddress) return;
    setBusy(true);
    setError("");
    try {
      const v = new Contract(vaultAddress, VAULT_ABI, wallet.signer);
      if (kind === "stake") {
        const value = parseUnits(amount, 6);
        const token = new Contract(auditConfig.usdcAddress, ERC20_ABI, wallet.signer);
        const owner = await wallet.signer.getAddress();
        if ((await token.balanceOf(owner)) < value) throw new Error(t.errors.noUsdc);
        if ((await token.allowance(owner, vaultAddress)) < value) {
          const a = await token.approve(vaultAddress, value);
          await a.wait(2);
        }
        const tx = hasReview ? await v.addStake(value) : await v.stakeWithReview(side, value, review);
        await tx.wait(2);
      } else {
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
      <nav className="border-b bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <a href="/audit-review.html" className="font-display font-bold">OCP / AUDIT PEER REVIEW</a>
          <div className="flex items-center gap-3">
            <LangToggle lang={lang} setLang={setLang} />
            <WalletButton lang={lang} {...wallet} />
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
                <button className="text-slate-700 underline underline-offset-4" onClick={() => setShowFinding((v) => !v)}>
                  {showFinding ? t.hideFinding : t.showFinding}
                </button>
              </div>
              {showFinding && <pre className="mt-4 max-h-80 overflow-auto rounded-lg border bg-white p-4 whitespace-pre-wrap break-words text-xs leading-6 text-slate-700">{String(meta.finding)}</pre>}
            </header>
            <section className="mt-6 rounded-2xl border bg-white p-6">
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
                  <div className="rounded-xl border p-4" key={i}>
                    <b>{names[i]}</b>
                    <div className="mt-2 text-2xl font-bold">{pct(v)}%</div>
                    <small>{formatUnits(v, 6)} USDC</small>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-600">{t.rule}</p>
              <p className="mt-2 text-xs text-slate-500">{t.currentOutcome}: {currentOutcome}</p>
            </section>
            <div className="mt-6 grid items-start gap-6 lg:grid-cols-[.8fr_1.2fr]">
              <section className="rounded-2xl border bg-white p-6">
                <h2 className="font-display font-bold">{hasReview ? t.addStake(names[lockedSide]) : t.submitStake}</h2>
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
                  </>
                )}
                <input className="input mt-4" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="USDC" />
                <Button className="mt-4 h-12 w-full" disabled={busy || resolved || (!hasReview && byteLength(review) < 200)} onClick={() => transact("stake")}>
                  {busy ? <Loader2 className="animate-spin" /> : t.approveSubmit}
                </Button>
                {!resolved && Date.now() / 1000 >= deadline && <Button className="mt-3 w-full" onClick={() => transact("finalize")}>{t.finalize}</Button>}
                {resolved && <Button className="mt-3 w-full" onClick={() => transact("withdraw")}>{t.withdraw(names[outcome - 1] || "INVALID")}</Button>}
              </section>
              <section className="rounded-2xl border bg-white p-6">
                <div className="flex justify-between">
                  <h2 className="font-display font-bold">{t.peerReviews}</h2>
                  <button onClick={load} disabled={reviewsLoading}><RefreshCw className={`h-4 w-4 ${reviewsLoading ? "animate-spin" : ""}`} /></button>
                </div>
                {reviewError && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{t.reviewLoadError} {reviewError}</p>}
                <div className="mt-4 space-y-3">
                  {reviewsLoading && !reviews.length ? (
                    <p className="text-sm text-slate-500">{t.loadingReviews}</p>
                  ) : reviews.length ? (
                    reviews.map((r, i) => (
                      <article className="rounded-xl border p-4" key={`${r.tx}-${i}`}>
                        <div className="flex justify-between text-xs">
                          <b>{names[r.side]} · {r.reviewer.slice(0, 8)}…</b>
                          <a href={`${auditConfig.explorer}/tx/${r.tx}`} target="_blank" rel="noreferrer">Block {r.block}</a>
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
