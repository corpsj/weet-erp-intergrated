import type { ProcessPresetItem } from "@/lib/types";

export type CostTotals = {
  material: number;
  labor: number;
  expense: number;
};

export type RateValue = {
  type: "percent" | "fixed";
  value: number;
};

export type EstimateBreakdown = {
  subtotal: number;
  generalAdmin: number;
  salesProfit: number;
  vat: number;
  total: number;
  totals: CostTotals;
};

export function sumPresetItems(items: ProcessPresetItem[]) {
  return items.reduce<CostTotals>(
    (acc, item) => {
      const lineTotal = item.quantity * item.unit_cost;
      if (item.cost_category === "material") acc.material += lineTotal;
      if (item.cost_category === "labor") acc.labor += lineTotal;
      if (item.cost_category === "expense") acc.expense += lineTotal;
      return acc;
    },
    { material: 0, labor: 0, expense: 0 }
  );
}

export function calculateEstimate(
  totals: CostTotals,
  generalAdmin: RateValue,
  salesProfit: RateValue,
  vatRate: number
): EstimateBreakdown {
  const subtotal = totals.material + totals.labor + totals.expense;
  const generalAdminAmount =
    generalAdmin.type === "percent"
      ? (subtotal * generalAdmin.value) / 100
      : generalAdmin.value;
  const profitBase = subtotal + generalAdminAmount;
  const salesProfitAmount =
    salesProfit.type === "percent"
      ? (profitBase * salesProfit.value) / 100
      : salesProfit.value;
  const vatBase = profitBase + salesProfitAmount;
  const vatAmount = (vatBase * vatRate) / 100;
  const total = vatBase + vatAmount;

  return {
    subtotal,
    generalAdmin: generalAdminAmount,
    salesProfit: salesProfitAmount,
    vat: vatAmount,
    total,
    totals,
  };
}
