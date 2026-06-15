"use client";

import * as React from "react";
import { Database, Sparkles } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NonFinancialExplorer } from "@/components/ai/non-financial-explorer";
import { NonFinancialSaved } from "@/components/ai/non-financial-saved";

export function NonFinancialSection() {
  const [tab, setTab] = React.useState("generate");

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(String(value))}
      className="min-w-0"
    >
      <TabsList className="self-start">
        <TabsTrigger value="generate" className="gap-1.5">
          <Sparkles className="size-4" />
          Generate
        </TabsTrigger>
        <TabsTrigger value="saved" className="gap-1.5">
          <Database className="size-4" />
          Saved data
        </TabsTrigger>
      </TabsList>

      <TabsContent value="generate" className="min-w-0">
        <NonFinancialExplorer />
      </TabsContent>

      <TabsContent value="saved" className="min-w-0">
        <NonFinancialSaved />
      </TabsContent>
    </Tabs>
  );
}
