type PdfFinding = {
  id: string;
  label: string;
  title: string;
  content: string;
};

const cleanLine = (value: string) => value.replace(/\s+/g, " ").trim();

function sectionValue(lines: string[], prefix: string) {
  const line = lines.find((value) => value.toLowerCase().startsWith(prefix.toLowerCase()));
  return line ? line.slice(prefix.length).trim() : "";
}

/**
 * ChainGPT 的 Full Audit PDF 通常每个详细 Finding 独占一页，并使用
 * FND-* / Severity / Description / Impact / Remediation 作为固定分段。
 *这里只解析详细页，不把摘要表中被折行、可能重复的标题误当成完整 Finding。
 */
export function parseChainGptPdfFindings(pages: string[], reportHash: string, truncate: (value: string, max: number) => string): PdfFinding[] {
  const findings: PdfFinding[] = [];

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const lines = pages[pageIndex].split(/\r?\n/).map(cleanLine).filter(Boolean);
    const headingIndex = lines.findIndex((line) => /^FND-/i.test(line));
    const severityIndex = lines.findIndex((line, index) => index > headingIndex && /^Severity\s*:/i.test(line));
    const descriptionIndex = lines.findIndex((line, index) => index > severityIndex && /^Description$/i.test(line));
    const impactIndex = lines.findIndex((line, index) => index > descriptionIndex && /^Impact$/i.test(line));
    const remediationIndex = lines.findIndex((line, index) => index > impactIndex && /^Remediation$/i.test(line));
    if (headingIndex < 0 || severityIndex < 0 || descriptionIndex < 0 || impactIndex < 0 || remediationIndex < 0) continue;

    const footerIndex = lines.findIndex((line, index) => index > remediationIndex && /^DATE\/TIME\s*:/i.test(line));
    const endIndex = footerIndex > remediationIndex ? footerIndex : lines.length;
    const heading = lines[headingIndex].replace(/^FND-/i, "").trim();
    const severity = sectionValue(lines.slice(severityIndex), "Severity:").toUpperCase() || "UNSPECIFIED";
    const category = sectionValue(lines.slice(severityIndex), "Category:");
    const location = sectionValue(lines.slice(severityIndex), "Code Location:");
    const description = lines.slice(descriptionIndex + 1, impactIndex).join(" ");
    const impact = lines.slice(impactIndex + 1, remediationIndex).join(" ");
    const remediation = lines.slice(remediationIndex + 1, endIndex).join(" ");
    if (!description) continue;

    const content = [
      `ChainGPT PDF report SHA-256: ${reportHash}`,
      `Finding: ${heading}`,
      `Severity: ${severity}`,
      category && `Category: ${category}`,
      location && `Code location: ${location}`,
      `Description: ${description}`,
      impact && `Impact: ${impact}`,
      remediation && `Remediation: ${remediation}`,
    ].filter(Boolean).join("\n\n");

    findings.push({
      id: `chaingpt-pdf-${pageIndex + 1}`,
      label: truncate(`ChainGPT ${severity} · ${heading}`, 160),
      title: heading,
      content: truncate(content, 4096),
    });
  }

  return findings;
}

export async function extractPdfPages(data: Uint8Array) {
  const [pdfjs, workerModule] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;

  // PDF.js 的 getDocument 只加载文档供文字层解析；这里不调用任何 PDF JavaScript API。
  const loadingTask = pdfjs.getDocument({ data });
  const document = await loadingTask.promise;
  if (document.numPages > 250) {
    await loadingTask.destroy();
    throw new Error("PDF has more than 250 pages.");
  }

  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const text = await page.getTextContent();
      pages.push(text.items.map((item) => ("str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "")).join(""));
      page.cleanup();
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

export async function sha256Hex(data: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return `0x${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
