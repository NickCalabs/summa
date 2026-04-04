import {
  Building2Icon,
  TrendingUpIcon,
  WalletIcon,
  HomeIcon,
  CarIcon,
  GemIcon,
  PencilIcon,
  UploadIcon,
  CreditCardIcon,
  LandmarkIcon,
} from "lucide-react";

export interface CategoryOption {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
}

export const ASSET_CATEGORIES: CategoryOption[] = [
  {
    id: "plaid",
    label: "Banks & Brokerages",
    description: "Connect via Plaid or SimpleFIN",
    icon: Building2Icon,
  },
  {
    id: "ticker",
    label: "Stock & Fund Tickers",
    description: "Search by ticker symbol",
    icon: TrendingUpIcon,
  },
  {
    id: "crypto",
    label: "Crypto Wallets & Exchanges",
    description: "Track wallet or exchange",
    icon: WalletIcon,
  },
  {
    id: "real_estate",
    label: "Real Estate",
    description: "Property value tracking",
    icon: HomeIcon,
  },
  {
    id: "vehicle",
    label: "Vehicles",
    description: "Vehicle value",
    icon: CarIcon,
  },
  {
    id: "precious_metals",
    label: "Precious Metals",
    description: "Gold, silver, etc.",
    icon: GemIcon,
  },
  {
    id: "manual",
    label: "Manual Asset",
    description: "Enter value or qty x price",
    icon: PencilIcon,
  },
  {
    id: "csv",
    label: "CSV Import",
    description: "Bulk import from spreadsheet",
    icon: UploadIcon,
  },
];

export const DEBT_CATEGORIES: CategoryOption[] = [
  {
    id: "plaid",
    label: "Loans & Mortgages",
    description: "Connect via Plaid or SimpleFIN",
    icon: LandmarkIcon,
  },
  {
    id: "plaid_cc",
    label: "Credit Cards",
    description: "Connect via Plaid or SimpleFIN",
    icon: CreditCardIcon,
  },
  {
    id: "manual",
    label: "Manual Debt",
    description: "Enter balance manually",
    icon: PencilIcon,
  },
  {
    id: "csv",
    label: "CSV Import",
    description: "Bulk import from spreadsheet",
    icon: UploadIcon,
  },
];
