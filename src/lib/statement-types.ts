export const STMT_LABELS: Record<string, string> = {
  income_statement: "Income Statement",
  oci: "Other Comprehensive Income (OCI)",
  sofp: "Statement of Financial Position",
  equity: "Statement of Changes in Equity",
  cash_flows: "Statement of Cash Flows",
  shareholder_info: "Shareholder Information",
  investor_info: "Investor Information",
  ten_year_summary: "Ten Year Summary",
  five_year_summary: "Five Year Summary",
  notes: "Notes to the Financial Statements",
};

export const STMT_ORDER = [
  "income_statement",
  "oci",
  "sofp",
  "equity",
  "cash_flows",
  "shareholder_info",
  "investor_info",
  "ten_year_summary",
  "five_year_summary",
  "notes",
];

export function statementLabel(key: string, fallback?: string | null) {
  return STMT_LABELS[key] ?? fallback ?? key;
}

export function sortStatementKeys(keys: string[]) {
  return [...keys].sort((a, b) => {
    const ai = STMT_ORDER.indexOf(a);
    const bi = STMT_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}
