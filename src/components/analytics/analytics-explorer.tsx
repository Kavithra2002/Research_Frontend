"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type MenuOption = {
  id: string;
  label: string;
};

type MenuCategory = {
  id: string;
  title: string;
  options: MenuOption[];
};

const MENU_CATEGORIES: MenuCategory[] = [
  {
    id: "market-performance",
    title: "Market performance",
    options: [
      { id: "all-stocks", label: "All stocks" },
      { id: "top-gainers", label: "Top gainers" },
      { id: "biggest-losers", label: "Biggest losers" },
      { id: "best-performing", label: "Best performing" },
      { id: "most-active", label: "Most active" },
      { id: "most-volatile", label: "Most volatile" },
    ],
  },
  {
    id: "market-cap",
    title: "Market cap",
    options: [
      { id: "large-cap", label: "Large-cap" },
      { id: "small-cap", label: "Small-cap" },
    ],
  },
  {
    id: "financial-metrics",
    title: "Financial metrics",
    options: [
      { id: "highest-revenue", label: "Highest revenue" },
      { id: "highest-net-income", label: "Highest net income" },
      { id: "highest-cash", label: "Highest cash" },
      { id: "highest-profit-per-employee", label: "Highest profit per employee" },
      { id: "highest-revenue-per-employee", label: "Highest revenue per employee" },
    ],
  },
  {
    id: "trading",
    title: "Trading",
    options: [
      { id: "unusual-volume", label: "Unusual volume" },
      { id: "high-beta", label: "High beta" },
      { id: "overbought", label: "Overbought" },
      { id: "oversold", label: "Oversold" },
    ],
  },
  {
    id: "price-levels",
    title: "Price levels",
    options: [
      { id: "most-expensive", label: "Most expensive" },
      { id: "penny-stocks", label: "Penny stocks" },
      { id: "all-time-high", label: "All-time high" },
      { id: "all-time-low", label: "All-time low" },
      { id: "52-week-high", label: "52-week high" },
      { id: "52-week-low", label: "52-week low" },
    ],
  },
  {
    id: "other",
    title: "Other",
    options: [
      { id: "largest-employers", label: "Largest employers" },
      { id: "high-dividend", label: "High-dividend" },
    ],
  },
];

type AnalyticsTab = {
  id: string;
  label: string;
  columns: string[];
};

const TABS: AnalyticsTab[] = [
  {
    id: "overview",
    label: "Overview",
    columns: [
      "Symbol",
      "Price",
      "Change %",
      "Volume",
      "Rel Volume",
      "Market cap",
      "P/E",
      "EPS dil TTM",
      "EPS dil growth TTM YoY",
      "Div yield % TTM",
      "Sector",
      "Analyst Rating",
    ],
  },
  {
    id: "performance",
    label: "Performance",
    columns: [
      "Symbol",
      "Price",
      "Change % 1W",
      "Change % 1M",
      "Change % 3M",
      "Change % 6M",
      "Change % YTD",
      "Change % 1Y",
      "Change % 5Y",
      "Volatility",
      "Sector",
    ],
  },
  {
    id: "valuation",
    label: "Valuation",
    columns: [
      "Symbol",
      "Market cap",
      "P/E",
      "P/B",
      "P/S",
      "EV/EBITDA",
      "PEG",
      "Forward P/E",
      "Sector",
    ],
  },
  {
    id: "dividends",
    label: "Dividends",
    columns: [
      "Symbol",
      "Div yield % TTM",
      "Dividend per share",
      "Payout ratio",
      "Div growth 5Y",
      "Ex-div date",
      "Sector",
    ],
  },
  {
    id: "profitability",
    label: "Profitability",
    columns: [
      "Symbol",
      "Gross margin",
      "Operating margin",
      "Net margin",
      "ROE",
      "ROA",
      "ROIC",
      "Sector",
    ],
  },
  {
    id: "income-statement",
    label: "Income Statement",
    columns: [
      "Symbol",
      "Revenue",
      "Gross profit",
      "Operating income",
      "Net income",
      "EBITDA",
      "EPS dil TTM",
      "Sector",
    ],
  },
  {
    id: "balance-sheet",
    label: "Balance Sheet",
    columns: [
      "Symbol",
      "Total assets",
      "Total debt",
      "Cash & equivalents",
      "Equity",
      "Debt / Equity",
      "Current ratio",
      "Sector",
    ],
  },
  {
    id: "cash-flow",
    label: "Cash Flow",
    columns: [
      "Symbol",
      "Operating cash flow",
      "Investing cash flow",
      "Financing cash flow",
      "Free cash flow",
      "Capex",
      "Sector",
    ],
  },
  {
    id: "technicals",
    label: "Technicals",
    columns: [
      "Symbol",
      "Price",
      "RSI (14)",
      "MACD",
      "MA 50",
      "MA 200",
      "Beta",
      "ATR",
      "Sector",
    ],
  },
];

export function AnalyticsExplorer() {
  const [selectedOption, setSelectedOption] = React.useState<string>(
    MENU_CATEGORIES[0].options[0].id,
  );
  const [activeTab, setActiveTab] = React.useState<string>(TABS[0].id);
  const [query, setQuery] = React.useState("");

  const selectedLabel = React.useMemo(() => {
    for (const cat of MENU_CATEGORIES) {
      const found = cat.options.find((o) => o.id === selectedOption);
      if (found) return found.label;
    }
    return "";
  }, [selectedOption]);

  const activeTabLabel = React.useMemo(
    () => TABS.find((t) => t.id === activeTab)?.label ?? "",
    [activeTab],
  );

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm" className="py-0">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 p-4 md:grid-cols-3 lg:grid-cols-6">
          {MENU_CATEGORIES.map((cat) => (
            <div key={cat.id} className="flex flex-col gap-2">
              <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {cat.title}
              </div>
              <ul className="flex flex-col gap-1">
                {cat.options.map((opt) => {
                  const isActive = opt.id === selectedOption;
                  return (
                    <li key={opt.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedOption(opt.id)}
                        className={cn(
                          "w-full rounded-md text-left text-sm transition-colors",
                          "text-foreground/80 hover:text-foreground",
                          isActive &&
                            "font-medium text-primary hover:text-primary",
                        )}
                      >
                        {opt.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <Card size="sm" className="py-0">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v)}
          className="flex flex-col gap-0"
        >
          <div className="border-b px-4 pt-3">
            <TabsList variant="line" className="h-9 gap-2 overflow-x-auto">
              {TABS.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search stocks..."
                className="pl-8"
                aria-label="Search stocks"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Symbol <span className="text-foreground">0</span>
            </div>
          </div>

          {TABS.map((tab) => (
            <TabsContent
              key={tab.id}
              value={tab.id}
              className="flex flex-col gap-0 px-4 pb-4"
            >
              <div className="rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {tab.columns.map((col) => (
                        <TableHead key={col}>{col}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={tab.columns.length}
                        className="h-40 text-center"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-sm text-muted-foreground">
                            No financial data available
                          </span>
                          <span className="text-xs text-muted-foreground/70">
                            Data will appear here once loaded
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          Showing:{" "}
          <span className="text-foreground">{activeTabLabel}</span> data
          {selectedLabel ? (
            <>
              {" "}
              · Filter:{" "}
              <span className="text-foreground">{selectedLabel}</span>
            </>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
