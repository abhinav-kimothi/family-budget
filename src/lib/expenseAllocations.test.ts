import { describe, expect, it } from "vitest";
import {
  allocationContributionPerMonth,
  buildAllocationMaps,
  buildAllocationTierMaps,
  durationMonthsForAllocation,
  recognizedExpenseForCategoryMonth,
  startOffsetMonths,
  type AllocationLike,
} from "@/lib/expenseAllocations";

function allocation(overrides: Partial<AllocationLike>): AllocationLike {
  return {
    id: 1,
    year: 2026,
    month: 2,
    categoryId: 100,
    amount: 0,
    type: "IMMEDIATE" as AllocationLike["type"],
    durationMonths: null,
    startMode: "THIS_MONTH" as AllocationLike["startMode"],
    recognitionStartYear: null,
    recognitionStartMonth: null,
    needTier: null,
    ...overrides,
  };
}

describe("expenseAllocations math", () => {
  it("returns correct duration by allocation type", () => {
    expect(durationMonthsForAllocation("ANNUAL" as any, null)).toBe(12);
    expect(durationMonthsForAllocation("QUARTERLY" as any, null)).toBe(3);
    expect(durationMonthsForAllocation("IMMEDIATE" as any, null)).toBe(1);
    expect(durationMonthsForAllocation("CUSTOM" as any, 6)).toBe(6);
    expect(durationMonthsForAllocation("CUSTOM" as any, 0)).toBe(1);
    expect(durationMonthsForAllocation("CUSTOM" as any, null)).toBe(1);
  });

  it("returns correct start offset", () => {
    expect(startOffsetMonths("THIS_MONTH" as any)).toBe(0);
    expect(startOffsetMonths("NEXT_MONTH" as any)).toBe(1);
  });

  it("calculates per-month contribution", () => {
    const annual = allocation({
      amount: 12000,
      type: "ANNUAL" as any,
    });
    expect(allocationContributionPerMonth(annual)).toBe(1000);

    const custom = allocation({
      amount: 900,
      type: "CUSTOM" as any,
      durationMonths: 3,
    });
    expect(allocationContributionPerMonth(custom)).toBe(300);
  });

  it("builds paid and recognized maps with start-month logic", () => {
    const allocations: AllocationLike[] = [
      allocation({
        id: 1,
        year: 2026,
        month: 3,
        categoryId: 1,
        amount: 12000,
        type: "ANNUAL" as any,
        startMode: "THIS_MONTH" as any,
      }),
      allocation({
        id: 2,
        year: 2026,
        month: 2,
        categoryId: 1,
        amount: 300,
        type: "QUARTERLY" as any,
        startMode: "NEXT_MONTH" as any, // Mar-May
      }),
      allocation({
        id: 3,
        year: 2026,
        month: 2,
        categoryId: 1,
        amount: 90,
        type: "CUSTOM" as any,
        durationMonths: 3,
        recognitionStartYear: 2026, // explicit start overrides startMode
        recognitionStartMonth: 6, // Jun-Aug
      }),
    ];

    const maps = buildAllocationMaps(allocations);

    // paid-in-month tracking
    expect(maps.allocatedPaidMonthByCategory.get("2026-3-1")).toBe(12000);
    expect(maps.allocatedPaidMonthByCategory.get("2026-2-1")).toBe(390);

    // recognized contributions
    expect(maps.recognizedContributionByCategoryMonth.get("2026-3-1")).toBeCloseTo(
      1100,
      6,
    ); // 1000 annual + 100 quarterly
    expect(maps.recognizedContributionByCategoryMonth.get("2026-4-1")).toBeCloseTo(
      1100,
      6,
    );
    expect(maps.recognizedContributionByCategoryMonth.get("2026-5-1")).toBeCloseTo(
      1100,
      6,
    );
    expect(maps.recognizedContributionByCategoryMonth.get("2026-6-1")).toBeCloseTo(
      1030,
      6,
    ); // annual + custom
    expect(maps.recognizedContributionByCategoryMonth.get("2026-8-1")).toBeCloseTo(
      1030,
      6,
    );
  });

  it("calculates recognized month expense as actual - paid + recognized", () => {
    // Example: March actual 70,000 with 12,000 annual tagged in March.
    const maps = buildAllocationMaps([
      allocation({
        id: 1,
        year: 2026,
        month: 3,
        categoryId: 7,
        amount: 12000,
        type: "ANNUAL" as any,
      }),
    ]);

    const recognizedMarch = recognizedExpenseForCategoryMonth({
      year: 2026,
      month: 3,
      categoryId: 7,
      actualAmount: 70000,
      allocatedPaidMonthByCategory: maps.allocatedPaidMonthByCategory,
      recognizedContributionByCategoryMonth: maps.recognizedContributionByCategoryMonth,
    });
    expect(recognizedMarch).toBeCloseTo(59000, 6); // 70000 - 12000 + 1000

    const recognizedApril = recognizedExpenseForCategoryMonth({
      year: 2026,
      month: 4,
      categoryId: 7,
      actualAmount: 0,
      allocatedPaidMonthByCategory: maps.allocatedPaidMonthByCategory,
      recognizedContributionByCategoryMonth: maps.recognizedContributionByCategoryMonth,
    });
    expect(recognizedApril).toBeCloseTo(1000, 6);
  });

  it("builds tier maps with contribution spread", () => {
    const tierMaps = buildAllocationTierMaps([
      allocation({
        id: 1,
        year: 2026,
        month: 2,
        amount: 120,
        type: "QUARTERLY" as any,
        needTier: "TRAVEL",
      }),
      allocation({
        id: 2,
        year: 2026,
        month: 2,
        amount: 40,
        type: "IMMEDIATE" as any,
        needTier: "NON_ESSENTIAL",
      }),
    ]);

    expect(tierMaps.actualTierByMonth.get("2026-2-TRAVEL")).toBe(120);
    expect(tierMaps.actualTierByMonth.get("2026-2-NON_ESSENTIAL")).toBe(40);

    // Quarterly spreads across Feb, Mar, Apr
    expect(tierMaps.recognizedTierByMonth.get("2026-2-TRAVEL")).toBeCloseTo(40, 6);
    expect(tierMaps.recognizedTierByMonth.get("2026-3-TRAVEL")).toBeCloseTo(40, 6);
    expect(tierMaps.recognizedTierByMonth.get("2026-4-TRAVEL")).toBeCloseTo(40, 6);
    expect(
      tierMaps.recognizedTierByMonth.get("2026-2-NON_ESSENTIAL"),
    ).toBeCloseTo(40, 6);
  });
});

