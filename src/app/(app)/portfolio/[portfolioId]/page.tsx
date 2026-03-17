import { PortfolioView } from "@/components/portfolio/portfolio-view";

export default async function PortfolioPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;

  return <PortfolioView portfolioId={portfolioId} />;
}
