"use client";

import * as React from "react";
import {
  ExternalLink,
  Flame,
  Globe2,
  MapPin,
  Newspaper,
  Play,
  RefreshCw,
  Radio,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type NewsItem = {
  id: string;
  url: string;
  title: string;
  summary: string;
  imageUrl: string | null;
  sourceName: string;
  publishedAt: string;
  type: "article" | "video" | "podcast";
  category: "global" | "local" | "commodities" | "geopolitics";
  featured: boolean;
  youtubeId: string | null;
};

type NewspaperResponse = {
  featured: NewsItem[];
  feed: NewsItem[];
  lastRefreshedAt: string | null;
  itemCount: number;
  error?: string;
};

const CATEGORY_LABELS: Record<NewsItem["category"], string> = {
  global: "Global",
  local: "Local",
  commodities: "Commodities",
  geopolitics: "Geopolitics",
};

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function typeLabel(type: NewsItem["type"]): string {
  if (type === "video") return "Watch";
  if (type === "podcast") return "Listen";
  return "Read";
}

function TypeIcon({ type }: { type: NewsItem["type"] }) {
  if (type === "video") return <Play className="size-3.5" />;
  if (type === "podcast") return <Radio className="size-3.5" />;
  return <Newspaper className="size-3.5" />;
}

function NewsThumb({
  item,
  className,
}: {
  item: NewsItem;
  className?: string;
}) {
  const ytThumb = item.youtubeId
    ? `https://img.youtube.com/vi/${item.youtubeId}/hqdefault.jpg`
    : null;
  const initialSrc = item.imageUrl ?? ytThumb;
  const [src, setSrc] = React.useState<string | null>(initialSrc);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setSrc(item.imageUrl ?? ytThumb);
    setFailed(false);
  }, [item.imageUrl, item.youtubeId, ytThumb]);

  if (!src || failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-gradient-to-br from-emerald-950/80 to-muted",
          className,
        )}
      >
        <Globe2 className="size-8 text-emerald-500/50" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={cn("object-cover", className)}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function FeaturedCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex min-w-[280px] max-w-[360px] shrink-0 flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-emerald-500/40"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden">
        <NewsThumb item={item} className="size-full transition-transform group-hover:scale-[1.02]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <Badge className="absolute left-3 top-3 gap-1 bg-amber-500/90 text-black hover:bg-amber-500">
          <Flame className="size-3" />
          Featured
        </Badge>
        <div className="absolute bottom-0 p-3">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">
            {item.title}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
        <span className="truncate">{item.sourceName}</span>
        <span className="shrink-0">{fmtDate(item.publishedAt)}</span>
      </div>
    </a>
  );
}

function FeedCard({ item }: { item: NewsItem }) {
  return (
    <Card className="overflow-hidden transition-colors hover:border-emerald-500/30">
      <div className="grid gap-0 sm:grid-cols-[140px_1fr]">
        <div className="relative aspect-video sm:aspect-auto sm:min-h-[120px]">
          <NewsThumb item={item} className="size-full" />
          {item.type !== "article" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="rounded-full bg-emerald-600/90 p-2 text-white">
                <TypeIcon type={item.type} />
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col">
          <CardHeader className="gap-1 p-4 pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {CATEGORY_LABELS[item.category]}
              </Badge>
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <TypeIcon type={item.type} />
                {item.type}
              </Badge>
            </div>
            <CardTitle className="line-clamp-2 text-base leading-snug">
              {item.title}
            </CardTitle>
            <CardDescription className="line-clamp-2 text-xs">
              {item.summary || "Open the source for the full story."}
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto flex flex-wrap items-center justify-between gap-2 p-4 pt-0">
            <span className="text-xs text-muted-foreground">
              {item.sourceName} · {fmtDate(item.publishedAt)}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              nativeButton={false}
              render={
                <a href={item.url} target="_blank" rel="noopener noreferrer" />
              }
            >
              {typeLabel(item.type)}
              <ExternalLink className="size-3" />
            </Button>
          </CardContent>
        </div>
      </div>
    </Card>
  );
}

export function NewspaperExplorer() {
  const [data, setData] = React.useState<NewspaperResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState("all");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/newspaper", { cache: "no-store" });
      const json = (await res.json()) as NewspaperResponse;
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/newspaper", { method: "POST" });
      const json = (await res.json()) as NewspaperResponse;
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const featured = data?.featured ?? [];
  const feed =
    tab === "all"
      ? (data?.feed ?? [])
      : (data?.feed ?? []).filter((i) => i.category === tab);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Newspaper className="size-6 text-emerald-500" />
            Newspaper
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Automated market news — global shocks, commodities, and Sri Lanka /
            CSE headlines that can move share prices. Sources refresh from public
            RSS feeds.
          </p>
          {data?.lastRefreshedAt ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Last updated {fmtDate(data.lastRefreshedAt)}
              {data.itemCount > 0 ? ` · ${data.itemCount} stories` : ""}
            </p>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => void onRefresh()}
          disabled={refreshing}
        >
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          {refreshing ? "Refreshing feeds & thumbnails…" : "Refresh feeds"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {/* Featured */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Flame className="size-5 text-amber-500" />
          <h2 className="text-lg font-semibold">Featured</h2>
          <span className="text-sm text-muted-foreground">
            Top geopolitics, oil & global market stories with the highest impact
          </span>
        </div>
        {loading && !data ? (
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-48 min-w-[280px] rounded-xl" />
            ))}
          </div>
        ) : featured.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {featured.map((item) => (
              <FeaturedCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No featured stories yet — click Refresh feeds to pull the latest
            headlines.
          </p>
        )}
      </section>

      {/* Feed */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-5 text-emerald-500" />
          <h2 className="text-lg font-semibold">Market feed</h2>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex h-auto flex-wrap gap-1">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="global" className="gap-1">
              <Globe2 className="size-3.5" />
              Global
            </TabsTrigger>
            <TabsTrigger value="local" className="gap-1">
              <MapPin className="size-3.5" />
              Local
            </TabsTrigger>
            <TabsTrigger value="commodities">Commodities</TabsTrigger>
            <TabsTrigger value="geopolitics">Geopolitics</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4">
            {loading && !data ? (
              <div className="grid gap-4 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 rounded-xl" />
                ))}
              </div>
            ) : feed.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {feed.map((item) => (
                  <FeedCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No stories in this category yet.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
