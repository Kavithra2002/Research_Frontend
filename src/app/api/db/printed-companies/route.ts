import fs from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function printedRoot(): string {
  return path.resolve(
    process.cwd(),
    "..",
    "backend",
    "extracted",
    "printed_statements",
  );
}

function prettifySlug(slug: string): string {
  return slug.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

export async function GET() {
  const root = printedRoot();
  if (!fs.existsSync(root)) {
    return NextResponse.json({ companies: [] });
  }

  const nowYear = new Date().getFullYear();
  const companies: {
    name: string;
    displayName: string;
    years: number[];
  }[] = [];

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    if (!/^[A-Za-z0-9_-]+$/.test(slug)) continue;
    const dir = path.join(root, slug);
    const years = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => Number(name.slice(0, -5)))
      .filter(
        (year) => Number.isFinite(year) && year >= 1990 && year <= nowYear + 1,
      )
      .sort((a, b) => b - a);
    if (years.length === 0) continue;

    let displayName = prettifySlug(slug);
    try {
      const sample = JSON.parse(
        fs.readFileSync(path.join(dir, `${years[0]}.json`), "utf8"),
      ) as { company_name?: string };
      if (sample.company_name?.trim()) displayName = sample.company_name.trim();
    } catch {
      /* keep prettified slug */
    }

    companies.push({ name: slug, displayName, years });
  }

  companies.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  return NextResponse.json({ companies });
}
