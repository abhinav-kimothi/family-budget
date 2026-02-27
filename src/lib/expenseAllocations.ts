import type {
  AllocationStartMode,
  ExpenseAllocationType,
} from "@/generated/enums";

export type AllocationLike = {
  id: number;
  year: number;
  month: number;
  categoryId: number;
  amount: number;
  type: ExpenseAllocationType;
  durationMonths: number | null;
  startMode: AllocationStartMode;
  recognitionStartYear?: number | null;
  recognitionStartMonth?: number | null;
  needTier?: "ESSENTIAL" | "NON_ESSENTIAL" | "TRAVEL" | "LUXURY" | null;
};

export type ExpenseNeedTier =
  | "ESSENTIAL"
  | "NON_ESSENTIAL"
  | "TRAVEL"
  | "LUXURY";

function monthIndex(year: number, month: number) {
  return year * 12 + (month - 1);
}

function fromMonthIndex(idx: number) {
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function durationMonthsForAllocation(
  type: ExpenseAllocationType,
  durationMonths: number | null,
) {
  if (type === "ANNUAL") return 12;
  if (type === "QUARTERLY") return 3;
  if (type === "IMMEDIATE") return 1;
  return Math.max(1, Number(durationMonths ?? 1));
}

export function startOffsetMonths(startMode: AllocationStartMode) {
  return startMode === "NEXT_MONTH" ? 1 : 0;
}

function allocationStartMonthIndex(allocation: AllocationLike) {
  return allocation.recognitionStartYear != null &&
    allocation.recognitionStartMonth != null
    ? monthIndex(allocation.recognitionStartYear, allocation.recognitionStartMonth)
    : monthIndex(allocation.year, allocation.month) + startOffsetMonths(allocation.startMode);
}

export function allocationContributionPerMonth(allocation: AllocationLike) {
  const duration = durationMonthsForAllocation(
    allocation.type,
    allocation.durationMonths,
  );
  return allocation.amount / duration;
}

export function buildAllocationMaps(allocations: AllocationLike[]) {
  const allocatedPaidMonthByCategory = new Map<string, number>();
  const recognizedContributionByCategoryMonth = new Map<string, number>();

  for (const a of allocations) {
    const paidKey = `${a.year}-${a.month}-${a.categoryId}`;
    allocatedPaidMonthByCategory.set(
      paidKey,
      (allocatedPaidMonthByCategory.get(paidKey) ?? 0) + a.amount,
    );

    const duration = durationMonthsForAllocation(a.type, a.durationMonths);
    const perMonth = a.amount / duration;
    const startIdx = allocationStartMonthIndex(a);

    for (let i = 0; i < duration; i += 1) {
      const { year, month } = fromMonthIndex(startIdx + i);
      const key = `${year}-${month}-${a.categoryId}`;
      recognizedContributionByCategoryMonth.set(
        key,
        (recognizedContributionByCategoryMonth.get(key) ?? 0) + perMonth,
      );
    }
  }

  return { allocatedPaidMonthByCategory, recognizedContributionByCategoryMonth };
}

export function buildAllocationTierMaps(allocations: AllocationLike[]) {
  const actualTierByMonth = new Map<string, number>();
  const recognizedTierByMonth = new Map<string, number>();

  for (const a of allocations) {
    if (!a.needTier) continue;

    const actualKey = `${a.year}-${a.month}-${a.needTier}`;
    actualTierByMonth.set(actualKey, (actualTierByMonth.get(actualKey) ?? 0) + a.amount);

    const duration = durationMonthsForAllocation(a.type, a.durationMonths);
    const perMonth = a.amount / duration;
    const startIdx = allocationStartMonthIndex(a);
    for (let i = 0; i < duration; i += 1) {
      const { year, month } = fromMonthIndex(startIdx + i);
      const recognizedKey = `${year}-${month}-${a.needTier}`;
      recognizedTierByMonth.set(
        recognizedKey,
        (recognizedTierByMonth.get(recognizedKey) ?? 0) + perMonth,
      );
    }
  }

  return { actualTierByMonth, recognizedTierByMonth };
}

export function recognizedExpenseForCategoryMonth(args: {
  year: number;
  month: number;
  categoryId: number;
  actualAmount: number;
  allocatedPaidMonthByCategory: Map<string, number>;
  recognizedContributionByCategoryMonth: Map<string, number>;
}) {
  const {
    year,
    month,
    categoryId,
    actualAmount,
    allocatedPaidMonthByCategory,
    recognizedContributionByCategoryMonth,
  } = args;
  const key = `${year}-${month}-${categoryId}`;
  const allocatedPaid = allocatedPaidMonthByCategory.get(key) ?? 0;
  const recognizedContrib = recognizedContributionByCategoryMonth.get(key) ?? 0;
  return actualAmount - allocatedPaid + recognizedContrib;
}
