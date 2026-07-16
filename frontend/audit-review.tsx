import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { Contract, formatUnits, getAddress, Interface, JsonRpcProvider, keccak256, parseUnits, type JsonRpcSigner } from "ethers";
import { ExternalLink, FileSearch, Loader2, RefreshCw, Shield } from "lucide-react";
import "./index.css";
import { Button } from "./components/Button";
import { BaseNetworkBadge } from "./components/BaseNetworkBadge";
import { LanguageToggle } from "./components/LanguageToggle";
import { OCPHeaderBrand } from "./components/OCPHeaderBrand";
import { WalletButton } from "./components/WalletButton";
import { auditConfig, ERC20_ABI, FACTORY_ABI, VAULT_ABI } from "./config";
import { extractPdfPages, parseChainGptPdfFindings, sha256Hex } from "./pdfAudit";
import { useAuditWallet } from "./useAuditWallet";

type Lang = "en" | "zh";
type FindingOption = { id: string; label: string; title: string; content: string };
type VaultCard = {
  address: string;
  label: string;
  title: string;
  auditUrl: string;
  deadline: number;
  total: bigint;
  yes: bigint;
  no: bigint;
  invalid: bigint;
};

const MAX_TEXT_AUDIT_BYTES = 2_000_000;
const MAX_PDF_AUDIT_BYTES = 20_000_000;
const bytes = (v: string) => new TextEncoder().encode(v).length;
const defaultDeadline = () => {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const copy = {
  en: {
    createTitle: "Open an audit dispute vault",
    subtitle:
      "Permissionless · Base mainnet · Creation atomically posts the creator's NO review and at least 10 real USDC. The creator chooses any future deadline.",
    risk: "This is a capital-weighted public dispute signal, not a technical audit verdict. The creator's NO position is locked until settlement and can lose its full principal.",
    auditUrl: "Public audit URL",
    loadFindings: "Load findings",
    formatsHelp: "Which report formats are supported?",
    formatsUrl: "Source: a public HTTPS or ipfs:// URL that allows browser cross-origin reads.",
    formatsPdf: "PDF: ChainGPT text-based reports with FND-, Severity, Description, Impact, and Remediation sections. Scanned/image-only PDFs are not supported.",
    formatsText: "Markdown or plain text: numbered level 2–4 headings, such as ## Finding 1: Reentrancy or ### Issue #2 - Access Control.",
    formatsLimits: "Limits: PDF up to 20 MB and 250 pages; text up to 2 MB. Other PDF layouts may require entering the disputed finding manually.",
    reportHash: "Report SHA-256",
    findingsFound: (n: number) => `${n} findings detected. Select the disputed one.`,
    findingLabel: "Finding label",
    disputedFinding: "Disputed finding",
    yesRule: "YES rule",
    noRule: "NO rule",
    invalidRule: "INVALID rule",
    creatorReview: "Creator NO review (public onchain)",
    minReview: "minimum 200",
    initialNo: "Initial NO stake (real USDC)",
    deadline: "Deadline",
    settlementRule:
      "Settlement rule: YES or NO wins only when that side is strictly above 50% of total principal. The winning side shares the losing-side funds pro rata by stake. If neither YES nor NO is above 50%, the result is INVALID and principal is refunded pro rata.",
    processing: "Processing…",
    create: "Approve + Create Vault",
    enterVault: "Open Vault",
    browseVaults: "Browse Vaults",
    refresh: "Refresh",
    readingVaults: "Reading current Factory vaults…",
    noVaults: "No vaults in the current Factory yet.",
    totalPrincipal: "Total principal",
    deadlineShort: "Deadline",
    errors: {
      badUrl: "Audit URL must be HTTPS or ipfs://.",
      noFinding: "Please enter the disputed finding.",
      reviewSize: "Creator NO review must be 200-4096 bytes.",
      minStake: "Creator must initially stake at least 10 USDC on NO.",
      future: "Deadline must be later than now.",
      wrongChain: "Please switch to Base.",
      noUsdc: "Insufficient USDC balance.",
      txFailed: "Create transaction failed.",
      badProtocol: "Only HTTPS or ipfs:// Audit URL is allowed",
      tooLargeText: "Text report is larger than 2 MB and cannot be parsed automatically",
      tooLargePdf: "PDF report is larger than 20 MB and cannot be parsed automatically",
      noFindings: "No detailed ChainGPT PDF findings or numbered Markdown findings were detected",
      timeout: "Reading the report timed out. Please enter the finding manually.",
      corsSuffix: "If the report blocks cross-origin reads, enter it manually.",
      vaultList: "Failed to read vault list",
    },
  },
  zh: {
    createTitle: "开启审计争议 Vault",
    subtitle:
      "Permissionless · Base 主网 · 创建交易原子提交 NO Review 并初押至少 10 枚真实 USDC；创建者可自行选择任意未来截止时间。",
    risk: "这是资金加权的公开争议信号，不是技术审计结论。创建者的 NO 仓位在结算前无法退出，并可能损失全部本金。",
    auditUrl: "公开 Audit URL",
    loadFindings: "读取 Findings",
    formatsHelp: "可以解析哪些审计文档？",
    formatsUrl: "来源：允许浏览器跨域读取的公开 HTTPS 或 ipfs:// URL。",
    formatsPdf: "PDF：带文字层的 ChainGPT 报告，Finding 需包含 FND-、Severity、Description、Impact 和 Remediation 分段；不支持扫描件或纯图片 PDF。",
    formatsText: "Markdown 或纯文本：使用二至四级编号标题，例如 ## Finding 1: Reentrancy 或 ### Issue #2 - Access Control。",
    formatsLimits: "限制：PDF 最大 20 MB、250 页；文本最大 2 MB。其他 PDF 版式可能需要手动填写争议 Finding。",
    reportHash: "报告 SHA-256",
    findingsFound: (n: number) => `已识别 ${n} 个 Findings，请选择争议项`,
    findingLabel: "Finding 标识",
    disputedFinding: "争议 Finding",
    yesRule: "YES 规则",
    noRule: "NO 规则",
    invalidRule: "INVALID 规则",
    creatorReview: "创建者 NO Review（链上公开）",
    minReview: "最低 200",
    initialNo: "初押 NO（真实 USDC）",
    deadline: "截止时间",
    settlementRule:
      "结算规则：YES 或 NO 必须严格超过总本金 50% 才获胜；胜方按各自质押本金比例分取输方资金。若 YES 和 NO 都没有超过 50%，结果为 INVALID，本金按比例退款。",
    processing: "处理中…",
    create: "Approve + 创建 Vault",
    enterVault: "进入 Vault",
    browseVaults: "浏览 Vault",
    refresh: "刷新",
    readingVaults: "正在读取当前 Factory 的 Vault…",
    noVaults: "当前 Factory 暂无 Vault。",
    totalPrincipal: "总本金",
    deadlineShort: "截止",
    errors: {
      badUrl: "Audit URL 必须是 HTTPS 或 ipfs://。",
      noFinding: "请填写争议 Finding。",
      reviewSize: "创建者 NO Review 必须为 200–4096 bytes。",
      minStake: "创建者必须初押至少 10 USDC 到 NO。",
      future: "截止时间必须晚于当前时间。",
      wrongChain: "请切换到 Base 主网",
      noUsdc: "USDC 余额不足。",
      txFailed: "创建交易失败",
      badProtocol: "只允许 HTTPS 或 ipfs:// Audit URL",
      tooLargeText: "文本报告超过 2 MB，不能自动解析",
      tooLargePdf: "PDF 报告超过 20 MB，不能自动解析",
      noFindings: "没有识别到 ChainGPT 详细 PDF Finding 或编号 Markdown Finding",
      timeout: "读取报告超时，请手动填写 Finding。",
      corsSuffix: "如果报告禁止跨域读取，请手动填写。",
      vaultList: "Vault 列表读取失败",
    },
  },
};

function fetchUrl(raw: string, lang: Lang) {
  const value = raw.trim();
  if (value.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${value.slice(7)}`;
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(copy[lang].errors.badProtocol);
  return url.toString();
}
function truncateUtf8(value: string, max: number) {
  if (bytes(value) <= max) return value;
  let out = "";
  for (const char of value) {
    if (bytes(out + char) > max) break;
    out += char;
  }
  return out;
}
function findingTitle(v: string) {
  const line = (v || "").split(/\r?\n/).map((x) => x.trim()).find(Boolean) || "Audit finding";
  const clean = line.replace(/[*`#_]/g, "").replace(/\s+/g, " ");
  return clean.length > 140 ? `${clean.slice(0, 137)}...` : clean;
}
function parseFindings(source: string): FindingOption[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const re = /^(#{2,4})\s+(?:\[[^\]]+\]\s*)?(?:(?:Finding|Issue)\s*#?\s*)?(\d+)[.):-]?\s+(.+)$/i;
  const found: FindingOption[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(re);
    if (!m) continue;
    const level = m[1].length;
    let end = i + 1;
    for (; end < lines.length; end++) {
      const h = lines[end].trim().match(/^(#{1,4})\s+/);
      if (h && h[1].length <= level) break;
    }
    const title = m[3].replace(/\s+#+\s*$/, "").trim();
    const body = lines.slice(i + 1, end).join("\n").trim();
    found.push({ id: `finding-${m[2]}`, label: `Finding #${m[2]}`, title, content: truncateUtf8(`${title}\n\n${body}`, 4096) });
  }
  return found;
}

async function readLimitedResponse(response: Response, maxBytes: number, tooLargeMessage: string) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error(tooLargeMessage);
  if (!response.body) {
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength > maxBytes) throw new Error(tooLargeMessage);
    return data;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(tooLargeMessage);
    }
    chunks.push(value);
  }
  const data = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}

async function assertTrustedFactoryForSigning(signer: JsonRpcSigner) {
  const provider = signer.provider;
  const factoryAddress = getAddress(auditConfig.factoryAddress);
  const tokenAddress = getAddress(auditConfig.usdcAddress);
  const [network, factoryCode, tokenCode] = await Promise.all([
    provider.getNetwork(),
    provider.getCode(factoryAddress),
    provider.getCode(tokenAddress),
  ]);
  if (Number(network.chainId) !== auditConfig.chainId) throw new Error(`Please switch to ${auditConfig.chainName}.`);
  if (factoryCode === "0x" || tokenCode === "0x") throw new Error("Wallet-side contract code verification failed.");
  if (!/^0x[0-9a-f]{64}$/i.test(auditConfig.factoryCodeHash) || keccak256(factoryCode).toLowerCase() !== auditConfig.factoryCodeHash.toLowerCase()) {
    throw new Error("Factory runtime code does not match the published deployment manifest.");
  }

  const factory = new Contract(factoryAddress, FACTORY_ABI, provider);
  const token = new Contract(tokenAddress, ERC20_ABI, provider);
  const [officialToken, minStake, minCreatorNoStake, version, decimals, symbol] = await Promise.all([
    factory.officialStakeToken(),
    factory.minStake(),
    factory.minCreatorNoStake(),
    factory.auditReviewFactoryVersion(),
    token.decimals(),
    token.symbol(),
  ]);
  if (
    getAddress(String(officialToken)) !== tokenAddress
    || BigInt(version) !== 2n
    || Number(decimals) !== 6
    || String(symbol) !== "USDC"
    || BigInt(minStake) <= 0n
    || BigInt(minStake) !== auditConfig.minStake
    || BigInt(minCreatorNoStake) !== auditConfig.minCreatorNoStake
  ) throw new Error("Wallet-side Factory or USDC verification failed. No approval was sent.");
  return { minCreatorNoStake: BigInt(minCreatorNoStake) };
}

function App() {
  const wallet = useAuditWallet();
  const [lang, setLang] = useState<Lang>("en");
  const t = copy[lang];
  const [auditUrl, setAuditUrl] = useState("https://");
  const [label, setLabel] = useState("Finding #1");
  const [finding, setFinding] = useState("");
  const [yesRule, setYesRule] = useState("The finding is valid for the fixed audited code and scope.");
  const [noRule, setNoRule] = useState("The finding is not valid, is not reproducible, or relies on incorrect assumptions.");
  const [invalidRule, setInvalidRule] = useState("The fixed scope or available evidence is insufficient for reliable adjudication.");
  const [review, setReview] = useState("");
  const [stake, setStake] = useState("10");
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [vault, setVault] = useState("");
  const [options, setOptions] = useState<FindingOption[]>([]);
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reportHash, setReportHash] = useState("");
  const [vaults, setVaults] = useState<VaultCard[]>([]);
  const [vaultsLoading, setVaultsLoading] = useState(false);
  const [vaultsError, setVaultsError] = useState("");

  async function importPdfData(data: Uint8Array) {
    if (new TextDecoder().decode(data.subarray(0, 5)) !== "%PDF-") throw new Error("The selected file is not a valid PDF.");
    const digest = await sha256Hex(data);
    const pages = await extractPdfPages(data);
    const parsed = parseChainGptPdfFindings(pages, digest, truncateUtf8);
    if (!parsed.length) throw new Error(t.errors.noFindings);
    setReportHash(digest);
    setOptions(parsed);
  }

  const loadVaults = useCallback(async () => {
    setVaultsLoading(true);
    setVaultsError("");
    try {
      const provider = new JsonRpcProvider(auditConfig.rpcUrl);
      const factory = new Contract(auditConfig.factoryAddress, FACTORY_ABI, provider);
      const count: bigint = await factory.vaultCount();
      const start = Number(count > 12n ? count - 12n : 0n);
      const indexes = Array.from({ length: Number(count) - start }, (_, i) => start + i).reverse();
      const cards = await Promise.all(
        indexes.map(async (index) => {
          const address: string = await factory.vaultAt(index);
          const meta = await factory.getDisputeMeta(address);
          const v = new Contract(address, VAULT_ABI, provider);
          const [deadline, yes, no, invalid] = await Promise.all([
            v.resolutionTime(),
            v.totalStakeYes(),
            v.totalStakeNo(),
            v.totalStakeInvalid(),
          ]);
          return {
            address,
            label: String(meta.findingLabel),
            title: findingTitle(String(meta.finding)),
            auditUrl: String(meta.auditUrl),
            deadline: Number(deadline),
            yes: yes as bigint,
            no: no as bigint,
            invalid: invalid as bigint,
            total: (yes as bigint) + (no as bigint) + (invalid as bigint),
          };
        }),
      );
      setVaults(cards);
    } catch (e) {
      setVaultsError((e as Error).message || t.errors.vaultList);
    } finally {
      setVaultsLoading(false);
    }
  }, [t.errors.vaultList]);

  useEffect(() => {
    void loadVaults();
  }, [loadVaults]);

  async function loadFindings() {
    setLoadingFindings(true);
    setLoadError("");
    setReportHash("");
    setOptions([]);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const sourceUrl = fetchUrl(auditUrl, lang);
      const response = await fetch(sourceUrl, {
        signal: controller.signal,
        headers: { Accept: "application/pdf,text/markdown;q=0.9,text/plain;q=0.8,text/html;q=0.5" },
        credentials: "omit",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type")?.toLowerCase() || "";
      const looksLikePdf = contentType.includes("application/pdf") || new URL(sourceUrl).pathname.toLowerCase().endsWith(".pdf");
      let parsed: FindingOption[];
      if (looksLikePdf) {
        const data = await readLimitedResponse(response, MAX_PDF_AUDIT_BYTES, t.errors.tooLargePdf);
        await importPdfData(data);
        return;
      } else {
        const data = await readLimitedResponse(response, MAX_TEXT_AUDIT_BYTES, t.errors.tooLargeText);
        setReportHash(await sha256Hex(data));
        parsed = parseFindings(new TextDecoder("utf-8", { fatal: false }).decode(data));
      }
      if (!parsed.length) throw new Error(t.errors.noFindings);
      setOptions(parsed);
    } catch (e) {
      setLoadError((e as Error).name === "AbortError" ? t.errors.timeout : `${(e as Error).message}. ${t.errors.corsSuffix}`);
    } finally {
      clearTimeout(timer);
      setLoadingFindings(false);
    }
  }

  function selectFinding(item: FindingOption) {
    setLabel(item.label);
    setFinding(item.content);
  }

  async function create() {
    if (!wallet.signer) {
      await wallet.connectWallet();
      return;
    }
    setError("");
    try {
      fetchUrl(auditUrl, lang);
    } catch {
      return setError(t.errors.badUrl);
    }
    if (!finding.trim()) return setError(t.errors.noFinding);
    if (!/^0x[0-9a-f]{64}$/i.test(reportHash)) return setError("Load the public report first so its SHA-256 can be bound onchain.");
    if (bytes(review) < 200 || bytes(review) > 4096) return setError(t.errors.reviewSize);
    const amount = parseUnits(stake, 6);
    if (amount < 10_000_000n) return setError(t.errors.minStake);
    const resolutionTime = Math.floor(new Date(deadline).getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(resolutionTime) || resolutionTime <= now) return setError(t.errors.future);

    setBusy(true);
    try {
      const trusted = await assertTrustedFactoryForSigning(wallet.signer);
      const token = new Contract(auditConfig.usdcAddress, ERC20_ABI, wallet.signer);
      const factory = new Contract(auditConfig.factoryAddress, FACTORY_ABI, wallet.signer);
      if (amount < trusted.minCreatorNoStake) throw new Error(t.errors.minStake);
      const owner = await wallet.signer.getAddress();
      const balance: bigint = await token.balanceOf(owner);
      if (balance < amount) throw new Error(t.errors.noUsdc);
      const allowance: bigint = await token.allowance(owner, auditConfig.factoryAddress);
      if (allowance < amount) {
        const approve = await token.approve(auditConfig.factoryAddress, amount);
        await approve.wait(2);
      }
      const tx = await factory.createDispute({
        auditUrl: auditUrl.trim(),
        auditHash: reportHash,
        findingLabel: label.trim(),
        finding: finding.trim(),
        yesRule: yesRule.trim(),
        noRule: noRule.trim(),
        invalidRule: invalidRule.trim(),
        resolutionTime,
        creatorReview: review,
        initialNoStake: amount,
      });
      const receipt = await tx.wait(2);
      if (!receipt || receipt.status !== 1) throw new Error(t.errors.txFailed);
      const iface = new Interface(FACTORY_ABI);
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== auditConfig.factoryAddress.toLowerCase()) continue;
        try {
          const p = iface.parseLog(log);
          if (p?.name === "AuditReviewVaultCreated") setVault(String(p.args.vault));
        } catch {}
      }
      await loadVaults();
    } catch (e) {
      setError((e as { shortMessage?: string; message?: string }).shortMessage || (e as Error).message);
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
      <main className="mx-auto max-w-4xl px-5 py-10">
        <h1 className="font-display text-3xl font-bold">{t.createTitle}</h1>
        <p className="mt-3 text-sm text-slate-600">{t.subtitle}</p>
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{t.risk}</p>
        <section className="mt-7 space-y-5 rounded-2xl border bg-white p-6 shadow-sm">
          <Field label={t.auditUrl}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className="input" value={auditUrl} onChange={(e) => { setAuditUrl(e.target.value); setOptions([]); setReportHash(""); setLoadError(""); }} />
              <Button type="button" disabled={loadingFindings || !auditUrl.trim()} onClick={loadFindings} className="shrink-0">
                {loadingFindings ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                {t.loadFindings}
              </Button>
            </div>
          </Field>
          <details className="group rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <summary className="cursor-pointer select-none font-semibold text-slate-700 marker:text-orange-500">
              {t.formatsHelp}
            </summary>
            <ul className="mt-3 list-disc space-y-2 pl-5 leading-5">
              <li>{t.formatsUrl}</li>
              <li>{t.formatsPdf}</li>
              <li>{t.formatsText}</li>
              <li>{t.formatsLimits}</li>
            </ul>
          </details>
          {reportHash && <div className="break-all rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800"><b>{t.reportHash}:</b> <code>{reportHash}</code></div>}
          {loadError && <div className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">{loadError}</div>}
          {options.length > 0 && (
            <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
              <div className="mb-3 text-xs font-bold text-orange-800">{t.findingsFound(options.length)}</div>
              <div className="max-h-80 space-y-2 overflow-auto">
                {options.map((item) => (
                  <button type="button" key={item.id} onClick={() => selectFinding(item)} className={`w-full rounded-lg border bg-white p-3 text-left text-xs leading-5 hover:border-orange-500 ${label === item.label && finding === item.content ? "border-orange-500" : "border-slate-200"}`}>
                    <b className="text-orange-700">{item.label}</b>
                    <span className="ml-2">{item.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <Field label={t.findingLabel}><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
          <Field label={t.disputedFinding}><textarea className="input" rows={6} value={finding} onChange={(e) => setFinding(e.target.value)} /></Field>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t.yesRule}><textarea className="input" rows={5} value={yesRule} onChange={(e) => setYesRule(e.target.value)} /></Field>
            <Field label={t.noRule}><textarea className="input" rows={5} value={noRule} onChange={(e) => setNoRule(e.target.value)} /></Field>
            <Field label={t.invalidRule}><textarea className="input" rows={5} value={invalidRule} onChange={(e) => setInvalidRule(e.target.value)} /></Field>
          </div>
          <Field label={t.creatorReview}>
            <textarea className="input font-mono" rows={10} value={review} onChange={(e) => bytes(e.target.value) <= 4096 && setReview(e.target.value)} />
            <small>{bytes(review)} / 4096 bytes, {t.minReview}</small>
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t.initialNo}><input className="input" value={stake} onChange={(e) => setStake(e.target.value)} /></Field>
            <Field label={t.deadline}><input type="datetime-local" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
          </div>
          <div className="rounded-lg bg-slate-50 p-4 text-xs leading-6 text-slate-700">{t.settlementRule}</div>
          {error && <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>}
          <Button onClick={create} disabled={busy} className="h-12 w-full">
            {busy ? <><Loader2 className="animate-spin" />{t.processing}</> : <><Shield />{t.create}</>}
          </Button>
          {vault && <a className="flex items-center justify-center gap-2 text-sm text-emerald-700" href={`/review-stake.html?vault=${vault}`}>{t.enterVault} {vault}<ExternalLink className="h-4 w-4" /></a>}
        </section>
        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">{t.browseVaults}</h2>
            <button className="inline-flex items-center gap-2 text-xs text-slate-600" onClick={loadVaults} disabled={vaultsLoading}>
              <RefreshCw className={`h-4 w-4 ${vaultsLoading ? "animate-spin" : ""}`} />{t.refresh}
            </button>
          </div>
          {vaultsError && <div className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{vaultsError}</div>}
          {vaultsLoading && !vaults.length ? (
            <div className="rounded-xl border bg-white p-6 text-sm text-slate-500">{t.readingVaults}</div>
          ) : vaults.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {vaults.map((v) => (
                <a key={v.address} href={`/review-stake.html?vault=${v.address}`} className="block rounded-xl border bg-white p-4 shadow-sm transition hover:border-orange-400">
                  <div className="flex items-center justify-between gap-3">
                    <b className="text-xs text-orange-600">{v.label}</b>
                    <span className="text-xs text-slate-400">{v.address.slice(0, 6)}…{v.address.slice(-4)}</span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold leading-5 text-slate-950">{v.title}</h3>
                  <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-slate-100">
                    <i className="bg-emerald-500" style={{ width: v.total ? `${Number((v.yes * 1000n) / v.total) / 10}%` : "0%" }} />
                    <i className="bg-red-500" style={{ width: v.total ? `${Number((v.no * 1000n) / v.total) / 10}%` : "0%" }} />
                    <i className="bg-slate-500" style={{ width: v.total ? `${Number((v.invalid * 1000n) / v.total) / 10}%` : "0%" }} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>{t.totalPrincipal} {formatUnits(v.total, 6)} USDC</span>
                    <span>{t.deadlineShort} {new Date(v.deadline * 1000).toLocaleString()}</span>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border bg-white p-6 text-sm text-slate-500">{t.noVaults}</div>
          )}
        </section>
      </main>
      <style>{`.input{box-sizing:border-box;width:100%;border:1px solid #cbd5e1;border-radius:.75rem;padding:.75rem;font:inherit;font-size:.78rem;outline:none}.input:focus{border-color:#ea580c;box-shadow:0 0 0 3px rgba(234,88,12,.1)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-bold">{label}</span>{children}</label>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
