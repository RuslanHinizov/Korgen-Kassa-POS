import "dotenv/config";
import crypto from "crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

/**
 * Hash a password exactly as Better Auth does internally:
 * scrypt with N=16384, r=16, p=1, dkLen=64.
 * Format: "<saltHex>:<keyHex>"  (both hex-encoded)
 */
async function hashPassword(password: string): Promise<string> {
  const saltBytes = crypto.randomBytes(16);
  const saltHex = saltBytes.toString("hex");
  const keyBuf = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password.normalize("NFKC"),
      saltHex,
      64,
      { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 },
      (err, derived) => {
        if (err) reject(err);
        else resolve(derived);
      },
    );
  });
  const keyHex = keyBuf.toString("hex");
  return `${saltHex}:${keyHex}`;
}

async function upsertUser(
  email: string,
  name: string,
  password: string,
  role: "ADMIN" | "CASHIER",
) {
  const hashedPassword = await hashPassword(password);
  const userId = crypto.randomBytes(12).toString("hex");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`  ↩  User ${email} already exists, skipping`);
    return existing;
  }

  const user = await prisma.user.create({
    data: {
      id: userId,
      email,
      name,
      emailVerified: true,
      role,
    },
  });

  await prisma.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: hashedPassword,
    },
  });

  return user;
}

async function main() {
  console.log("🌱 Seeding database...");

  // ── Business settings ────────────────────────────────────────────────────────
  await prisma.businessSettings.upsert({
    where: { id: "singleton" },
    create: {
      name: "My Store",
      primaryColor: "#15503A",
      accentColor: "#22B24C",
      currency: "$",
      currencyDecimals: 2,
      taxRate: 0.1, // 10%
      taxName: "Tax",
      receiptFooter: "Thank you for your purchase!",
      language: "en",
      setupComplete: true, // Mark setup as done so tests bypass /setup wizard
    },
    update: {
      setupComplete: true, // Ensure existing installs are also marked complete
    },
  });

  console.log("✅ Business settings seeded");

  // ── Test users (used by E2E tests) ───────────────────────────────────────────
  await upsertUser("admin@example.com", "Admin User", "admin123456", "ADMIN");
  console.log("✅ Admin user seeded (admin@example.com / admin123456)");

  await upsertUser("cashier@example.com", "Cashier User", "cashier123456", "CASHIER");
  console.log("✅ Cashier user seeded (cashier@example.com / cashier123456)");

  // ── Sample products (E2E tests search for "Coffee") ─────────────────────────
  const products = [
    { name: "Coffee", sku: "CAFE-000", price: 3.0, cost: 0.8, stock: 100, category: "Beverages" },
    { name: "Espresso", sku: "CAFE-001", price: 2.5, cost: 0.5, stock: 100, category: "Beverages" },
    { name: "Cappuccino", sku: "CAFE-002", price: 4.0, cost: 0.8, stock: 100, category: "Beverages" },
    { name: "Latte", sku: "CAFE-003", price: 4.5, cost: 0.9, stock: 100, category: "Beverages" },
    { name: "Croissant", sku: "FOOD-001", price: 3.0, cost: 1.0, stock: 20, category: "Food" },
    { name: "Muffin", sku: "FOOD-002", price: 2.75, cost: 0.75, stock: 15, category: "Food" },
    { name: "Mineral Water", sku: "DRINK-001", price: 1.5, cost: 0.3, stock: 50, category: "Beverages", lowStockThreshold: 10 },
    { name: "Orange Juice", sku: "DRINK-002", price: 3.5, cost: 0.7, stock: 8, category: "Beverages", lowStockThreshold: 10 },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { sku: product.sku },
      create: { ...product },
      update: {},
    });
  }

  console.log(`✅ ${products.length} sample products seeded`);

  // ── Sample customer (E2E tests use this to verify loyalty profile) ───────────
  await prisma.customer.upsert({
    where: { email: "test.customer@example.com" },
    create: {
      name: "Test Customer",
      email: "test.customer@example.com",
      phone: "+1-555-0100",
      loyaltyPoints: 50,
    },
    update: {},
  });

  console.log("✅ Sample customer seeded");
  console.log("🎉 Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
