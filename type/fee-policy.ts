export interface FeePolicy {
  id: string;
  version: number;
  bca_fee: number;
  sumsel_fee: number;
  other_fee: number;
  confirmed: boolean;
  effective_from: string;
  effective_until: string | null;
  confirmed_by?: string;
  confirmed_at?: string;
}

export interface FeePolicyInput {
  bca_fee: number;
  sumsel_fee: number;
  other_fee: number;
  effective_from: string;
  effective_until: string | null;
}
