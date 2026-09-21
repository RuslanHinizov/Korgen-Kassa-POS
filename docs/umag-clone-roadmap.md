# UMAG → Korgen Kassa: full clone roadmap

Directive (boss, 2026-09-11): build every UMAG screen/feature into Korgen Kassa —
same layout, same button placement, same features, 100%. Only the logo and color
palette are Korgen's own (established earlier); everything else matches UMAG's
admin panel 1:1. Source: [docs/umag-teardown.md](umag-teardown.md).

Work through this list top to bottom. Each item = schema (if needed) → API →
UI → i18n → build/lint clean → Docker rebuild → live-browser smoke test →
memory file update. Check off as completed; leave a one-line note on gaps found.

## STRATEGY CHANGE (2026-09-11, boss's direction)
Build the **frontend/visual layer first, across every remaining page** — same layout,
same buttons/panels/tables as UMAG, matching the screenshots the boss sends — before
wiring up deep functionality everywhere. Kept our own sidebar nav (not UMAG's top
dropdown-menu bar); that's a structural/navigation choice, not per-page content, and
switching it would be a much bigger, riskier refactor than what was actually asked.
Wire real data where it's already cheap (most pages); where we have no backing model
yet (Кассы/Счета on the dashboard, for example), show the panel shell with a
"Скоро" placeholder rather than fabricating fake numbers — note it and move on.

## Done
- [x] Товары → Быстрые товары (quick products) — 2026-09-11, see project-korgen-quick-products memory
- [x] Управление → Настройки разрешений — 2026-09-11, see project-korgen-permissions memory.
      NOTE: `autoUpdateSalePrice` setting is stored but NOT YET enforced — that needs the
      Category `defaultMarkupPercent` + Product `markupPercent` fields (still on this list
      under "Товары → Категория create modal"). Wire it up when that lands.
- [x] Главная (dashboard home) — 2026-09-11, see project-korgen-dashboard memory. First page
      built under the new "frontend first" strategy. Found+deleted a stale conflicting
      `src/app/page.tsx` (outside the (app) route group) that was silently winning over
      `(app)/page.tsx` for "/" — check for this pattern if a future page edit "doesn't take".
- [x] Top navigation — 2026-09-11, see project-korgen-topnav memory. Boss pushed back twice
      ("yine aynı değil") until the nav matched UMAG exactly: replaced the left sidebar with
      UMAG's top horizontal bar + dropdown menus (desktop only; mobile keeps the old
      hamburger+drawer+bottom-nav, untouched). Every dropdown now lists the SAME items in the
      SAME order as UMAG's real screenshots, plus a few of our own additions appended
      (Категории, История продаж, Настройки, Акции as its own top item) — never removing a
      UMAG item to make room. ~21 new "Скоро" stub pages created so every menu link resolves
      instead of 404ing — see ComingSoonPage component. Fixed a real CSS bug along the way:
      `overflow-x-auto` on the nav row was clipping the absolutely-positioned dropdown panels
      (a classic overflow-x-implies-overflow-y-clip trap) — removed it, desktop nav doesn't
      need horizontal scroll anyway.

## Up next (rough priority order — highest real-world impact first)
- [ ] Товары → Списание (write-off/waste) with categorized Причина списания reason
- [ ] Товары → Оприходование (manual stock-in, symmetric to Списание)
- [ ] Финансы: единый Платежи ledger (CashMovement tagged by Назначение платежа) +
      Обзор по счетам (per-kassa running cash balance) + Переводы (inter-account
      transfer) — note: `/api/cash-movements` already exists in this codebase,
      check what it currently covers before redesigning
- [ ] Отчеты → Статистика продаж (6 sub-tabs: По товарам/По чекам/По категориям/
      По поставщикам/По покупателям/Сравнение товаров)
- [ ] Отчеты → Отчеты по сменам (add cash-drawer reconciliation columns:
      Н.Остаток/Приход/Расход/К.Остаток/Разница)
- [ ] Отчеты → Отчеты по кассирам
- [ ] Отчеты → Отчеты по скидкам
- [ ] Отчеты → Движение денег (cash-flow statement: Продажи/Закупы/Расходы/
      Вложения/Дивиденды)
- [ ] Закупки → Возвраты поставщикам
- [ ] Закупки → Платежи (+ Консигнация, low priority)
- [ ] Продажи → Отмененные товары (voided-cart-line audit log)
- [ ] Продажи → Возврат покупателя (standalone return doc, not just refund-a-sale)
- [ ] Товары → Инвентаризация — upgrade to 4-stage workflow (Черновик → Подсчет →
      Проведение → Проведен) if not already there
- [ ] Товары → Категория create modal: add `defaultMarkupPercent` field
- [ ] Товары → Комплект (bundle/kit as standalone product with its own barcode)
- [ ] Товары → Услуга (service product: no cost, no stock tracking)
- [ ] Контрагенты → Покупатели: customer accounts with debt balance + bonus/loyalty
      points (beyond current discount cards)
- [ ] Управление → Типы расходов (expense-type list, feeds Финансы→Платежи)
- [ ] Управление → Консультанты (low priority — Nuray doesn't use it in UMAG either)
- [ ] Управление → Справочник (generic custom reference-list builder — low priority)
- [ ] Товары → Артикул (variant/SKU grouping — low priority, clothing-oriented)
- [ ] Товары → Перемещение (inter-store transfer — low priority, single-store)
- [ ] Отчеты по консультантам (low priority, ties to Консультанты)

## Explicitly out of scope
- Баланс и подписка / Расширения (UMAG's own SaaS billing + plugin marketplace —
  doesn't apply to a self-hosted app)

## Notes as we go
