import { PrismaClient } from "@/generated/client";

// Ensure we reuse the PrismaClient instance in development
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

if (process.env.NODE_ENV === "development") {
  console.log("[prisma] process.cwd() =", process.cwd());
  console.log("[prisma] DATABASE_URL =", process.env.DATABASE_URL);
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

