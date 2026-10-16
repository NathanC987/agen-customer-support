"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { humanize } from "@/lib/ui-tokens";
import type { DashboardData } from "@/lib/agents/insights";

// Categorical palette validated with the dataviz validator (light & dark checked separately).
const volumeConfig = {
  auto: { label: "Auto-resolved by AI", theme: { light: "#6366f1", dark: "#6366f1" } },
  human: { label: "Resolved by human", theme: { light: "#14b8a6", dark: "#0d9488" } },
  escalatedOpen: { label: "Open / in progress", theme: { light: "#f59e0b", dark: "#d97706" } },
} satisfies ChartConfig;

export function VolumeChart({ data }: { data: DashboardData["daily"] }) {
  return (
    <ChartContainer config={volumeConfig} className="aspect-auto h-[260px] w-full">
      <BarChart data={data} margin={{ left: -16, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.5} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} fontSize={11} width={40} />
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltipContent indicator="dot" />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="auto" stackId="a" fill="var(--color-auto)" stroke="var(--card)" strokeWidth={2} maxBarSize={28} isAnimationActive={false} />
        <Bar dataKey="human" stackId="a" fill="var(--color-human)" stroke="var(--card)" strokeWidth={2} maxBarSize={28} isAnimationActive={false} />
        <Bar dataKey="escalatedOpen" stackId="a" fill="var(--color-escalatedOpen)" stroke="var(--card)" strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}

const intentConfig = { count: { label: "Conversations", color: "var(--chart-1)" } } satisfies ChartConfig;

export function IntentChart({ data }: { data: DashboardData["intents"] }) {
  const rows = data.map((d) => ({ ...d, label: humanize(d.intent) }));
  return (
    <ChartContainer config={intentConfig} className="aspect-auto h-[260px] w-full">
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" strokeOpacity={0.5} />
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={118} fontSize={11} />
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltipContent hideIndicator />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} label={{ position: "right", fontSize: 11, fill: "var(--muted-foreground)" }} />
      </BarChart>
    </ChartContainer>
  );
}
