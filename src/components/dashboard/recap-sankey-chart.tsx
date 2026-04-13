"use client";

import { useId, useMemo } from "react";
import {
  sankey,
  sankeyLinkHorizontal,
  type SankeyGraph,
  type SankeyLink,
  type SankeyNode,
} from "d3-sankey";
import { ChartEmpty } from "@/components/charts/chart-empty";
import type { Portfolio } from "@/hooks/use-portfolio";
import { formatCompactCurrency } from "@/lib/chart-utils";
import { useDisplayCurrency } from "@/contexts/display-currency-context";
import {
  buildPortfolioRecapFlow,
  type PortfolioRecapLink,
  type PortfolioRecapNode,
  type RecapFlowTone,
} from "@/lib/portfolio-utils";
import { cn } from "@/lib/utils";

interface RecapSankeyChartProps {
  portfolio: Portfolio;
  className?: string;
}

type SankeyNodeDatum = PortfolioRecapNode;

interface SankeyLinkDatum extends Omit<PortfolioRecapLink, "sourceId" | "targetId"> {
  source: string;
  target: string;
}

type RecapSankeyNode = SankeyNode<SankeyNodeDatum, SankeyLinkDatum>;
type RecapSankeyLink = SankeyLink<SankeyNodeDatum, SankeyLinkDatum>;
type RecapSankeyGraph = SankeyGraph<SankeyNodeDatum, SankeyLinkDatum>;

const VIEWBOX_WIDTH = 1180;
const VIEWBOX_HEIGHT = 420;
const CHART_EXTENT = {
  left: 210,
  top: 54,
  right: VIEWBOX_WIDTH - 170,
  bottom: VIEWBOX_HEIGHT - 26,
};

const COLUMN_INDEX: Record<PortfolioRecapNode["column"], number> = {
  source: 0,
  rollup: 1,
  summary: 2,
  final: 3,
};

const COLUMN_LABELS: Record<PortfolioRecapNode["column"], string> = {
  source: "Account groups",
  rollup: "Rollups",
  summary: "Balance sheet",
  final: "Outcome",
};

const NODE_SORT_ORDER = new Map<string, number>([
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
    mutedText: string;
    linkStart: string;
    linkEnd: string;
    badgeFill?: string;
    badgeStroke?: string;
  }
> = {
  cash: {
    nodeFill: "#8fc681",
    nodeStroke: "#78b06a",
    text: "#e3f1dc",
    mutedText: "#9ac88f",
    linkStart: "#87bf79",
    linkEnd: "#b6dca8",
  },
  investment: {
    nodeFill: "#5db9c4",
    nodeStroke: "#4298a3",
    text: "#d9fbff",
    mutedText: "#97dde4",
    linkStart: "#4ea8b4",
    linkEnd: "#8fd1d8",
  },
  realAsset: {
    nodeFill: "#c59a62",
    nodeStroke: "#b1834f",
    text: "#f9ecd8",
    mutedText: "#e1bf93",
    linkStart: "#c18f50",
    linkEnd: "#dcc19b",
  },
  otherAsset: {
    nodeFill: "#7f93ae",
    nodeStroke: "#697d98",
    text: "#ebf1fb",
    mutedText: "#a9b7cb",
    linkStart: "#788ca7",
    linkEnd: "#bcc7d6",
  },
  asset: {
    nodeFill: "#9db5d1",
    nodeStroke: "#6f89a8",
    text: "#ecf4ff",
    mutedText: "#b9cae0",
    linkStart: "#88a4c4",
    linkEnd: "#a9bfd8",
    badgeFill: "#172133",
    badgeStroke: "#31496f",
  },
  debt: {
    nodeFill: "#f28e89",
    nodeStroke: "#e36e69",
    text: "#fff4f3",
    mutedText: "#f3b6b2",
    linkStart: "#e47f7b",
    linkEnd: "#f2c2be",
    badgeFill: "#2b1719",
    badgeStroke: "#965754",
  },
  netWorth: {
    nodeFill: "#4f79d8",
    nodeStroke: "#4168bf",
    text: "#eef3ff",
    mutedText: "#a9bee9",
    linkStart: "#6087e1",
    linkEnd: "#33518f",
    badgeFill: "#121c33",
    badgeStroke: "#3658aa",
  },
};

export function RecapSankeyChart({
  portfolio,
  className,
}: RecapSankeyChartProps) {
  // TODO: Bring this much closer to Kubera's actual recap flow treatment:
  // slimmer bars, better whitespace, subtler labels, and a more faithful
  // Assets -> Net Worth / Debts split on the right side.
  const flow = useMemo(() => buildPortfolioRecapFlow(portfolio), [portfolio]);
  const chart = useMemo(() => buildChart(flow.nodes, flow.links), [flow]);
  const gradientPrefix = useId().replace(/:/g, "");

  if (chart.nodes.length === 0 || chart.links.length === 0) {
    return (
      <div className={cn("h-[420px]", className)}>
        <ChartEmpty />
      </div>
    );
  }

  const headings = buildHeadings(chart.nodes);
  const linkPath = sankeyLinkHorizontal<SankeyNodeDatum, SankeyLinkDatum>();

  return (
    <div className={cn("space-y-3", className)}>
      <div className="overflow-x-auto rounded-[24px] border border-[#202938] bg-[#11161f] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <svg
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          className="h-[420px] min-w-[1040px] w-full"
          role="img"
          aria-label="Recap flow chart showing account groups feeding rollups, balance sheet, and outcome"
        >
          <defs>
            {chart.links.map((link, index) => {
              const gradientId = `${gradientPrefix}-link-${index}`;
              const style = resolveLinkStyle(link);
              const sourceNode = getSourceNode(link);
              const targetNode = getTargetNode(link);
              return (
                <linearGradient
                  key={gradientId}
                  id={gradientId}
                  gradientUnits="userSpaceOnUse"
                  x1={sourceNode.x1 ?? 0}
                  y1={0}
                  x2={targetNode.x0 ?? 0}
                  y2={0}
                >
                  <stop offset="0%" stopColor={style.linkStart} />
                  <stop offset="100%" stopColor={style.linkEnd} />
                </linearGradient>
              );
            })}
          </defs>

          {headings.map((heading) => (
            <text
              key={heading.column}
              x={heading.x}
              y={20}
              fill="#8a93a3"
              fontSize="11"
              fontWeight="600"
              letterSpacing="0.18em"
            >
              {heading.label.toUpperCase()}
            </text>
          ))}

          <g fill="none">
            {chart.links.map((link, index) => {
              const gradientId = `${gradientPrefix}-link-${index}`;
              return (
                <path
                  key={link.index ?? link.id}
                  d={linkPath(link) ?? ""}
                  stroke={`url(#${gradientId})`}
                  strokeOpacity={link.opacity}
                  strokeWidth={Math.max(1.5, link.width ?? 1.5)}
                />
              );
            })}
          </g>

          <g>
            {chart.nodes.map((node) => (
              <g key={node.id}>
                <rect
                  x={node.x0}
                  y={node.y0}
                  width={(node.x1 ?? 0) - (node.x0 ?? 0)}
                  height={Math.max(2, (node.y1 ?? 0) - (node.y0 ?? 0))}
                  rx={4}
                  fill={TONE_STYLES[node.tone].nodeFill}
                  stroke={TONE_STYLES[node.tone].nodeStroke}
                  strokeWidth={1}
                />
                <NodeLabel node={node} currency={portfolio.currency} btcUsdRate={portfolio.btcUsdRate} />
              </g>
            ))}
          </g>
        </svg>
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        Liabilities remain on their own debt rail even when they were entered in
        asset sheets, so recap flow and net worth stay aligned.
      </p>
    </div>
  );
}

function NodeLabel({
  node,
  currency,
  btcUsdRate,
}: {
  node: RecapSankeyNode;
  currency: string;
  btcUsdRate: number | null;
}) {
  const { convert, formatCompact: dcFormatCompact, displayCurrency } = useDisplayCurrency();
  const x0 = node.x0 ?? 0;
  const x1 = node.x1 ?? 0;
  const y0 = node.y0 ?? 0;
  const y1 = node.y1 ?? 0;
  const centerY = (y0 + y1) / 2;
  const rawValue = node.value ?? 0;
  const converted = displayCurrency === "USD" ? rawValue : convert(rawValue, btcUsdRate);
  const amount = displayCurrency === "USD"
    ? formatCompactCurrency(converted, currency)
    : dcFormatCompact(converted);

  if (node.column === "final") {
    return (
      <BadgeLabel
        x={x1 + 14}
        y={centerY - 20}
        label={node.label}
        value={amount}
        tone={node.tone}
      />
    );
  }

  if (node.column === "summary") {
    return (
      <BadgeLabel
        x={x0 + 18}
        y={y0 + 12}
        label={node.label}
        value={amount}
        tone={node.tone}
        compact
      />
    );
  }

  const labelX = x0 - 12;
  const style = TONE_STYLES[node.tone];

  return (
    <g>
      <text
        x={labelX}
        y={centerY - 5}
        fill={style.text}
        fontSize="11"
        fontWeight="600"
        textAnchor="end"
      >
        {node.label}
      </text>
      <text
        x={labelX}
        y={centerY + 11}
        fill={style.mutedText}
        fontSize="10.5"
        textAnchor="end"
      >
        {amount}
      </text>
    </g>
  );
}

function BadgeLabel({
  x,
  y,
  label,
  value,
  tone,
  compact = false,
}: {
  x: number;
  y: number;
  label: string;
  value: string;
  tone: RecapFlowTone;
  compact?: boolean;
}) {
  const style = TONE_STYLES[tone];
  const width = estimateBadgeWidth(Math.max(label.length, value.length), compact);
  const height = compact ? 42 : 56;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={12}
        fill={style.badgeFill ?? "#151b25"}
        stroke={style.badgeStroke ?? style.nodeStroke}
        strokeWidth={1}
      />
      <text x={x + 12} y={y + 20} fill={style.text} fontSize="11" fontWeight="600">
        {label}
      </text>
      <text x={x + 12} y={y + 38} fill={style.text} fontSize="12.5" fontWeight="700">
        {value}
      </text>
    </g>
  );
}

function buildChart(
  nodes: PortfolioRecapNode[],
  links: PortfolioRecapLink[]
): { nodes: RecapSankeyNode[]; links: Array<RecapSankeyLink & { id: string; opacity: number }> } {
  const graphNodes = nodes.map((node) => ({ ...node }));
  const graphLinks = links.map((link) => ({
    id: link.id,
    source: link.sourceId,
    target: link.targetId,
    value: link.value,
    tone: link.tone,
  }));

  const layout = sankey<SankeyNodeDatum, SankeyLinkDatum>()
    .nodeId((node: SankeyNodeDatum) => node.id)
    .nodeWidth(10)
    .nodePadding(22)
    .nodeAlign((node: SankeyNodeDatum, depth: number) =>
      Math.min(COLUMN_INDEX[node.column], depth - 1)
    )
    .nodeSort((left: SankeyNodeDatum, right: SankeyNodeDatum) =>
      compareNodes(left, right)
    )
    .iterations(64)
    .extent([
      [CHART_EXTENT.left, CHART_EXTENT.top],
      [CHART_EXTENT.right, CHART_EXTENT.bottom],
    ]);

  const graph = layout({
    nodes: graphNodes,
    links: graphLinks,
  } as RecapSankeyGraph);

  return {
    nodes: graph.nodes,
    links: graph.links.map((link: RecapSankeyLink) => ({
      ...link,
      id: link.id,
      opacity: resolveLinkOpacity(link),
    })),
  };
}

function buildHeadings(nodes: RecapSankeyNode[]) {
  return (
    Object.entries(COLUMN_LABELS) as Array<
      [PortfolioRecapNode["column"], string]
    >
  ).map(([column, label]) => {
    const columnNodes = nodes.filter((node) => node.column === column);
    const minX =
      columnNodes.length > 0
        ? Math.min(...columnNodes.map((node) => node.x0 ?? CHART_EXTENT.left))
        : CHART_EXTENT.left;

    return {
      column,
      label,
      x: minX - (column === "final" ? 4 : 0),
    };
  });
}

function compareNodes(left: SankeyNodeDatum, right: SankeyNodeDatum) {
  const leftColumn = COLUMN_INDEX[left.column];
  const rightColumn = COLUMN_INDEX[right.column];
  if (leftColumn !== rightColumn) return leftColumn - rightColumn;

  const leftOrder = NODE_SORT_ORDER.get(left.id);
  const rightOrder = NODE_SORT_ORDER.get(right.id);
  if (leftOrder !== undefined || rightOrder !== undefined) {
    return (leftOrder ?? 99) - (rightOrder ?? 99);
  }

  if (left.column === "source") {
    if (left.tone === "debt" && right.tone !== "debt") return 1;
    if (right.tone === "debt" && left.tone !== "debt") return -1;
  }

  return (right.value ?? 0) - (left.value ?? 0);
}

function resolveLinkStyle(link: RecapSankeyLink) {
  const sourceTone = getSourceNode(link).tone;
  const targetTone = getTargetNode(link).tone;
  return {
    linkStart: TONE_STYLES[sourceTone].linkStart,
    linkEnd: TONE_STYLES[targetTone].linkEnd,
  };
}

function resolveLinkOpacity(link: RecapSankeyLink) {
  if (link.tone === "debt") return 0.78;
  if (link.tone === "netWorth") return 0.85;
  if (getTargetNode(link).column === "summary") return 0.68;
  return 0.62;
}

function estimateBadgeWidth(charCount: number, compact: boolean) {
  return Math.max(compact ? 112 : 132, charCount * (compact ? 7.4 : 8.2) + 34);
}

function getSourceNode(link: RecapSankeyLink) {
  return link.source as RecapSankeyNode;
}

function getTargetNode(link: RecapSankeyLink) {
  return link.target as RecapSankeyNode;
}
