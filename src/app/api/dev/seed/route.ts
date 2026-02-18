import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DEV_SEED !== "true"
  ) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const existingUsers = await prisma.user.count();

  if (existingUsers > 0) {
    return NextResponse.json({
      status: "ok",
      message: "Database already seeded. No changes made.",
    });
  }

  const password = "familybudget";
  const passwordHash = await bcrypt.hash(password, 10);

  const users = await prisma.$transaction(async (tx) => {
    const createdUsers = await Promise.all([
      tx.user.create({
        data: { username: "admin1", passwordHash, role: "ADMIN" },
      }),
      tx.user.create({
        data: { username: "admin2", passwordHash, role: "ADMIN" },
      }),
      tx.user.create({
        data: { username: "viewer1", passwordHash, role: "VIEWER" },
      }),
      tx.user.create({
        data: { username: "viewer2", passwordHash, role: "VIEWER" },
      }),
    ]);

    await tx.category.createMany({
      data: [
        // Income
        { name: "Salary", type: "INCOME", sortOrder: 1 },
        { name: "Cashback", type: "INCOME", sortOrder: 2 },
        { name: "Interest", type: "INCOME", sortOrder: 3 },
        { name: "Loan Repayment", type: "INCOME", sortOrder: 4 },
        { name: "Miscellaneous", type: "INCOME", sortOrder: 5 },
        { name: "Balance", type: "INCOME", sortOrder: 6 },
        { name: "Dividend", type: "INCOME", sortOrder: 7 },
        { name: "Advance", type: "INCOME", sortOrder: 8 },
        { name: "Reimbursement", type: "INCOME", sortOrder: 9 },
        { name: "Other Income", type: "INCOME", sortOrder: 10 },
        // Expense categories (from your sheet)
        { name: "Rent", type: "EXPENSE", sortOrder: 20 },
        { name: "Groc/Supp", type: "EXPENSE", sortOrder: 21 },
        { name: "Personnel", type: "EXPENSE", sortOrder: 22 },
        { name: "Travel/Commute", type: "EXPENSE", sortOrder: 23 },
        { name: "Commute", type: "EXPENSE", sortOrder: 24 },
        { name: "Medicines", type: "EXPENSE", sortOrder: 25 },
        { name: "Utilities", type: "EXPENSE", sortOrder: 26 },
        { name: "Car", type: "EXPENSE", sortOrder: 27 },
        { name: "Subscriptions", type: "EXPENSE", sortOrder: 28 },
        { name: "Eating Out", type: "EXPENSE", sortOrder: 29 },
        { name: "Ordering In", type: "EXPENSE", sortOrder: 30 },
        { name: "Gifts", type: "EXPENSE", sortOrder: 31 },
        { name: "Apparels", type: "EXPENSE", sortOrder: 32 },
        { name: "Entertainment", type: "EXPENSE", sortOrder: 33 },
        { name: "Miscellaneous", type: "EXPENSE", sortOrder: 34 },
        { name: "Existing EMIs", type: "EXPENSE", sortOrder: 35 },
        { name: "Insurance", type: "EXPENSE", sortOrder: 36 },
        { name: "Discretionary", type: "EXPENSE", sortOrder: 37 },
        { name: "Unaccounted", type: "EXPENSE", sortOrder: 38 },
        { name: "Cuckoo Regalia", type: "EXPENSE", sortOrder: 39 },
        { name: "Cuckoo BankAcc", type: "EXPENSE", sortOrder: 40 },
        { name: "Fitness", type: "EXPENSE", sortOrder: 41 },
        // Investments
        { name: "Mutual Funds", type: "INVESTMENT", sortOrder: 60 },
        { name: "Gold", type: "INVESTMENT", sortOrder: 61 },
        { name: "Crypto", type: "INVESTMENT", sortOrder: 62 },
        { name: "ULIP", type: "INVESTMENT", sortOrder: 63 },
      ],
    });

    await tx.settings.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        initialBalance: 0,
        currency: "USD",
      },
    });

    return createdUsers;
  });

  return NextResponse.json({
    status: "ok",
    message:
      "Seed complete. Default users: admin1/admin2/viewer1/viewer2, password 'familybudget'.",
    users: users.map((u) => ({ id: u.id, username: u.username, role: u.role })),
  });
}
