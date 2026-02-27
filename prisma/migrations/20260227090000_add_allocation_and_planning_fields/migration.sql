-- AlterTable
ALTER TABLE "BudgetEntry" ADD COLUMN "rebalancedAmount" DECIMAL;

-- CreateTable
CREATE TABLE "ExpenseAllocation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL NOT NULL,
    "type" TEXT NOT NULL,
    "durationMonths" INTEGER,
    "startMode" TEXT NOT NULL DEFAULT 'THIS_MONTH',
    "recognitionStartYear" INTEGER,
    "recognitionStartMonth" INTEGER,
    "needTier" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "categoryId" INTEGER NOT NULL,
    CONSTRAINT "ExpenseAllocation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "defaultNeedTier" TEXT,
    "trackAnnualBudgetRemaining" BOOLEAN NOT NULL DEFAULT false,
    "planRebalanceEligible" BOOLEAN NOT NULL DEFAULT false,
    "planRebalancePriority" INTEGER,
    "planMinimumAmount" DECIMAL NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Category" ("createdAt", "id", "isActive", "name", "sortOrder", "type", "updatedAt") SELECT "createdAt", "id", "isActive", "name", "sortOrder", "type", "updatedAt" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE TABLE "new_Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "initialBalance" DECIMAL NOT NULL DEFAULT 0,
    "openingInvestableBalance" DECIMAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD'
);
INSERT INTO "new_Settings" ("currency", "id", "initialBalance") SELECT "currency", "id", "initialBalance" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ExpenseAllocation_year_month_categoryId_idx" ON "ExpenseAllocation"("year", "month", "categoryId");
