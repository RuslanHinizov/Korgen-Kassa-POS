# UMAG Admin Panel — Full Teardown (for Korgen Kassa 1:1 layout clone)

Goal: replicate layout/buttons/features 1:1, Korgen's own logo/colors.

## Covered so far (prior session)
- Главная (dashboard): revenue/avg check/profit cards, revenue chart, Приёмки panel, Склад/Кассы/Счета panels
- Товары → Список товаров: table, filters (Заводские/Весовые/Внутренние/Услуги/Комплект/Артикул tabs), НКТ filter
- Товары → product edit: Основная информация и Цены tab (name, unit, barcode, доп код, НКТ, критич остаток, закуп/наценка/продажная/оптовая цена), Категории и быстрые товары tab
- Управление → Пользователи (Текущие/Бывшие/Должности/Выдать доступ tabs), user edit form, roles list
- Управление → Управление чеком (top/bottom receipt text, НДС toggle, Onlinekassa fiscal fields)
- Управление → Управление кассами (Кассы list, Настройка разрешений на кассе — full permission grid)
- Закупки → Приемка (list + detail: Основные/Бонус/Возврат tabs, draft/posted toggle, per-line markup)
- Отчеты → Прибыли и убытки (Выручка/Себестоимость/Валовая прибыль/Операционные расходы/Чистая прибыль)
- Отчеты → ABC-анализ (per product: ABC by revenue, ABC by profit, Свод)

## TODO — remaining screens
- [x] Отчеты → Статистика продаж
- [x] Отчеты → Отчеты по сменам
- [x] Отчеты → Отчеты по кассирам
- [x] Отчеты → Отчеты по скидкам
- [x] Отчеты → Отчеты по консультантам
- [x] Отчеты → Движение денег
- [x] Продажи → Отмененные товары
- [x] Продажи → Возврат покупателя
- [x] Закупки → Возвраты поставщикам
- [x] Закупки → Платежи (+ Консигнация)
- [x] Товары → Артикул
- [x] Товары → Быстрые товары ⭐ IMPORTANT
- [x] Товары → Склад
- [x] Товары → Списание
- [x] Товары → Оприходование
- [x] Товары → Инвентаризация
- [x] Товары → Перемещение (low priority, single-store)
- [ ] Товары → + Категория (create form)
- [ ] Товары → + Комплект (create form)
- [ ] Товары → + Услуга (create form)
- [x] Финансы → Обзор по счетам
- [x] Финансы → Платежи
- [x] Финансы → Переводы
- [x] Контрагенты → Покупатели
- [x] Контрагенты → Поставщики
- [x] Управление → Консультанты
- [x] Управление → Типы расходов
- [x] Управление → Настройки разрешений (global, not kassa-specific) ⭐ IMPORTANT
- [x] Управление → Справочник
- [~] Управление → Баланс и подписка — NOT VISIBLE to Администратор role, owner-only, skipped
- [~] Управление → Расширения — NOT VISIBLE to Администратор role, owner-only, skipped
- [x] Товары → + Категория (create modal)
- [x] Товары → + Комплект (bundle create)
- [x] Товары → + Услуга (service create)

## STATUS: full teardown complete (except 2 owner-only screens, low priority)

## Findings (append as I go)

### Отчеты → Статистика продаж (6 sub-tabs, shared "Фильтр" + "Скачать" export dropdown)
- **По товарам**: table per product — Название, Штрихкод, Ед.изм, [Продажи: Кол-во, Сумма продаж, Сумма себес.] [Возвраты: Кол-во, Сумма возвратов, Сумма себес.], Наценка, Рентабельность %, Прибыль. Footer totals row.
- **По чекам**: 3 KPI cards (Сумма продаж / Сумма платежей / Сумма скидок), Продажи/Возвраты sub-tabs, bulk checkbox+"Действие", columns: Номер чека, Дата и время, Точка продаж POS (счета — which kassa), Тип оплаты, Сумма, **Статус фискализации** (Не фискализирован/etc — per-sale fiscal status, matches our Sale.fiscalStatus). Row expandable (chevron) — presumably shows line items.
- **По категориям**: same Продажи/Возвраты column shape grouped by Категория, expandable rows. On real data ALL sales fell under "Незаданные" — Nuray never used categories in UMAG either.
- **По поставщикам**: same shape grouped by Поставщик — which supplier's goods sell best/most profitably.
- **По покупателям**: same shape grouped by Покупатель; default bucket "Розничный покупатель" for walk-in/no-customer sales.
- **Сравнение товаров**: same as По товарам but each row has an X to remove from comparison — a curated multi-product comparison view.

### Отчеты → Отчеты по сменам
Columns: №, Касса/кассир(?), Время открытия, Время закрытия, Н.Остаток (opening cash), Приход, Расход, К.Остаток (closing cash), Разница (shortage/surplus), Прибыль. = shift/Z-report ledger, matches our shift close but with cash-drawer reconciliation columns we may be missing (Н.Остаток/К.Остаток/Разница).

### Отчеты → Отчеты по кассирам
Columns: Имя, (кол-во чеков?), Сумма по продажам, Безнал, Возврат, Итого. Per-cashier totals.

### Отчеты → Отчеты по скидкам
Per discounted line sold: №, Название товара, Штрихкод, Количество, Ед.изм, Начальная цена, Скидка, Цена со скидкой, Время продажи. Flat list of every discounted sale line (not aggregated) — good for catching cashier discount abuse.

### Отчеты → Отчеты по консультантам
ID, Имя консультанта, Кол-во продаж, Сумма продаж, Кол-во возвратов, Сумма возвратов, Итого. Empty for Nuray — they never used the consultant/commission feature (low priority for a grocery store).

### Отчеты → Движение денег
Columns include: Продажи, Закупы, Расходы, Вложения (owner capital injections), Дивиденды (owner withdrawals) — true cash-flow statement by category, tied to Финансы accounts. We don't have this. Real Nuray data shown: ~150-200M ₸/month revenue for 34 months back; Расходы/Вложения/Дивиденды always 0 — they never used that part, tracked expenses outside UMAG.

### Продажи → Отмененные товары
Log of items scanned into cart then deleted before checkout (fraud/loss-prevention audit). Columns: Касса, Кассир, Название товара, Время, Количество. Ties to the "кто может удалять товар из списка" kassa permission we found earlier.

### Продажи → Возврат покупателя
List + "+ Возврат" (manual return doc). Columns: Номер, Дата, Контрагент, Статус, Сумма, Оплачено, Осталось, Комментарий — same shape as a purchase receipt (a return can be partially refunded over time). Note: UMAG's own list had a rendering bug here (footer said 76 rows/330,568₸ total but body said "Тут пока пусто") — a bug on their end, not something to replicate.

### Закупки → Возвраты поставщикам
List grouped by day with daily subtotal rows ("Итого 11 сентября" etc.) — nice UX pattern worth copying. Columns: Номер, Дата, Пользователь, Поставщик, Счет, Сумма, Оплачено, Осталось.

### Закупки → Платежи (2 sub-tabs)
- **Платежи**: payment ledger against receipts. Filters: Приемка (search), Со счета (account dropdown). Columns: Приемка(id), Время, Со счета, Поставщик, Пользователь, Сумма (negative = refund/reversal, e.g. a -990 row tied to a return).
- **Консигнация**: consignment-goods tracking (stock held but not yet owned/paid). Same column shape as Приемка. Empty for Nuray — not used, low priority for us.

### Товары → Артикул
"Parent SKU" / variant-group feature (like a clothing item with color/size "характеристики"). Columns: Название артикула, Артикул, Кол-во товаров, Кол-во характеристик. Empty for Nuray (grocery, no variants needed). Low priority.

### Товары → Быстрые товары ⭐⭐⭐ HIGH VALUE for a grocery store
This is the exact backing data for the "БЫСТРЫЕ ТОВАРЫ" button on the POS sale screen (from the marketing image the boss sent). Nuray actually uses this (79 items!) for loose/barcodeless staples: bread (нан булка, кеспе нан...), eggs (жумыртка), diapers (Хагис 0-4), store bags (Нурай Пакет), soap (Сабын), cups (Стакан), fish (Балык), holiday items (Новогодний).
- Left sidebar: "Группы быстрых товаров" — a folder tree of quick-item categories (Нан, Жумыртка, Подгузник, Салат Каймак Т,Б, Нурай Пакет, Сабын, Стакан, Балык, Галош, Новогодний), each with its own edit pencil.
- Main table: Наименование (display name on the POS button), Штрихкод (auto-generated internal PLU code, pattern like 211xxxxxxx), Оригинальное название (the real product it maps to/base name), edit + delete.
- "+ Быстрый товар" create button, "Сортировать товары" — drag-reorder mode controlling the button grid order on the actual POS screen.
- This is a SEPARATE catalog from Список товаров — a curated subset presented as tap-buttons, grouped into folders, for items sold without scanning a barcode (bulk bread, eggs by piece, a plastic bag). **We should build this as its own feature — it directly serves grocery checkout speed, matches Nuray's real daily workflow.**

### Товары → Склад
Live stock-valuation table (not a document, a report/view): Название товара, Штрихкод, Доп. код, Кол-во, Закупочная цена, Продажная цена, Сумма по закупочной, Сумма по продажной (= qty × cost and qty × price, aggregated) — this is what feeds the dashboard's "Склад: Продажная стоимость / Закупочная стоимость" cards.

### Товары → Списание (write-off/waste) — actively used by Nuray (58 docs/month, ~150k₸)
List: grouped by day with daily subtotal rows, "+ Списание" create, bulk Действие, Фильтр (date range + Статус документа: Проведен/Черновик), Экспорт. Columns: Номер, Дата, Статус документа, Пользователь, Комментарий, Общая сумма, view/edit.
Detail doc: Дата списания, "Товары (N)" line table with: Название товара, Штрихкод, **Причина списания** (dropdown reason code, e.g. "Испорчено" = spoiled), Кол-во, Текущий остаток на складе, Ед.изм, Цена, Закупочная цена, Наценка %, Продажная цена, Итого, Комментарий. Actions: Закрыть, Добавить комментарий, Отменить списание, Экспорт.
**Gap for us:** we don't have a formal write-off/waste document type with a categorized reason — worth adding (shrinkage tracking matters a lot for a grocery store with fresh bread/dairy). Also noticed: even in UMAG's own live data one item showed текущий остаток на складе = **-77276** (huge negative stock) — confirms Nuray's data has always been messy, not something specific to our import.

### Товары → Оприходование (manual stock-IN, not via supplier)
Same list shape as Списание (URL /debit vs /decom). Unused this month by Nuray — all stock-in goes through Приёмка instead. Lower priority than Списание but same document pattern, cheap to add symmetrically.

### Товары → Инвентаризация (physical stocktake)
List: Номер инвентаризации, Дата, Имя создателя, Комментарий, Статус документа. Status workflow has **4 stages**: Черновик → Подсчет (counting in progress) → Проведение → Проведен — more granular than a simple draft/posted toggle. Worth matching this workflow granularity if we build stocktake UI (we may already have a Stocktake model — check if it supports "counting in progress" as separate from draft).

### Товары → Перемещение (inter-store transfer)
Номер, Дата, В магазин (destination store), Пользователь, Комментарий, Статус документа, Общая сумма. Unused by Nuray (only relevant with 2+ stores). **Low priority — skip for now**, Nuray Market is single-store for Korgen's purposes.

### Финансы → Обзор по счетам (accounts overview)
"+ Счет" create. Columns: Счет, Тип (Наличный/Безналичный), Сумма, Отрицательный баланс (Разрешен/Запрещен toggle), edit + history icons. Real Nuray accounts: Сейф-1 (main safe, oddly at -4.97B ₸ — years of unreconciled data), Банковский счет, Кабинет касса, and one account PER physical register (Касса-1..7) that accumulates that register's cash. **Architecture: every kassa automatically has its own running cash-account balance**, separate from the main safe/bank — ties to the "внос/вынос средств" kassa permission.

### Финансы → Платежи (THE master ledger)
"+ Приход" / "− Расход" manual entry, Фильтр, Печать. Columns: #, Дата, Контрагент, Пользователь, **Назначение платежа** (purpose tag, e.g. auto-filled "Приемка"/"Возврат приемки" from linked docs, or manual categories), Сумма расхода, Сумма прихода, Счет, Комментарий. 517 rows for Nuray — this is the CENTRAL ledger that Закупки→Платежи (supplier-filtered view) and Отчеты→Движение денег both read from.
**Architecture takeaway for us:** one `CashMovement` table tagged by purpose/source-document, with filtered views per section (purchasing, finance, cash-flow report) — rather than separate ad-hoc tables per movement type. Worth adopting this pattern.

### Финансы → Переводы (inter-account transfers)
"+ Перевод". Columns: Номер, Дата, Со счёта, На счёт, Сумма, Пользователь, Комментарий. E.g. moving today's Касса-1 cash into Сейф-1. Completes the accounts model: Счета ↔ Платежи (all movements) ↔ Переводы (account-to-account moves).

### Контрагенты → Покупатели (customers)
Empty for Nuray (everything falls to "Розничный покупатель"). Columns: №, Имя, ИИН/БИН, Номер клиента, **Баланс** (customer debt/credit balance — this is what "Продажа в долг" kassa permission writes to), **Бонус** (loyalty points balance). **Gap for us:** we have discount cards (% off) but not full customer accounts with running debt balance + bonus/loyalty points. Worth a future roadmap item, not urgent since Nuray doesn't currently use it either.

### Контрагенты → Поставщики (suppliers) — dedicated screen
455 suppliers (matches our own ~510 import). Columns: #, Тип, Наименование, Магазин, ИИН/БИН, Полное наименование, Телефон, Адрес, Баланс, edit. "+ Поставщик" create, Фильтр, Скачать export.

### Управление → Консультанты
Simple list + "+ Создать консультанта". Empty for Nuray. Low priority.

### Управление → Типы расходов
Small editable list (5 defaults, each with Активно checkbox): Другое, Закуп мелочей, Заработная плата, Коммунальные расходы, Инкассация. Feeds the "Назначение платежа" category when logging a manual Расход in Финансы→Платежи.

### Управление → Настройки разрешений ⭐⭐⭐ HIGH VALUE, global site-wide config
**Настройка разрешений на сайте** (checkboxes): Автоизменение закупочной цены (по базе) ✓, Автоизменение продажной цены ✓, Автоизменение продажной цены комплекта, Автовосстановление удаленных товаров при приемке (коллектор/excel файл), Показывать контрагенты раздельно в магазинах, Скрывать остаток и разницу во время инвентаризации, Привязка продукта к поставщику при приемке ✓, Суммировать одинаковые товары ✓, Автосохранение приемки (каждые 2 минуты), **Включить систему лояльности с cashback**, Разрешить оптовые продажи, Скрывать закупочные/продажные суммы во время инвентаризации. Plus: "Создание документов с задним/передним числом на (дней)" = 365 (backdating window), "Округление продажной цены (номенклатуры)" = 1тг вверх.
**Настройки разрешений на кассе**: "Тип фискализации: Все" (global fiscal mode dropdown).
**Запреты на продажу на кассе** ⭐ — ban selling a whole Категория during a Время запрета (time window). Empty for Nuray but this is real Kazakhstan-relevant compliance (e.g. alcohol sale curfew by law). **We should add this** — category + time-window sale restriction.
**Ключ доступа для android кассы** — generates a one-time pairing code per kassa for an Android POS client to log in with (no username/password on the register itself — device-pairing auth). Table: ID, Название кассы, Платформа, Версия, Дата последней синхронизации, Статус (Сессия завершена/активна). Confirms an Android POS client exists alongside the Windows one, both showing version "3.3.4".

### Управление → Справочник
Generic custom reference-list builder ("+ Справочник" → name + list of entries), used elsewhere as a custom taxonomy/dropdown source. Empty for Nuray. Low priority, generic feature.

### Управление → Баланс и подписка / Расширения — INACCESSIBLE with test account
Both items are missing from the Управление dropdown for an Администратор-role account (only appeared for the Владелец/Owner role in the very first screenshots the boss sent). Billing/subscription and the addon marketplace are **owner-only**. Did not attempt further access (would require the real owner login) — reasonable to skip, these are SaaS-billing concerns irrelevant to our self-hosted app anyway.

### Товары → "+ Категория" (create modal)
Just 2 fields: Категория (name) + **Наценка %** — confirms categories carry a **default markup percentage** inherited by products assigned to them (matches "Наценка по умолчанию устанавливается от выбранной категории" text seen on the product edit form). **Gap for us:** our Category model should carry a `defaultMarkupPercent`.

### Товары → "+ Комплект" (bundle/kit creation) — standalone sellable combo product
3 sections: Основная информация (Название, Ед.изм, Штрихкод, Доп.код — bundle gets its OWN barcode, sold as one scannable item), Детали комплекта (component picker: search/barcode/"+ Создать товар" inline/"Номенклатура" browse; table of components — №, Название, Штрихкод, Кол-во, Ед.изм, Закуп.цена, Наценка, Прод.цена; "Дополнительные расходы" extra cost like packaging; auto-computed "Себестоимость комплекта"; then a "Цена на весь комплект" section below), Категории и быстрые товары.
Different from our Promotion BUNDLE_PRICE (a discount rule) — this is a **real standalone product** with its own barcode/stock that happens to be composed of other products. Worth having both concepts.

### Товары → "+ Услуга" (service creation) — no-cost, no-stock sellable item
Simpler form: Название, Ед.изм, Штрихкод, Доп.код, Категория/Подкатегория, and under Цены just **Продажная цена** (no closing/cost price field — a service has no COGS). "Добавить в быстрые товары" link. Use case: delivery fee, gift wrapping, etc. Low priority for grocery but cheap: could just be `Product` with `trackStock=false` and no cost field required.
