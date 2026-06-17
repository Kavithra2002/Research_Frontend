import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CSE_BASE = "https://www.cse.lk/api";
const CDN_BASE = "https://cdn.cse.lk";

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function logoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.replace(/^\/+/, "");
  if (trimmed.startsWith("cmt/")) return `${CDN_BASE}/${trimmed}`;
  return `${CDN_BASE}/cmt/${trimmed}`;
}

type CompanyInfo = {
  reqSymbolBetaInfo?: {
    triASIBetaValue?: number;
    betaValueSPSL?: number;
    triASIBetaPeriod?: string;
  } | null;
  reqLogo?: { path?: string } | null;
  reqSymbolInfo?: Record<string, unknown> | null;
};

export async function GET(req: NextRequest) {
  const symbol = new URL(req.url).searchParams.get("symbol")?.trim();
  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }

  try {
    const res = await fetch(`${CSE_BASE}/companyInfoSummery`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json, text/plain, */*",
        "User-Agent":
          "Mozilla/5.0 (compatible; AmbeonConsole/1.0; +https://www.cse.lk)",
      },
      body: new URLSearchParams({ symbol }).toString(),
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `CSE request failed (${res.status})` },
        { status: res.status },
      );
    }

    const data = (await res.json()) as CompanyInfo;
    const info = data.reqSymbolInfo ?? {};
    const beta = data.reqSymbolBetaInfo ?? {};

    return NextResponse.json({
      symbol: String(info.symbol ?? symbol),
      name: String(info.name ?? ""),
      logoUrl: logoUrl(data.reqLogo?.path),
      isin: info.isin != null ? String(info.isin) : null,
      issueDate: info.issueDate != null ? String(info.issueDate) : null,
      lastTradedPrice: num(info.lastTradedPrice),
      previousClose: num(info.previousClose),
      change: num(info.change),
      changePct: num(info.changePercentage),
      open: num(info.open),
      high: num(info.hiTrade),
      low: num(info.lowTrade),
      marketCap: num(info.marketCap),
      marketCapPct: num(info.marketCapPercentage),
      parValue: num(info.parValue),
      sharesIssued: num(info.quantityIssued),
      beta: {
        asi: num(beta.triASIBetaValue),
        spsl: num(beta.betaValueSPSL),
        period: beta.triASIBetaPeriod ?? null,
      },
      hiLo: {
        weekHigh: num(info.wtdHiPrice),
        weekLow: num(info.wtdLowPrice),
        monthHigh: num(info.mtdHiPrice),
        monthLow: num(info.mtdLowPrice),
        ytdHigh: num(info.ytdHiPrice),
        ytdLow: num(info.ytdLowPrice),
        week52High: num(info.p12HiPrice),
        week52Low: num(info.p12LowPrice),
        allHigh: num(info.allHiPrice),
        allLow: num(info.allLowPrice),
      },
      volume: {
        today: num(info.tdyShareVolume),
        month: num(info.mtdShareVolume),
        ytd: num(info.ytdShareVolume),
        p12: num(info.p12ShareVolume),
      },
      turnover: {
        today: num(info.tdyTurnover),
        month: num(info.mtdTurnover),
        ytd: num(info.ytdTurnover),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
