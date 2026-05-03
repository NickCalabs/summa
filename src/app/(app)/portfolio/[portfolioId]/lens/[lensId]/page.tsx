import { LensDetailView } from "@/components/lenses/lens-detail-view";

export default async function LensDetailPage({
  params,
}: {
  params: Promise<{ portfolioId: string; lensId: string }>;
}) {
  const { portfolioId, lensId } = await params;
  return <LensDetailView portfolioId={portfolioId} lensId={lensId} />;
}
