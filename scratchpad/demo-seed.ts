/**
 * Full demo dataset for "Nuray Market" (Korgen Kassa POS).
 * Russian / Kazakhstan retail context. Prices in tenge (₸).
 *
 * Run:  pnpm dlx tsx scratchpad/demo-seed.ts
 *
 * WARNING: this wipes all transactional + catalog demo data
 * (products, customers, suppliers, sales, shifts, stock adjustments,
 *  loyalty logs, refunds, cash movements, audit logs, held orders).
 * It does NOT touch users or auth.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

const round2 = (n: number) => Math.round(n * 100) / 100;
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const rint = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const chance = (p: number) => Math.random() < p;
const DAY = 86_400_000;

// Real user ids (from `User` table — cashier / manager / admin)
const USERS = {
  admin: "2dYkJZYxm7gt3GdfBdXaQakGZC36Fu4n", // Рслан Хинизов
  cashier: "F7pMo1KWKURND0Yy5UuVjUDb1iV47zUD", // Alihan
  manager: "AhVx4wZf8LnXJpjsa8MwHrh8W53RCEJ9", // Erasyl K
};

async function wipe() {
  console.log("🧹 Wiping old demo data…");
  await prisma.loyaltyLog.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.cashMovement.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.stockAdjustment.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.heldOrder.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.supplier.deleteMany();
}

async function settings() {
  await prisma.businessSettings.update({
    where: { id: "singleton" },
    data: {
      name: "Nuray Market",
      currency: "₸",
      currencyDecimals: 2,
      language: "ru",
      taxName: "НДС",
      receiptFooter: "Рахмет! Спасибо за покупку — Nuray Market",
      loyaltyEnabled: true,
      loyaltyEarnRate: 0.05, // 5 бонусов за каждые ₸100
      loyaltyRedeemValue: 1, // 1 бонус = ₸1 скидки
      lowStockThreshold: 5,
    },
  });
  console.log("✅ Настройки обновлены (валюта ₸, бонусная программа включена)");
}

// ─────────────────────────────────────────────────────────────────────────────
// Suppliers
// ─────────────────────────────────────────────────────────────────────────────
async function suppliers() {
  const data = [
    { name: "ТОО «Магнум Дистрибьюшн»", contactName: "Асель Жумагулова", phone: "+7 727 250 11 22", email: "opt@magnum.kz", notes: "Бакалея, бытовая химия. Доставка по вторникам и пятницам." },
    { name: "ТОО «Раимбек Боттлерс»", contactName: "Нурлан Оспанов", phone: "+7 727 258 33 44", email: "sales@raimbek.kz", notes: "Соки Piala Gold, DADO, вода Тассай." },
    { name: "ТОО «FoodMaster»", contactName: "Гульмира Ахметжан", phone: "+7 727 244 55 66", email: "zakaz@foodmaster.kz", notes: "Молочная продукция. Свежесть 5–7 дней, заказ до 16:00." },
    { name: "АО «Рахат»", contactName: "Ерлан Смагулов", phone: "+7 727 258 77 88", email: "opt@rakhat.kz", notes: "Шоколад, конфеты, халва, печенье." },
    { name: "ТОО «Цесна-Астык»", contactName: "Дана Кенжебек", phone: "+7 7172 55 99 00", email: "sales@cesna.kz", notes: "Мука, хлеб, макароны, крупы." },
    { name: "ИП «Даулет и Ко»", contactName: "Даулет Мырзабек", phone: "+7 701 777 12 34", email: "daulet.co@mail.kz", notes: "Овощи и фрукты с базы Алтын Орда. Наличный расчёт." },
    { name: "ТОО «Бекер»", contactName: "Сергей Ли", phone: "+7 727 300 45 67", email: "order@beker.kz", notes: "Колбасы, сосиски, мясные деликатесы." },
  ];
  const created = [];
  for (const s of data) created.push(await prisma.supplier.create({ data: s }));
  console.log(`✅ Поставщики: ${created.length}`);
  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// Products
// ─────────────────────────────────────────────────────────────────────────────
type PSeed = {
  name: string; price: number; cost: number; stock: number; category: string;
  sup: number; low?: number; active?: boolean; unit?: "pcs" | "kg";
};

async function products(sup: { id: string }[]) {
  // sup index map: 0 Магнум, 1 Раимбек, 2 FoodMaster, 3 Рахат, 4 Цесна, 5 Даулет, 6 Бекер
  const P: PSeed[] = [
    // Молочные продукты (FoodMaster = 2)
    { name: "Молоко «Айналайын» 2.5% 1л", price: 490, cost: 400, stock: 58, category: "Молочные продукты", sup: 2 },
    { name: "Кефир «FoodMaster» 2.5% 900мл", price: 520, cost: 420, stock: 41, category: "Молочные продукты", sup: 2 },
    { name: "Сметана «Простоквашино» 20% 300г", price: 690, cost: 560, stock: 33, category: "Молочные продукты", sup: 2 },
    { name: "Творог «Домик в деревне» 5% 200г", price: 730, cost: 600, stock: 24, category: "Молочные продукты", sup: 2 },
    { name: "Айран «Айналайын» 0.5л", price: 260, cost: 200, stock: 76, category: "Молочные продукты", sup: 2 },
    { name: "Сыр «Российский» 200г", price: 1450, cost: 1180, stock: 19, category: "Молочные продукты", sup: 2 },
    { name: "Масло сливочное «Крестьянское» 180г", price: 1290, cost: 1050, stock: 4, category: "Молочные продукты", sup: 2, low: 6 },
    { name: "Йогурт «Активиа» клубника 290г", price: 520, cost: 410, stock: 29, category: "Молочные продукты", sup: 2 },
    // Хлеб и выпечка (Цесна = 4)
    { name: "Хлеб «Заводской» белый 500г", price: 180, cost: 120, stock: 47, category: "Хлеб и выпечка", sup: 4 },
    { name: "Батон нарезной 400г", price: 220, cost: 150, stock: 38, category: "Хлеб и выпечка", sup: 4 },
    { name: "Лаваш армянский 250г", price: 250, cost: 170, stock: 26, category: "Хлеб и выпечка", sup: 4 },
    { name: "Баурсаки 300г", price: 600, cost: 420, stock: 12, category: "Хлеб и выпечка", sup: 4 },
    { name: "Булочка с маком", price: 150, cost: 90, stock: 20, category: "Хлеб и выпечка", sup: 4 },
    { name: "Печенье «Юбилейное» 250г", price: 480, cost: 380, stock: 35, category: "Хлеб и выпечка", sup: 3 },
    // Напитки / Вода / Соки (Раимбек = 1, Магнум = 0)
    { name: "Вода «Тассай» негаз. 1л", price: 260, cost: 180, stock: 92, category: "Напитки", sup: 1 },
    { name: "Вода «Тассай» газ. 0.5л", price: 200, cost: 140, stock: 88, category: "Напитки", sup: 1 },
    { name: "Сок «DADO» яблоко 1л", price: 640, cost: 500, stock: 44, category: "Напитки", sup: 1 },
    { name: "Сок «Piala Gold» апельсин 0.95л", price: 690, cost: 540, stock: 39, category: "Напитки", sup: 1 },
    { name: "Coca-Cola 0.5л", price: 380, cost: 280, stock: 110, category: "Напитки", sup: 0 },
    { name: "Coca-Cola 1.5л", price: 750, cost: 560, stock: 57, category: "Напитки", sup: 0 },
    { name: "Pepsi 0.5л", price: 360, cost: 270, stock: 64, category: "Напитки", sup: 0 },
    { name: "Fanta 0.5л", price: 360, cost: 270, stock: 51, category: "Напитки", sup: 0 },
    { name: "Чай «Пиала» чёрный 100 пак.", price: 1350, cost: 1080, stock: 23, category: "Напитки", sup: 0 },
    { name: "Кофе «Nescafe Classic» 190г", price: 3200, cost: 2600, stock: 3, category: "Напитки", sup: 0, low: 5 },
    { name: "Энергетик «Gorilla» 0.45л", price: 550, cost: 430, stock: 37, category: "Напитки", sup: 0 },
    // Бакалея (Магнум = 0, Цесна = 4)
    { name: "Рис «Акмаржан» 900г", price: 850, cost: 690, stock: 28, category: "Бакалея", sup: 4 },
    { name: "Гречка «Макфа» 800г", price: 780, cost: 620, stock: 26, category: "Бакалея", sup: 4 },
    { name: "Макароны «Корона» спагетти 400г", price: 340, cost: 250, stock: 43, category: "Бакалея", sup: 4 },
    { name: "Сахар-песок 1кг", price: 490, cost: 400, stock: 55, category: "Бакалея", sup: 0 },
    { name: "Соль «Экстра» 1кг", price: 150, cost: 90, stock: 48, category: "Бакалея", sup: 0 },
    { name: "Мука «Цесна» в/с 2кг", price: 780, cost: 620, stock: 32, category: "Бакалея", sup: 4 },
    { name: "Масло подсолнечное «Золотая семечка» 1л", price: 1180, cost: 950, stock: 27, category: "Бакалея", sup: 0 },
    { name: "Яйцо куриное С1 10шт", price: 720, cost: 580, stock: 36, category: "Бакалея", sup: 5 },
    { name: "Тушёнка говяжья «Барс» 325г", price: 1290, cost: 1050, stock: 18, category: "Бакалея", sup: 0 },
    { name: "Консерва «Сайра» натуральная 240г", price: 890, cost: 700, stock: 21, category: "Бакалея", sup: 0 },
    // Кондитерские изделия (Рахат = 3)
    { name: "Шоколад «Рахат» молочный 100г", price: 690, cost: 540, stock: 49, category: "Кондитерские изделия", sup: 3 },
    { name: "Конфеты «Казахстанские» 250г", price: 1350, cost: 1100, stock: 19, category: "Кондитерские изделия", sup: 3 },
    { name: "Вафли «Артек» 220г", price: 420, cost: 320, stock: 29, category: "Кондитерские изделия", sup: 3 },
    { name: "Зефир «Шарм» 250г", price: 560, cost: 440, stock: 17, category: "Кондитерские изделия", sup: 3 },
    { name: "Халва «Рахат» подсолнечная 350г", price: 950, cost: 760, stock: 14, category: "Кондитерские изделия", sup: 3 },
    // Снеки
    { name: "Чипсы «Lay's» сметана-зелень 81г", price: 550, cost: 430, stock: 58, category: "Снеки", sup: 0 },
    { name: "Сухарики «Три корочки» 60г", price: 220, cost: 160, stock: 44, category: "Снеки", sup: 0 },
    { name: "Семечки «От Мартина» 150г", price: 400, cost: 300, stock: 38, category: "Снеки", sup: 0 },
    { name: "Арахис солёный 100г", price: 480, cost: 370, stock: 24, category: "Снеки", sup: 0 },
    { name: "Жевательная резинка «Orbit» 13.6г", price: 180, cost: 120, stock: 79, category: "Снеки", sup: 0 },
    // Овощи и фрукты (Даулет = 5)
    { name: "Картофель, кг", price: 250, cost: 170, stock: 118, category: "Овощи и фрукты", sup: 5 },
    { name: "Лук репчатый, кг", price: 220, cost: 150, stock: 87, category: "Овощи и фрукты", sup: 5 },
    { name: "Морковь, кг", price: 240, cost: 160, stock: 68, category: "Овощи и фрукты", sup: 5 },
    { name: "Помидоры, кг", price: 890, cost: 700, stock: 37, category: "Овощи и фрукты", sup: 5 },
    { name: "Огурцы, кг", price: 760, cost: 600, stock: 33, category: "Овощи и фрукты", sup: 5 },
    { name: "Яблоки «Айдаред», кг", price: 690, cost: 540, stock: 52, category: "Овощи и фрукты", sup: 5 },
    { name: "Бананы, кг", price: 850, cost: 690, stock: 43, category: "Овощи и фрукты", sup: 5 },
    { name: "Лимон, кг", price: 1290, cost: 1050, stock: 4, category: "Овощи и фрукты", sup: 5, low: 5 },
    // Мясо и колбасы (Бекер = 6)
    { name: "Колбаса «Докторская» 450г", price: 1690, cost: 1380, stock: 17, category: "Мясо и колбасы", sup: 6 },
    { name: "Сосиски «Молочные» 500г", price: 1450, cost: 1180, stock: 20, category: "Мясо и колбасы", sup: 6 },
    { name: "Сервелат «Зернистый» 350г", price: 2100, cost: 1720, stock: 11, category: "Мясо и колбасы", sup: 6 },
    { name: "Фарш говяжий, кг", price: 2890, cost: 2400, stock: 9, category: "Мясо и колбасы", sup: 6 },
    { name: "Курица тушка охл., кг", price: 1350, cost: 1100, stock: 23, category: "Мясо и колбасы", sup: 6 },
    // Замороженные продукты
    { name: "Пельмени «Сибирская коллекция» 800г", price: 1990, cost: 1620, stock: 21, category: "Замороженные продукты", sup: 0 },
    { name: "Вареники с картофелем 900г", price: 1290, cost: 1040, stock: 15, category: "Замороженные продукты", sup: 0 },
    { name: "Мороженое «Шар» пломбир 70г", price: 250, cost: 170, stock: 57, category: "Замороженные продукты", sup: 0 },
    { name: "Овощная смесь «Хортекс» 400г", price: 890, cost: 700, stock: 13, category: "Замороженные продукты", sup: 0 },
    // Бытовая химия / гигиена (Магнум = 0)
    { name: "Порошок «Ariel» 450г", price: 1690, cost: 1380, stock: 19, category: "Бытовая химия", sup: 0 },
    { name: "Средство для посуды «Fairy» 450мл", price: 1150, cost: 920, stock: 24, category: "Бытовая химия", sup: 0 },
    { name: "Мыло «Absolut» 90г", price: 260, cost: 180, stock: 48, category: "Гигиена", sup: 0 },
    { name: "Шампунь «Head & Shoulders» 200мл", price: 2190, cost: 1780, stock: 11, category: "Гигиена", sup: 0 },
    { name: "Зубная паста «Colgate» 100мл", price: 890, cost: 700, stock: 28, category: "Гигиена", sup: 0 },
    { name: "Туалетная бумага «Zewa» 4шт", price: 990, cost: 780, stock: 34, category: "Гигиена", sup: 0 },
    { name: "Влажные салфетки «Aura» 15шт", price: 280, cost: 190, stock: 39, category: "Гигиена", sup: 0 },
    // Сигареты
    { name: "Сигареты «Winston»", price: 900, cost: 780, stock: 38, category: "Сигареты", sup: 0 },
    { name: "Сигареты «Parliament»", price: 1400, cost: 1200, stock: 24, category: "Сигареты", sup: 0 },
    // Прочее
    { name: "Пакет-майка", price: 20, cost: 10, stock: 480, category: "Прочее", sup: 0 },
    // Снятые с продажи (неактивные)
    { name: "Кола «Star» 0.33л (снята с продажи)", price: 300, cost: 220, stock: 0, category: "Напитки", sup: 0, active: false },
    { name: "Пакет бумажный (старый поставщик)", price: 15, cost: 8, stock: 0, category: "Прочее", sup: 0, active: false },
  ];

  const created = [];
  let i = 0;
  for (const p of P) {
    i++;
    const byWeight = p.unit === "kg" || p.name.includes(", кг");
    created.push(
      await prisma.product.create({
        data: {
          name: p.name,
          sku: `PRD-${String(i).padStart(3, "0")}`,
          // Fresh bakery and loose products are selected on screen; packaged goods scan normally.
          barcode: byWeight || p.category === "Хлеб и выпечка" ? null : `487${String(1_000_000_000 + i * 7).padStart(10, "0")}`,
          price: p.price,
          cost: p.cost,
          stock: p.stock,
          unit: byWeight ? "kg" : "pcs",
          category: p.category,
          lowStockThreshold: p.low ?? 5,
          active: p.active ?? true,
          supplierId: sup[p.sup].id,
        },
      }),
    );
  }
  console.log(`✅ Товары: ${created.length} (в ${new Set(P.map((x) => x.category)).size} категориях)`);
  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// Customers
// ─────────────────────────────────────────────────────────────────────────────
async function customers() {
  const data = [
    { name: "Айгерім Нұрланова", phone: "+7 701 123 45 01", email: "aigerim.n@mail.kz", loyaltyPoints: 120, notes: null },
    { name: "Данияр Сейтқали", phone: "+7 701 123 45 02", email: null, loyaltyPoints: 45, notes: null },
    { name: "Мадина Оспанова", phone: "+7 701 123 45 03", email: "madina.osp@gmail.com", loyaltyPoints: 0, notes: null },
    { name: "Ерлан Тұрсынов", phone: "+7 701 123 45 04", email: null, loyaltyPoints: 260, notes: "Постоянный клиент, берёт помногу (кафе рядом)." },
    { name: "Жанна Ким", phone: "+7 701 123 45 05", email: "zhanna.kim@mail.kz", loyaltyPoints: 30, notes: null },
    { name: "Тимур Абдрахманов", phone: "+7 701 123 45 06", email: null, loyaltyPoints: 15, notes: null },
    { name: "Гүлнар Ахметова", phone: "+7 701 123 45 07", email: "gulnar.a@mail.kz", loyaltyPoints: 500, notes: "VIP. Скидка 5% по договорённости." },
    { name: "Асхат Жұмабек", phone: "+7 701 123 45 08", email: null, loyaltyPoints: 0, notes: null },
    { name: "Динара Сәрсенова", phone: "+7 701 123 45 09", email: null, loyaltyPoints: 85, notes: null },
    { name: "Нұрсұлтан Әли", phone: "+7 701 123 45 10", email: "nur.ali@gmail.com", loyaltyPoints: 60, notes: null },
    { name: "Ольга Петрова", phone: "+7 701 123 45 11", email: "olga.petrova@mail.kz", loyaltyPoints: 200, notes: "Просит чек на почту." },
    { name: "Бекзат Мұратов", phone: "+7 701 123 45 12", email: null, loyaltyPoints: 10, notes: null },
    { name: "Сауле Қасымова", phone: "+7 701 123 45 13", email: null, loyaltyPoints: 340, notes: null },
    { name: "Владимир Цой", phone: "+7 701 123 45 14", email: null, loyaltyPoints: 25, notes: null },
    { name: "Аружан Болат", phone: "+7 701 123 45 15", email: "aruzhan.b@mail.kz", loyaltyPoints: 0, notes: "Новый клиент." },
  ];
  const created = [];
  for (const c of data) created.push(await prisma.customer.create({ data: c }));
  console.log(`✅ Клиенты: ${created.length}`);
  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shifts
// ─────────────────────────────────────────────────────────────────────────────
function atHour(dayAgo: number, hour: number, min = 0) {
  const d = new Date(Date.now() - dayAgo * DAY);
  d.setHours(hour, min, 0, 0);
  return d;
}

async function shifts() {
  const defs = [
    { userId: USERS.cashier, dayAgo: 6, open: 9, close: 20 as number | null },
    { userId: USERS.cashier, dayAgo: 4, open: 9, close: 21 },
    { userId: USERS.manager, dayAgo: 2, open: 10, close: 20 },
    { userId: USERS.cashier, dayAgo: 1, open: 9, close: 21 },
    { userId: USERS.cashier, dayAgo: 0, open: 9, close: null }, // OPEN — сегодня
  ];
  const created = [];
  for (const d of defs) {
    const s = await prisma.shift.create({
      data: {
        userId: d.userId,
        openedAt: atHour(d.dayAgo, d.open),
        closedAt: d.close == null ? null : atHour(d.dayAgo, d.close, 15),
        openingFloat: 20000,
        status: d.close == null ? "OPEN" : "CLOSED",
      },
    });
    created.push({ ...s, dayAgo: d.dayAgo });
  }
  console.log(`✅ Смены: ${created.length} (4 закрыты, 1 открыта)`);
  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sales
// ─────────────────────────────────────────────────────────────────────────────
async function sales(
  prods: { id: string; name: string; price: any; active: boolean }[],
  custs: { id: string }[],
  shs: { id: string; userId: string; dayAgo: number; status: string }[],
) {
  const sellable = prods.filter((p) => p.active);
  const now = Date.now();
  const VOID_REASONS = ["Ошибка кассира", "Клиент передумал", "Пробили лишний товар"];
  const userPools = [
    ...Array(6).fill(USERS.cashier),
    ...Array(3).fill(USERS.manager),
    ...Array(1).fill(USERS.admin),
  ];

  let completed = 0, voided = 0, refunded = 0;
  const madeSales: { id: string; total: number; userId: string; dayAgo: number; method: string; cashReceived: number; customerId: string | null; status: string; items: any[] }[] = [];

  const TOTAL = 78;
  for (let i = 0; i < TOTAL; i++) {
    const dayAgo = rint(0, 34);
    const hour = rint(8, 21);
    const createdAt = new Date(new Date(now - dayAgo * DAY).setHours(hour, rint(0, 59), rint(0, 59), 0));
    const userId = pick(userPools);

    // basket
    const n = pick([1, 1, 2, 2, 2, 3, 3, 4, 5]);
    const chosen = new Set<number>();
    while (chosen.size < n) chosen.add(rint(0, sellable.length - 1));
    const items = [...chosen].map((idx) => {
      const p = sellable[idx];
      const price = Number(p.price);
      const qty = pick([1, 1, 1, 2, 2, 3]);
      return { productId: p.id, name: p.name, price, quantity: qty, total: round2(price * qty) };
    });
    const subtotal = round2(items.reduce((s, it) => s + it.total, 0));

    let discountAmount = 0;
    if (chance(0.16)) discountAmount = Math.min(subtotal - 10, Math.round((subtotal * (0.05 + Math.random() * 0.1)) / 10) * 10);
    const tipAmount = chance(0.06) ? pick([100, 200, 200, 300, 500]) : null;
    const total = round2(subtotal - discountAmount + (tipAmount ?? 0));

    // status
    let status: "COMPLETED" | "VOIDED" | "REFUNDED" = "COMPLETED";
    if (i < 3) status = "VOIDED";
    else if (i < 5) status = "REFUNDED";

    // payment
    const r = Math.random();
    let method: "CASH" | "CARD" | "OTHER" = r < 0.55 ? "CASH" : r < 0.9 ? "CARD" : "OTHER";
    let paymentLines: any = null;
    let amountTendered: number | null = null;
    let changeDue: number | null = null;
    let cashReceived = 0;

    if (chance(0.08) && status === "COMPLETED") {
      // split cash + card
      const cashPart = Math.max(100, Math.round((total * (0.3 + Math.random() * 0.4)) / 50) * 50);
      const cardPart = round2(total - cashPart);
      paymentLines = [
        { method: "CASH", amount: cashPart },
        { method: "CARD", amount: cardPart },
      ];
      method = "CASH";
      amountTendered = cashPart;
      changeDue = 0;
      cashReceived = cashPart;
    } else if (method === "CASH") {
      amountTendered = Math.ceil(total / 100) * 100 + pick([0, 0, 100, 500, 1000]);
      changeDue = round2(amountTendered - total);
      cashReceived = round2(total);
    } else {
      amountTendered = total;
      changeDue = 0;
      cashReceived = 0;
    }

    const customerId = chance(0.42) ? pick(custs).id : null;

    // shift link: same user + same day as a shift
    const sh = shs.find((s) => s.userId === userId && s.dayAgo === dayAgo);

    const sale = await prisma.sale.create({
      data: {
        userId,
        customerId,
        shiftId: sh?.id ?? null,
        subtotal,
        taxRate: 0,
        taxAmount: 0,
        discountAmount,
        tipAmount,
        total,
        paymentMethod: method,
        paymentLines: paymentLines ?? undefined,
        amountTendered,
        changeDue,
        status,
        voidReason: status === "VOIDED" ? pick(VOID_REASONS) : null,
        createdAt,
        items: { create: items.map((it) => ({ name: it.name, price: it.price, quantity: it.quantity, total: it.total, productId: it.productId })) },
      },
    });

    if (status === "COMPLETED") completed++;
    else if (status === "VOIDED") voided++;
    else refunded++;

    madeSales.push({ id: sale.id, total, userId, dayAgo, method, cashReceived: status === "VOIDED" ? 0 : cashReceived, customerId, status, items });
  }

  console.log(`✅ Продажи: ${madeSales.length} (завершено ${completed}, отменено ${voided}, возврат ${refunded})`);
  return madeSales;
}

// ─────────────────────────────────────────────────────────────────────────────
// Refunds (for the 2 REFUNDED sales)
// ─────────────────────────────────────────────────────────────────────────────
async function refunds(madeSales: any[]) {
  const refundedSales = madeSales.filter((s) => s.status === "REFUNDED");
  const reasons = ["Брак товара (просрочка)", "Возврат по желанию клиента"];
  let k = 0;
  for (const s of refundedSales) {
    await prisma.refund.create({
      data: {
        saleId: s.id,
        userId: USERS.manager,
        amount: round2(s.total),
        reason: reasons[k % reasons.length],
        items: s.items.map((it: any) => ({ name: it.name, quantity: it.quantity, price: it.price, total: it.total })),
        restoreStock: true,
        createdAt: new Date(),
      },
    });
    k++;
  }
  console.log(`✅ Возвраты: ${refundedSales.length}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cash movements
// ─────────────────────────────────────────────────────────────────────────────
async function cashMovements(shs: { id: string; userId: string; status: string }[]) {
  const closed = shs.filter((s) => s.status === "CLOSED");
  const defs = [
    { type: "IN" as const, amount: 5000, reason: "Размен из сейфа" },
    { type: "OUT" as const, amount: 3500, reason: "Закуп воды у поставщика (Тассай)" },
    { type: "PAYOUT" as const, amount: 4000, reason: "Оплата грузчику за разгрузку" },
    { type: "DROP" as const, amount: 6000, reason: "Инкассация — сдача в сейф" },
    { type: "OUT" as const, amount: 2500, reason: "Хознужды (лампочки, скотч)" },
  ];
  let n = 0;
  for (let i = 0; i < defs.length && i < closed.length + 1; i++) {
    const sh = closed[i % closed.length];
    await prisma.cashMovement.create({
      data: { shiftId: sh.id, userId: sh.userId, type: defs[i].type, amount: defs[i].amount, reason: defs[i].reason },
    });
    n++;
  }
  console.log(`✅ Движения по кассе: ${n}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Close-out numbers for CLOSED shifts (expected / counted / difference)
// ─────────────────────────────────────────────────────────────────────────────
async function closeShifts() {
  const closed = await prisma.shift.findMany({ where: { status: "CLOSED" }, include: { sales: true, cashMovements: true } });
  for (const sh of closed) {
    const cashFromSales = sh.sales
      .filter((x) => x.status !== "VOIDED")
      .reduce((a, x) => {
        const lines = x.paymentLines as any[] | null;
        if (lines && lines.length) {
          const cl = lines.find((l) => l.method === "CASH");
          return a + (cl ? Number(cl.amount) - Number(x.changeDue ?? 0) : 0);
        }
        if (x.paymentMethod === "CASH") return a + Number(x.total);
        return a;
      }, 0);
    const cashIn = sh.cashMovements.filter((m) => m.type === "IN").reduce((a, m) => a + Number(m.amount), 0);
    const cashOut = sh.cashMovements.filter((m) => m.type !== "IN").reduce((a, m) => a + Number(m.amount), 0);
    const expected = Math.max(
      round2(Number(sh.openingFloat) * 0.6),
      round2(Number(sh.openingFloat) + cashFromSales + cashIn - cashOut),
    );
    const drift = pick([0, 0, -500, 200, -1500, 1000, -300]);
    const counted = round2(expected + drift);
    await prisma.shift.update({
      where: { id: sh.id },
      data: { expectedCash: expected, countedCash: counted, difference: round2(counted - expected), notes: drift === 0 ? "Касса сошлась" : drift > 0 ? "Излишек" : "Недостача" },
    });
  }
  console.log(`✅ Закрытие смен рассчитано (${closed.length})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Loyalty logs + balances
// ─────────────────────────────────────────────────────────────────────────────
async function loyalty(madeSales: any[]) {
  const withCust = madeSales.filter((s) => s.customerId && s.status === "COMPLETED");
  let earn = 0;
  for (const s of withCust) {
    const pts = Math.floor(s.total * 0.05);
    if (pts <= 0) continue;
    await prisma.loyaltyLog.create({
      data: { customerId: s.customerId, saleId: s.id, delta: pts, type: "EARN", note: "Начислено за покупку" },
    });
    await prisma.customer.update({ where: { id: s.customerId }, data: { loyaltyPoints: { increment: pts } } });
    earn++;
  }
  // a couple of redemptions
  const redeemers = withCust.slice(0, 2);
  for (const s of redeemers) {
    await prisma.loyaltyLog.create({
      data: { customerId: s.customerId, saleId: s.id, delta: -100, type: "REDEEM", note: "Списано в счёт скидки" },
    });
    await prisma.customer.update({ where: { id: s.customerId }, data: { loyaltyPoints: { decrement: 100 } } });
  }
  // manual adjust
  if (withCust[0]) {
    await prisma.loyaltyLog.create({
      data: { customerId: withCust[0].customerId, delta: 25, type: "ADJUST", note: "Корректировка при сверке бонусов" },
    });
    await prisma.customer.update({ where: { id: withCust[0].customerId }, data: { loyaltyPoints: { increment: 25 } } });
  }
  console.log(`✅ Бонусные операции: начислений ${earn}, списаний ${redeemers.length}, корректировок 1`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Stock adjustments (history log)
// ─────────────────────────────────────────────────────────────────────────────
async function stockAdjustments(prods: { id: string; name: string }[]) {
  const now = Date.now();
  const defs: { reason: "RECEIVED" | "DAMAGED" | "THEFT" | "CORRECTION" | "OPENING_COUNT"; delta: number; note: string }[] = [
    { reason: "RECEIVED", delta: 60, note: "Поставка от FoodMaster" },
    { reason: "RECEIVED", delta: 48, note: "Поставка воды Тассай (Раимбек)" },
    { reason: "RECEIVED", delta: 30, note: "Поставка Рахат" },
    { reason: "RECEIVED", delta: 100, note: "Овощи с базы (Даулет)" },
    { reason: "RECEIVED", delta: 24, note: "Поставка Бекер (колбасы)" },
    { reason: "DAMAGED", delta: -3, note: "Помятая упаковка при разгрузке" },
    { reason: "DAMAGED", delta: -2, note: "Разбилась банка" },
    { reason: "THEFT", delta: -1, note: "Недостача по камере" },
    { reason: "CORRECTION", delta: -4, note: "Пересорт, исправление" },
    { reason: "CORRECTION", delta: 2, note: "Нашлись при уборке склада" },
    { reason: "OPENING_COUNT", delta: 0, note: "Инвентаризация — расхождений нет" },
    { reason: "RECEIVED", delta: 40, note: "Поставка Магнум (бакалея)" },
    { reason: "RECEIVED", delta: 36, note: "Поставка Цесна-Астык (мука, крупы)" },
    { reason: "DAMAGED", delta: -1, note: "Истёк срок годности" },
    { reason: "CORRECTION", delta: -2, note: "Ошибка приёмки" },
    { reason: "RECEIVED", delta: 20, note: "Довоз по заявке" },
  ];
  let n = 0;
  for (let i = 0; i < defs.length; i++) {
    const p = prods[rint(0, prods.length - 1)];
    await prisma.stockAdjustment.create({
      data: {
        productId: p.id,
        userId: pick([USERS.manager, USERS.cashier, USERS.admin]),
        delta: defs[i].delta,
        reason: defs[i].reason,
        note: defs[i].note,
        createdAt: new Date(now - rint(0, 30) * DAY - rint(0, 8) * 3600_000),
      },
    });
    n++;
  }
  console.log(`✅ Движения по складу: ${n}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────────────────────
async function auditLog(madeSales: any[]) {
  const now = Date.now();
  const voids = madeSales.filter((s) => s.status === "VOIDED");
  const refs = madeSales.filter((s) => s.status === "REFUNDED");
  const rows: any[] = [
    { userId: USERS.manager, action: "SHIFT_OPEN", entityType: "Shift", details: { openingFloat: 20000 } },
    { userId: USERS.manager, action: "SHIFT_CLOSE", entityType: "Shift", details: { difference: -500 } },
    { userId: USERS.cashier, action: "SHIFT_OPEN", entityType: "Shift", details: { openingFloat: 20000 } },
    { userId: USERS.cashier, action: "SHIFT_CLOSE", entityType: "Shift", details: { difference: 200 } },
    { userId: USERS.admin, action: "SETTINGS_UPDATE", entityType: "BusinessSettings", details: { changed: ["loyaltyEnabled", "receiptFooter"] } },
    { userId: USERS.manager, action: "MANAGER_OVERRIDE", entityType: "Sale", details: { context: "refund", method: "pin" } },
  ];
  for (const v of voids) rows.push({ userId: USERS.manager, action: "SALE_VOID", entityType: "Sale", entityId: v.id, details: { total: v.total, reason: "Ошибка кассира" } });
  for (const r of refs) rows.push({ userId: USERS.manager, action: "SALE_REFUND", entityType: "Sale", entityId: r.id, details: { amount: r.total, managerOverride: true } });

  let n = 0;
  for (const row of rows) {
    await prisma.auditLog.create({ data: { ...row, createdAt: new Date(now - rint(0, 20) * DAY - rint(0, 10) * 3600_000) } });
    n++;
  }
  console.log(`✅ Журнал аудита: ${n}`);
}

async function main() {
  console.log("🌱 Демо-наполнение «Nuray Market»…\n");
  await wipe();
  await settings();
  const sup = await suppliers();
  const prods = await products(sup);
  const custs = await customers();
  const shs = await shifts();
  const madeSales = await sales(prods as any, custs, shs as any);
  await refunds(madeSales);
  await cashMovements(shs as any);
  await closeShifts();
  await loyalty(madeSales);
  await stockAdjustments(prods as any);
  await auditLog(madeSales);
  console.log("\n🎉 Готово. Демо-данные загружены.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
