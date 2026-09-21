import { readFileSync, writeFileSync } from "node:fs";

const DIR = "messages";
const LOCALES = ["en", "ru", "ar", "de", "es", "fr", "hi", "id", "ja", "ko", "pt", "si", "ta", "zh"];

// New keys, per locale we actually translate (en + ru). Others get the en value via deep-merge.
const ADD = {
  en: {
    "products.form.unit_label": "Sold by",
    "products.form.unit_pcs": "Piece",
    "products.form.unit_kg": "Weight (kg)",
    "products.form.unit_hint": "Weight items ask the cashier for the kilograms at checkout.",
    "products.form.price_per_kg": "Price per kg",
    "products.form.cost_per_kg": "Cost per kg",
    "products.form.stock_kg": "Stock (kg)",
    "products.form.low_stock_alert_kg": "Low-stock alert (kg)",
    "pos.filter_all": "All",
    "pos.filter_barcoded": "Barcoded",
    "pos.filter_no_barcode": "No barcode",
    "pos.all_categories": "All categories",
    "pos.no_category": "Uncategorised",
    "pos.scan_hint": "Scan a barcode to add these items.",
    "pos.filter_results_empty": "Nothing in this filter",
    "pos.weight_title": "Enter weight",
    "pos.weight_label": "Weight, kg",
    "pos.weight_add": "Add to cart",
    "pos.per_kg": "/kg",
    "pos.kg_short": "kg",
    "pos.edit_weight": "Change weight",
  },
  ru: {
    "products.form.unit_label": "Единица продажи",
    "products.form.unit_pcs": "Штука",
    "products.form.unit_kg": "Вес (кг)",
    "products.form.unit_hint": "Для весовых товаров касса спросит количество килограммов при добавлении.",
    "products.form.price_per_kg": "Цена за кг",
    "products.form.cost_per_kg": "Себестоимость за кг",
    "products.form.stock_kg": "Остаток (кг)",
    "products.form.low_stock_alert_kg": "Оповещение о низком остатке (кг)",
    "pos.filter_all": "Все",
    "pos.filter_barcoded": "Со штрихкодом",
    "pos.filter_no_barcode": "Без штрихкода",
    "pos.all_categories": "Все категории",
    "pos.no_category": "Без категории",
    "pos.scan_hint": "Отсканируйте штрихкод, чтобы добавить такие товары.",
    "pos.filter_results_empty": "В этом фильтре ничего нет",
    "pos.weight_title": "Укажите вес",
    "pos.weight_label": "Вес, кг",
    "pos.weight_add": "Добавить в корзину",
    "pos.per_kg": "/кг",
    "pos.kg_short": "кг",
    "pos.edit_weight": "Изменить вес",
  },
};

function setDeep(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] ??= {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function deepMerge(base, override) {
  // fill missing keys in `override` from `base`
  for (const k of Object.keys(base)) {
    if (typeof base[k] === "object" && base[k] !== null && !Array.isArray(base[k])) {
      override[k] = deepMerge(base[k], override[k] ?? {});
    } else if (!(k in override)) {
      override[k] = base[k];
    }
  }
  return override;
}

// 1. write en + ru additions
for (const loc of ["en", "ru"]) {
  const path = `${DIR}/${loc}.json`;
  const json = JSON.parse(readFileSync(path, "utf8"));
  for (const [dotted, val] of Object.entries(ADD[loc])) setDeep(json, dotted, val);
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  console.log(`✓ ${loc}: +${Object.keys(ADD[loc]).length} keys`);
}

// 2. deep-merge en into every other locale (English fallback for untranslated keys)
const en = JSON.parse(readFileSync(`${DIR}/en.json`, "utf8"));
for (const loc of LOCALES) {
  if (loc === "en") continue;
  const path = `${DIR}/${loc}.json`;
  const json = JSON.parse(readFileSync(path, "utf8"));
  deepMerge(en, json);
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  console.log(`✓ ${loc}: merged (complete against en)`);
}
console.log("done");
