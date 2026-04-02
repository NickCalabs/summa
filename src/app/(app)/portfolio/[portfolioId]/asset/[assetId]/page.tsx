import { AccountDetailView } from "@/components/portfolio/account-detail-view";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ portfolioId: string; assetId: string }>;
}) {
  const { portfolioId, assetId } = await params;

  return <AccountDetailView portfolioId={portfolioId} assetId={assetId} />;
}
