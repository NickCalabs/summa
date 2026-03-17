import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MoneyDisplay } from "@/components/portfolio/money-display";

interface StatCardProps {
  title: string;
  value: number;
  currency: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}

export function StatCard({ title, value, currency, subtitle, children }: StatCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <MoneyDisplay
          amount={value}
          currency={currency}
          className="text-2xl font-bold tabular-nums"
        />
        {subtitle && (
          <div className="text-sm text-muted-foreground">{subtitle}</div>
        )}
        {children && <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">{children}</div>}
      </CardContent>
    </Card>
  );
}
