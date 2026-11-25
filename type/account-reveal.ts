
export interface RevealAccountNumbersRequest {
  account_ids: string[];
}

export interface RevealedAccountNumber {
  id: string;
  employee_id: string;
  account_number: string;
}
