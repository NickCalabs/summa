"use client";

import { useId, useMemo } from "react";
import { ChartEmpty } from "@/components/charts/chart-empty";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import type { Portfolio } from "@/hooks/use-portfolio";
import { formatCompactCurrency } from "@/lib/chart-utils";
import {
  buildPortfolioRecapFlow,
  type PortfolioRecapFlow,
  type PortfolioRecapLink,
  type PortfolioRecapNode,
  type RecapFlowTone,
} from "@/lib/portfolio-utils";
import { cn } from "@/lib/utils";

interface RecapSankeyChartProps {
  portfolio: Portfolio;
  className?: string;
}

interface LayoutNode extends PortfolioRecapNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutLink extends PortfolioRecapLink {
  source: LayoutNode;
  target: LayoutNode;
  sourceY: number;
  targetY: number;
  height: number;
}

const VIEWBOX_WIDTH = 1180;
const VIEWBOX_HEIGHT = 430;
const CHART_TOP = 42;
const CHART_BOTTOM = 22;
const NODE_GAP = 14;

const COLUMN_ORDER: Array<PortfolioRecapNode["column"]> = [
  "source",
  "rollup",
  "summary",
  "final",
];

const COLUMN_LAYOUT: Record<
  PortfolioRecapNode["column"],
  { x: number; width: number; label: string }
> = {
  source: { x: 24, width: 176, label: "Account groups" },
  rollup: { x: 306, width: 156, label: "Rollups" },
  summary: { x: 582, width: 166, label: "Balance sheet" },
  final: { x: 918, width: 238, label: "Outcome" },
};

const NODE_ORDER = new Map<string, number>([
  ["rollup:cash", 0],
  ["rollup:investments", 1],
  ["rollup:realAssets", 2],
  ["rollup:otherAssets", 3],
  ["rollup:debts", 4],
  ["summary:assets", 0],
  ["summary:debts", 1],
  ["final:netWorth", 0],
  ["final:debts", 1],
]);

const TONE_STYLES: Record<
  RecapFlowTone,
  {
    nodeFill: string;
    nodeStroke: string;
    text: string;
    subtleText: string;
    linkStart: string;
    linkEnd: string;
    linkOpacity: number;
  }
> = {
  cash: {
    nodeFill: "#dcebd5",
    nodeStroke: "#8cb17b",
    text: "#22331d",
    subtleText: "#496144",
    linkStart: "#b9d9ad",
    linkEnd: "#dcebd5",
    linkOpacity: 0.82,
  },
  investment: {
    nodeFill: "#d7e3ff",
    nodeStroke: "#6b8ef7",
    text: "#10203f",
    subtleText: "#405680",
    linkStart: "#8aa9ff",
    linkEnd: "#d7e3ff",
    linkOpacity: 0.84,
  },
  realAsset: {
    nodeFill: "#e7ddcf",
    nodeStroke: "#b79361",
    text: "#372716",
    subtleText: "#6b543b",
    linkStart: "#c7ab82",
    linkEnd: "#e7ddcf",
    linkOpacity: 0.82,
  },
  otherAsset: {
    nodeFill: "#e2e6ee",
    nodeStroke: "#93a1b7",
    text: "#1f2837",
    subtleText: "#4d5a6c",
    linkStart: "#b4bfce",
    linkEnd: "#e2e6ee",
    linkOpacity: 0.8,
  },
  asset: {
    nodeFill: "#172033",
    nodeStroke: "#2b3b5d",
    text: "#f6f8fb",
    subtleText: "#9dabc5",
    linkStart: "#506382",
    linkEnd: "#172033",
    linkOpacity: 0.86,
  },
  debt: {
    nodeFill: "#fde0dd",
    nodeStroke: "#d96b68",
    text: "#4a1718",
    subtleText: "#8a4546",
    linkStart: "#eb908d",
    linkEnd: "#fde0dd",
    linkOpacity: 0.88,
  },
  netWorth: {
    nodeFill: "#101a2f",
    nodeStroke: "#3e5ca9",
    text: "#f7f9fc",
    subtleText: "#99acdd",
    linkStart: "#678dff",
    linkEnd: "#101a2f",
    linkOpacity: 0.9,
  },
};

export function RecapSankeyChart({
  portfolio,
  className,
}: RecapSankeyChartProps) {
  const flow = useMemo(() => buildPortfolioRecapFlow(portfolio), [portfolio]);
  const layout = useMemo(() => buildLayout(flow), [flow]);
  const gradientPrefix = useId().replace(/:/g, "");

  if (layout.nodes.length === 0 || layout.links.length === 0) {
    return (
      <div className={cn("h-[420px]", className)}>
        <ChartEmpty />
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)}>
      <div className="overflow-hidden rounded-[24px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.64))] px-3 py-3 dark:bg-[linear-gradient(180deg,rgba(21,26,36,0.94),rgba(16,20,28,0.92))]">
        <svg
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          className="h-[420px] w-full"
          role="img"
          aria-label="Recap flow chart showing account groups feeding assets, debts, and net worth"
        >
          <defs>
            {layout.links.map((link, index) => {
              const gradientId = `${gradientPrefix}-link-${index}`;
              const style = TONE_STYLES[link.tone];
              return (
                <linearGradient
                  key={gradientId}
                  id={gradientId}
                  gradientUnits="userSpaceOnUse"
                  x1={link.source.x + link.source.width}
                  y1={0}
                  x2={link.target.x}
                  y2={0}
                >
                  <stop offset="0%" stopColor={style.linkStart} />
                  <stop offset="100%" stopColor={style.linkEnd} />
                </linearGradient>
              );
            })}
          </defs>

          {COLUMN_ORDER.map((column) => {
            const meta = COLUMN_LAYOUT[column];
            return (
              <g key={column}>
                <text
                  x={meta.x}
                  y={18}
                  fill="var(--muted-foreground)"
                  fontSize="11"
                  fontWeight="600"
                  letterSpacing="0.18em"
                >
                  {meta.label.toUpperCase()}
                </text>
              </g>
            );
          })}

          <g>
            {layout.links.map((link, index) => {
              const gradientId = `${gradientPrefix}-link-${index}`;
              return (
                <path
                  key={link.id}
                  d={buildLinkPath(link)}
                  fill={`url(#${gradientId})`}
                  fillOpacity={TONE_STYLES[link.tone].linkOpacity}
                />
              );
            })}
          </g>

          <g>
            {layout.nodes.map((node) => (
              <RecapNode
                key={node.id}
                node={node}
                portfolio={portfolio}
                debtDrag={
                  node.id === "summary:assets" ? flow.totals.debtDrag : undefined
                }
                scale={layout.scale}
              />
            ))}
          </g>
        </svg>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <MetricCard
          label="Assets"
          value={flow.totals.totalAssets}
          currency={portfolio.currency}
          detail="Gross positive holdings flowing through the recap."
        />
        <MetricCard
          label="Debts"
          value={flow.totals.totalDebts}
          currency={portfolio.currency}
          detail="Liabilities stay on the debt rail even when miscategorized."
          tone="debt"
        />
        <MetricCard
          label="Net worth"
          value={flow.totals.netWorth}
          currency={portfolio.currency}
          detail="Assets after subtracting debt load."
          tone="netWorth"
        />
      </div>

      {flow.totals.netWorth <= 0 ? (
        <div className="rounded-2xl border border-[#d96b68]/40 bg-[#fde0dd]/35 px-4 py-3 text-sm text-[#5d2325] dark:bg-[#5d2325]/15 dark:text-[#f3c6c5]">
          Debts currently exceed assets by{" "}
          <span className="font-medium tabular-nums">
            <MoneyDisplay
              amount={Math.abs(flow.totals.netWorth)}
              currency={portfolio.currency}
            />
          </span>
          . The recap keeps liabilities separated on the debt rail so the shortfall is
          visible instead of inflating assets.
        </div>
      ) : null}
    </div>
  );
}

function RecapNode({
  node,
  portfolio,
  debtDrag,
  scale,
}: {
  node: LayoutNode;
  portfolio: Portfolio;
  debtDrag?: number;
  scale: number;
}) {
  const style = TONE_STYLES[node.tone];
  const labelY = node.y + 18;
  const compactValue = formatCompactCurrency(node.value, portfolio.currency);
  const canShowValue = node.height >= 46;
  const canShowDetail = node.height >= 64 && !!node.detail;
  const useExternalLabel = node.height < 30;

  return (
    <g>
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={Math.max(node.height, 2)}
        rx={14}
        fill={style.nodeFill}
        stroke={style.nodeStroke}
        strokeWidth={1.2}
      />

      {node.id === "summary:assets" && debtDrag && debtDrag > 0 ? (
        <DebtDragInset node={node} debtDrag={debtDrag} scale={scale} currency={portfolio.currency} />
      ) : null}

      {useExternalLabel ? (
        <g>
          <text
            x={node.x + node.width + 10}
            y={node.y + node.height / 2 - 2}
            fill={style.text}
            fontSize="11"
            fontWeight="600"
          >
            {node.label}
          </text>
          <text
            x={node.x + node.width + 10}
            y={node.y + node.height / 2 + 12}
            fill={style.subtleText}
            fontSize="10"
          >
            {compactValue}
          </text>
        </g>
      ) : (
        <g>
          <text x={node.x + 12} y={labelY} fill={style.text} fontSize="11" fontWeight="600">
            {node.label}
          </text>
          {canShowValue ? (
            <text
              x={node.x + 12}
              y={labelY + 16}
              fill={style.text}
              fontSize="12"
              fontWeight="700"
            >
              {compactValue}
            </text>
          ) : null}
          {canShowDetail ? (
            <text
              x={node.x + 12}
              y={labelY + 32}
              fill={style.subtleText}
              fontSize="10.5"
            >
              {node.detail}
            </text>
          ) : null}
        </g>
      )}
    </g>
  );
}

function DebtDragInset({
  node,
  debtDrag,
  scale,
  currency,
}: {
  node: LayoutNode;
  debtDrag: number;
  scale: number;
  currency: string;
}) {
  const height = Math.max(Math.min(debtDrag * scale, node.height - 6), 10);
  const y = node.y + node.height - height;
  const canShowLabel = height >= 24;

  return (
    <g>
      <rect
        x={node.x + 2}
        y={y}
        width={node.width - 4}
        height={height - 2}
        rx={12}
        fill="#f7cdcb"
        fillOpacity={0.9}
      />
      {canShowLabel ? (
        <text
          x={node.x + 12}
          y={y + Math.min(height - 8, 18)}
          fill="#6b2325"
          fontSize="10.5"
          fontWeight="600"
        >
          Debt drag {formatCompactCurrency(debtDrag, currency)}
        </text>
      ) : null}
    </g>
  );
}

function MetricCard({
  label,
  value,
  currency,
  detail,
  tone = "asset",
}: {
  label: string;
  value: number;
  currency: string;
  detail: string;
  tone?: "asset" | "debt" | "netWorth";
}) {
  const accents = {
    asset: "border-border/70 bg-background/75",
    debt: "border-[#d96b68]/35 bg-[#fde0dd]/35 dark:bg-[#5d2325]/10",
    netWorth: "border-[#3e5ca9]/35 bg-[#e6eeff]/45 dark:bg-[#101a2f]/40",
  }[tone];

  return (
    <div className={cn("rounded-2xl border px-4 py-3", accents)}>
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold tracking-tight tabular-nums">
        <MoneyDisplay amount={value} currency={currency} />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function buildLayout(flow: PortfolioRecapFlow) {
  const columns = new Map<
    PortfolioRecapNode["column"],
    PortfolioRecapNode[]
  >();
  for (const column of COLUMN_ORDER) columns.set(column, []);

  for (const node of flow.nodes) {
    columns.get(node.column)?.push(node);
  }

  for (const [column, nodes] of columns) {
    nodes.sort((left, right) => {
      const leftOrder = NODE_ORDER.get(left.id);
      const rightOrder = NODE_ORDER.get(right.id);
      if (leftOrder !== undefined || rightOrder !== undefined) {
        return (leftOrder ?? 99) - (rightOrder ?? 99);
      }
      if (column === "source") {
        if (left.tone === "debt" && right.tone !== "debt") return 1;
        if (right.tone === "debt" && left.tone !== "debt") return -1;
      }
      return right.value - left.value;
    });
  }

  const chartHeight = VIEWBOX_HEIGHT - CHART_TOP - CHART_BOTTOM;
  const scale = Math.min(
    ...COLUMN_ORDER.map((column) => {
      const nodes = columns.get(column) ?? [];
      if (nodes.length === 0) return Infinity;
      const total = nodes.reduce((sum, node) => sum + node.value, 0);
      if (total <= 0) return Infinity;
      return (chartHeight - NODE_GAP * (nodes.length - 1)) / total;
    }).filter((value) => Number.isFinite(value))
  );

  const layoutNodes = new Map<string, LayoutNode>();

  for (const column of COLUMN_ORDER) {
    const nodes = columns.get(column) ?? [];
    if (nodes.length === 0) continue;

    const totalHeight =
      nodes.reduce((sum, node) => sum + node.value * scale, 0) +
      NODE_GAP * (nodes.length - 1);
    let y = CHART_TOP + Math.max((chartHeight - totalHeight) / 2, 0);

    for (const node of nodes) {
      const meta = COLUMN_LAYOUT[column];
      const height = Math.max(node.value * scale, 2);
      layoutNodes.set(node.id, {
        ...node,
        x: meta.x,
        y,
        width: meta.width,
        height,
      });
      y += height + NODE_GAP;
    }
  }

  const outgoingOffsets = new Map<string, number>();
  const incomingOffsets = new Map<string, number>();
  const links = [...flow.links].sort((left, right) => {
    const leftSource = layoutNodes.get(left.sourceId);
    const rightSource = layoutNodes.get(right.sourceId);
    if (!leftSource || !rightSource) return 0;
    return leftSource.y - rightSource.y;
  });

  const layoutLinks: LayoutLink[] = [];
  for (const link of links) {
    const source = layoutNodes.get(link.sourceId);
    const target = layoutNodes.get(link.targetId);
    if (!source || !target) continue;

    const height = Math.max(link.value * scale, 1.5);
    const sourceY = source.y + (outgoingOffsets.get(source.id) ?? 0);
    const targetY = target.y + (incomingOffsets.get(target.id) ?? 0);

    outgoingOffsets.set(source.id, (outgoingOffsets.get(source.id) ?? 0) + height);
    incomingOffsets.set(target.id, (incomingOffsets.get(target.id) ?? 0) + height);

    layoutLinks.push({
      ...link,
      source,
      target,
      sourceY,
      targetY,
      height,
    });
  }

  return {
    nodes: [...layoutNodes.values()],
    links: layoutLinks,
    scale,
  };
}

function buildLinkPath(link: LayoutLink) {
  const x0 = link.source.x + link.source.width;
  const x1 = link.target.x;
  const y0 = link.sourceY;
  const y1 = link.targetY;
  const y0Bottom = y0 + link.height;
  const y1Bottom = y1 + link.height;
  const curve = Math.min(120, (x1 - x0) * 0.45);

  return [
    `M ${x0} ${y0}`,
    `C ${x0 + curve} ${y0} ${x1 - curve} ${y1} ${x1} ${y1}`,
    `L ${x1} ${y1Bottom}`,
    `C ${x1 - curve} ${y1Bottom} ${x0 + curve} ${y0Bottom} ${x0} ${y0Bottom}`,
    "Z",
  ].join(" ");
}
