# Korgen Kassa — Çevrimdışı Kasa ve UMAG Eşleştirme Planı

Bu dosya kasa ekranı için yapılacak her işin listesidir. **Biten her madde `[+]` ile işaretlenir**, yapılmamışlar `[ ]` kalır, üzerinde çalışılanlar `[~]`.

Son güncelleme: 2026-09-26

---

## 1. Neden yapıyoruz

Marketteki kasa ekranı şu an tamamen internete bağlı. İnternet giderse **satış yapılamıyor**. UMAG'ın kasası ise bilgisayara kurulan bir programdır: her işlemi önce yerel veritabanına yazar, internet gelince sunucuya gönderir. Aynı davranışı Korgen'de (web tabanlı) kuracağız.

**Kural (kalıcı):** UMAG'dan alınan her ekran tasarım, işlev ve davranış olarak birebir aynı olacak. Markaya ait her şey Korgen'in kendisi olacak.

**Birebir ne demek (2026-09-26, kullanıcı netleştirdi):** Sadece sayfanın görünümü değil; **çalışma biçimi, işlevlerin birbirine bağlanışı ve her düğmenin ne yaptığı** da aynı olacak. Yani: hangi düğme neyi açar, hangi alan neyi hesaplar, hangi durumda ne devre dışı kalır, hangi hatada hangi uyarı çıkar, işlem hangi sırayla yapılır. Bir ekranı "bitti" saymadan önce UMAG'daki davranış senaryoları (bkz. 3.1) tek tek karşılaştırılır.

**İzin:** UMAG, kasa dosyalarını verdi ve kendi uygulamamızda kullanabileceğimizi söyledi (sözlü). Kaynak kod veya sunucu belgesi verilmedi. UMAG'ın programını kendi sunucumuza bağlamıyoruz, kendi kasa ekranımızı yazıyoruz. Yazılı bir kanıt (mesaj ekran görüntüsü) alınması önerildi.

---

## 2. Verilen kararlar

- [+] Yol: **kendi web kasamızı yazmak** (UMAG programını taşımak değil).
- [+] UMAG kasası yalnızca **ekran ve davranış örneği** olarak kullanılır.
- [+] **Stok (2026-09-26, kullanıcı: "UMAG'da nasılsa öyle olsun"):** UMAG'ın kasa programında stok yetersizliği için satışı engelleyen **hiçbir uyarı metni yok** (programdaki metinler tarandı); yalnızca "Сумма недостаточна для оплаты покупки" (alınan tutar yetersiz), iade için "Количество не может быть больше чем в чеке" gibi kontroller var. Bu yüzden Korgen de **UMAG gibi**: stok sıfır/yetersiz olsa bile satış yapılır, stok eksiye düşebilir (rapor/uyarıda görünür). Bu, çevrimiçi kasa için de geçerli olacak (şu an Korgen'de adet, stokla sınırlı; bu **UMAG'a uyum için değiştirilecek**, Adım 1 içinde).
- [+] **Fiskal (2026-09-26, kullanıcı):** Kendi (Korgen) fişimiz çevrimdışıyken de oluşturulur; **fiskal (OFD) kısmı internet gelince tamamlanır**. Çevrimdışı satış "fiskal bekliyor" olarak işaretlenir.

---

## 3. Yapılanlar (araştırma) — ADIM 0

- [+] UMAG kasa klasörünün incelenmesi (`Umag Kassa/`): JavaFX + Spring/Hibernate + yerel HSQLDB, REST eşitleme.
- [+] Eşitleme döngüsünün loglardan çıkarılması (yaklaşık 5 dakikada bir; satış/vardiya/iade/iptal/müşteri gönderilir; ürün/barkod/hızlı ürün/tedarikçi/kategori/kullanıcı alınır).
- [+] UMAG'ın çevrimdışı davranışının anlaşılması: yerel kayıt + "gönderildi" işareti, yerel kasiyer şifresi, açılışta saat doğrulama ekranı.
- [+] Sunucu adresinin programa sabit yazıldığının tespiti (`api.umag.kz`, ayrıca ofis ağı için `umag.local`, `umag2.local`, `umag3.local`).
- [+] İzole çalışma kopyası kuruldu: `_umag-sandbox/` (git dışında). İçinde 32 bit Java 8, kasa kopyası, ölü proxy ile başlatıcı. **Bu kopyada gönderilmemiş gerçek market verisi var; asla internete bağlanmaz.**
- [+] UMAG kasa ekranlarına canlı bakıldı ve ekran görüntüleri alındı (`_umag-sandbox/shots/`): satış, vardiya (3 sekme), para giriş/çıkış penceresi, satış geçmişi, fiş detayı, iade, ek fonksiyonlar menüsü, hızlı ürünler.
- [+] Korgen kasa kodunun UMAG ile karşılaştırılması (bu belgenin 4. bölümü).
- [+] Bulguların hafızaya kaydedilmesi (`project-umag-kassa-desktop-client`).
- [+] Ödeme ekranı görüldü (kullanıcı ekran görüntüsü verdi, bkz. ADIM 2b).
- [ ] Bakılmamış UMAG ekranları: УНИВЕРСАЛЬНЫЙ ПРОДУКТ, ИЗМЕНИТЬ ТОВАР, ОТЛОЖКА, ДОЛГ, БЫСТРАЯ ПРИЕМКА, СВЕРНУТЬ, iade dolu ekran, ekran klavyesi, giriş ekranı ayrıntıları, ödemenin diğer sekmeleri (Безналичная, Смешанная, В долг).
- [ ] UMAG kopyasının silinmesi (iş bitince; **silmeden önce sor**).

### 3.0 UMAG'da canlı gözlenen davranışlar (2026-09-26, `_umag-sandbox` kopyası, ağ kapalı)

**Ödeme penceresi (Наличная):**
- İlk açılışta tutar alanında `0` **seçili**; rakam yazılırsa yerine geçer.
- `+200 / +500 / +1000 / +2000 / +5000 / +10000`: **alandaki tutara toplayarak ekler** (0 → +500 = 500.00 → +200 = 700.00). Üstteki **ПОЛУЧЕНО anında** güncellenir.
- **ОЧИСТИТЬ:** alanı `0.00` yapar, ПОЛУЧЕНО `0.00`.
- Alan biçimli (`700.00`) ve imleç **başta**: rakam tuşları imlecin bulunduğu yere ekler. `0.00` iken `2` + `0` `0` `0` yazınca `20000.00` oldu (yani başta duran `0` kalıyor). **`←` imleç başta olduğu için bir şey silmedi.** *(Bu, UMAG'ın gerçek davranışı mı yoksa yalnızca farenin imleci başa koymasından mı, doğrulanmadı; fiziksel klavye ile ayrıca denenecek.)*
- **СДАЧА** = ПОЛУЧЕНО − К ОПЛАТЕ, **kırmızı** renkte (20000 alındığında 18250.00). Alınan, ödenecekten azsa 0.00.
- **Безналичная (kart):** alan otomatik **tam ödeme tutarıyla dolu** (1750.00), simge kart; ПОЛУЧЕНО = 1750.00 hemen.
- **Смешанная (karma):** iki alan: üstte nakit (0.00, seçili), altta kart (0.00, kart simgeli); aynı tuş takımı.
- **В долг (borç):** **ayrı tam ekran**; üst çubuk turkuaz. **НОВЫЙ ДОЛЖНИК** düğmesi, arama, tablo (Полное имя / Тел. номер / Сумма / Дата и время). Altta kart: "Продажа в долг на сумму 1750.00 тг", "Должник: не выбран", "Общая сумма долга 0 тг". Düğmeler **НАЗАД** ve **ЗАПИСАТЬ**.
- **НАЗАД** (borç ekranında) doğrudan **satış ekranına** döner (ödeme penceresine değil), sepet korunur.
- **ОПЛАТА С ОФД:** soluk (pasif) — çevrimdışı/fiskal yok.

**Satış ekranı düğmeleri:**
- **ИЗМЕНИТЬ ТОВАР:** pencere: "Название товара" (ad, düzenlenebilir), "Продажная цена" (`1750.000`, seçili), yeşil rakam tuş takımı (1-9, 0, `.`, `←`), **Отменить / Сохранить**.
- **КОЛИЧЕСТВО:** pencere: başlık, alan `1` (seçili), tuş takımı, **УДАЛИТЬ** (sil), **ОТМЕНА**, **OK**.
- **УНИВЕРСАЛЬНЫЙ ПРОДУКТ:** pencere: "РЕДАКТИРОВАНИЕ УНИВЕРСАЛЬНОГО ПРОДУКТА. УКАЖИТЕ ЦЕНУ" — **yalnızca fiyat** sorar (`0` seçili), УДАЛИТЬ / ОТМЕНА / OK.
- Sepet satırı: `# | Наименование | Цена ТГ | Количество ШТ | Скидка % | Сумма ТГ`; seçili satır gri. Arama kutusunda soluk "молоко" ipucu.
- Modal açıkken arka plan koyulaşır, üst çubuk da kararır.
- Klavye simgesi arama kutusunda (ekran klavyesi).

**Programdaki uyarı metinlerinden (jar taraması):** "Сумма недостаточна для оплаты покупки" (nakit alınan < ödenecek iken ödeme reddedilir), "Проверьте наличие интернета" (para giriş/çıkışında), "Поправьте количество этого товара" (tartılı ürünlerde adet kuralı), "Невозможно выставить количество товара равное или больше 1" (tartılı ürün), "Продукт с нулевым количеством нельзя вернуть" (iadede sıfır adet), "Количество не может быть больше чем в чеке" (iade adedi), "Недостаточно прав" / "У кассира с данным идентификационным признаком недостаточно прав" (yetki). **Stok yetersizliği uyarısı yok.**

**Arama ve ekran klavyesi (satış ekranı):**
- Arama kutusundaki klavye simgesi **ekran klavyesi** açar: Rusça ЙЦУКЕН dizilimi, ← (sil), sayı bloğu (0-9 ve `.`), **ОТМЕНИТЬ**, **OK**, **СИМ** (semboller), **ENG** (İngilizce), boşluk, shift (↑).
- Yazarken **anında öneri listesi** açılır: en fazla **10 satır**, her satırda ürün adı (solda) ve barkod (sağda). Sıralama alfabetik değil (ör. "мол" için "молоток родекс 200гр, мольберт, молоток резиновая ручка…"). Öneri yalnızca **yazı değişince** açılır; klavyeyi yeniden açmak listeyi göstermez.
- **OK** klavyeyi kapatır, yazı kutuda kalır, **sepete ürün eklemez**.
- Bir öneriye dokununca ürün **adet 1** ile sepete eklenir, **yeni satır seçili** olur, arama kutusu **temizlenir**, ekran klavyesi **açık kalır**.
- **+ / −:** seçili satırın adedini **1** artırır/azaltır; satır tutarı ve ИТОГО **anında** güncellenir.
- **Tablo başlığındaki СКИДКА alanı = "toplam yüzde indirim":** tıklayınca "Укажите общую скидку в процентах" penceresi (tuş takımı, УДАЛИТЬ/ОТМЕНА/OK). `10` girilince **her satıra %10** uygulanır: satırda `10.00 %`, tutarlar düşer (1750→1575.00, 560→504.00), ИТОГО 2310→2079.00, alanda `10.00 %` görünür. (Satır bazlı ayrı indirim bu ekranda görülmedi.)
- **ОТЛОЖКА (bekletme):** pencere açılır; **+** kutucuğu mevcut sepeti bekletir (sepet boşalır, "Список пуст"; +, −, УДАЛИТЬ, ОПЛАТА pasif olur; **ИТОГО eski tutarı gösterir — UMAG'da küçük bir tutarsızlık**). Bekleyen satış kutucuk olarak görünür: adı **"КЛИЕНТ 1"** (otomatik numaralı), altında ürün adları ("пакет"). Kutucuğa dokununca sepet **geri gelir**. ЗАКРЫТЬ ile kapanır.

**İade sekmesi (ВОЗВРАТ):**
- **С ЧЕКОМ / БЕЗ ЧЕКА** seçeneği. Fişli: fiş numarası kutusu + ОЧИСТИТЬ. **Fişsiz:** kutu **ürün arama**ya (ekran klavyeli) dönüşür.
- Alt: **СУММА ВОЗВРАТА**, düğmeler **МАРКИРОВКА ТОВАРА**, **БЫСТРЫЕ ТОВАРЫ**, **ПОИСК ПО ШТРИХКОДУ**, **КОЛИЧЕСТВО**, **УДАЛИТЬ**, **ВОЗВРАТ**. Fişli modda БЫСТРЫЕ ТОВАРЫ/ПОИСК ПО ШТРИХКОДУ **pasif**, fişsizde aktif.
- **МАРКИРОВКА ТОВАРА** ürün seçili değilken: uyarı penceresi **"Выберите продукт — Не выбран продукт"** (OK).
- **ПОИСК ПО ШТРИХКОДУ:** "ШТРИХ КОД" penceresi (tuş takımı, УДАЛИТЬ/ОТМЕНА/OK). Bilinmeyen barkod (`12`) → **"Не найдено — Продукт с данным кодом не найден"** (OK).

**Borç ekranı (В долг / Ek fonksiyonlar → ДОЛГ):**
- Aynı tam ekran: НОВЫЙ ДОЛЖНИК + arama + tablo (Полное имя / Тел. номер / Сумма / Дата и время). Ödemeden gelince altta "Продажа в долг на сумму", "Должник", "Общая сумма долга", düğmeler **НАЗАД / ЗАПИСАТЬ**; ek fonksiyonlardan gelince "Продажа в долг" satırı yok, düğmeler **НАЗАД / ПОГАСИТЬ** (borç kapat).
- **НОВЫЙ ДОЛЖНИК:** form: **\*Полное имя** (zorunlu), **\*Номер телефона** (zorunlu, maske `+7 (7__) ___ __ __`), tam ekran klavye (sayı sırası + Rusça + СИМ/ENG/boşluk/shift), **ОТМЕНИТЬ / СОЗДАТЬ**.

**БЫСТРАЯ ПРИЁМКА (hızlı mal kabul, Ek fonksiyonlar'dan):** form: **Сумма**, **Дата приемки** (tarih + saat, takvim ve saat seçici), **Поставщик** (tedarikçi arama + klavye), **Комментарий**, onay kutusu **"Под консигнацию"** (konsinye), **Взнос** (ön ödeme), **ОТМЕНА / СОХРАНИТЬ**.

**Arayüz notları:** modal pencereler ayrı Java pencereleri; ilk tıklama bazen sadece odak alır (ikinci tıklama gerekir). Fişli iade modunda sepet yerine "ПУСТОЙ СПИСОК" yazısı.

**Vardiya:** bkz. 6. bölüm. **Geçmiş / ek fonksiyonlar menüsü / hızlı ürünler:** ekran görüntüleri `_umag-sandbox/shots/`.

**Henüz bakılmayanlar (bilerek):** СИНХ. С СЕРВЕРОМ, ПРОВЕРИТЬ ОБНОВЛЕНИЕ (ağa çıkmaya çalışır), ЗАБЛОКИРОВАТЬ КАССУ (kilitler, şifre gerekir), ВЫХОД ИЗ ПРОГРАММЫ, СВЕРНУТЬ, РАСПЕЧАТАТЬ ЧЕК, ВКЛ/ВЫКЛ ПРИНТЕР, ДОБАВИТЬ ДОП ПРИНТЕР, giriş ekranı ayrıntıları, история 2. sayfa/takvim. **СДАТЬ СМЕНУ akışı (2026-09-27):** kısmen bakıldı — banknot/сумма/внос ekranları ve açılıştaki saat doğrulama ekranı gözlendi (bkz. 6. bölüm), ama gerçek rakamlarla kapatınca çıkan sonuç ekranı giriş ekranı şifresi bilinmediği için görülemedi.

**Bulunan yan bilgi:** UMAG'ın satış ekranında **ödeme penceresi ayrı bir pencere** (Java penceresi), borç ekranı ise ana pencerenin içinde tam ekran.

### 3.1 Davranış (işlev) inceleme listesi

Bu senaryolar UMAG kasasında sırayla denenir/gözlenir ve sonuç aşağıya yazılır. Korgen'in her ekranı bu listeyle karşılaştırılır. **Kasa kopyasında gerçek satış onaylanmaz** (gönderilmemiş kayıt üretir); ödeme ekranlarına yalnızca bakılır, ОПЛАТА onay düğmesine basılmaz.

- [ ] Sepet: ürün ekleme (aynı ürün tekrar → adet artar mı, yeni satır mı), satır seçme, adet değiştirme, indirim (% olarak satır bazında), fiyat değiştirme kuralları.
- [~] Ödeme (Наличная) (tutar düğmeleri, ОЧИСТИТЬ, СДАЧА gözlendi; БЕЗ СДАЧИ ve yetersiz tutarla ОПЛАТА henüz denenmedi): tutar alanı, +200/+500/+1000/+2000/+5000/+10000 düğmeleri (üstüne ekler mi, yerine mi yazar), ← ve ОЧИСТИТЬ, БЕЗ СДАЧИ, para üstü hesabı, yetersiz tutarla ОПЛАТА.
- [~] Ödeme (ekranlar gözlendi, alanlar ve doğrulamalar kalan): Безналичная, Смешанная (iki tutar nasıl girilir, toplam kontrolü), В долг (müşteri seçimi zorunlu mu, limit).
- [ ] ОПЛАТА С ОФД: ne zaman aktif olur, ne yapar (fiskal çek).
- [ ] Ödeme sonrası: fiş gösterilir mi, yazdırılır mı, sepet temizlenir mi, fiş numarası nasıl görünür.
- [ ] ОТЛОЖКА: nasıl bekletilir, nasıl geri alınır, listede ne görünür.
- [+] ИЗМЕНИТЬ ТОВАР ve УНИВЕРСАЛЬНЫЙ ПРОДУКТ (ve КОЛИЧЕСТВО penceresi) gözlendi, bkz. 3.0: alanlar, doğrulamalar.
- [ ] Vardiya: açık vardiya yokken satış yapılabilir mi, kapatınca ne hesaplanır, fark uyarısı.
- [ ] İade: fişle/fişsiz, hangi ürünler iade edilebilir, adet sınırı, nakit iadesi nasıl yazılır.
- [ ] Çevrimdışıyken her yukarıdaki işlemin davranışı (uyarılar, hangi düğmeler kapanır).
- [ ] Yetki/kısıtlar: kasiyer bazlı yasaklar (fiyat düşürme, silme, iade) UMAG'da nasıl uygulanıyor.

---

## 4. Korgen ile UMAG farkları (kodu okuyarak çıkarıldı)

### Aynı olanlar
- [+] Üst çubuk (kasiyer, saat, sürüm, 4 sekme, cihaz durumu).
- [+] Ürün arama, sepet tablosu, ИТОГО kartı.
- [+] Alt düğmeler: hızlı ürünler, ürünü değiştir, artı/eksi, beklemeye al, ek fonksiyonlar, serbest ürün, sil, ödeme.
- [+] Ek fonksiyonlarda: indirim kartı, müşteri, danışman, ürün oluşturma, etiket, fiyat kontrolü, global arama, tam ekran.
- [+] Vardiya: açma, para giriş/çıkış, X raporu, kapatma (Z).
- [+] İade (fişli/fişsiz), satış geçmişi, bekleyen satışlar.

### Eksikler
Bunların hepsi aşağıdaki adımlarda ele alınıyor.

| # | Eksik | Adım |
|---|-------|------|
| 1 | Çevrimdışı çalışma (yerel depo, kuyruk, çift kayıt koruması, kasa fiş numarası) | 1 |
| 2 | Bağlantı göstergesi, "gönderilmemiş veri" uyarısı, saat kontrolü, çevrimdışı giriş | 1 |
| 3 | Vardiya tam ekran, banknot/bozuk para sayımı, UMAG para türleri (Вложения/Расходы/Дивиденды) | 2 |
| 4 | Ek fonksiyonlar: kasayı kilitle, yazıcıyı aç/kapat, son fişi yazdır, elle eşitleme, borç, güncelleme kontrolü, ikinci yazıcı, hızlı mal kabul | 3 |
| 5 | İade: ürün işaretleme (Маркировка), barkodla arama | 3 |
| 6 | Üst çubukta sabit "Учебный" yazısı (UMAG'da kasa adı), boş "Производитель/Заказ/Доставка" listeleri | 3 |
| 7 | Satış geçmişinde fiskal sütun ve düğme | 4 |

---

## 5. ADIM 1 — Çevrimdışı katman (en öncelikli)

### 5.1 Veri tabanı değişikliği
- [+] `Sale` tablosuna istemcide üretilen benzersiz kimlik ekle (`clientSaleId`, benzersiz). Aynı satış iki kez gönderilirse ikincisi **mevcut olanı döndürür**, çift kayıt oluşmaz.
- [+] `Sale` tablosuna kasa bazlı fiş numarası ekle (örn. `K4-000123`; kasa adı + kasaya özel sayaç). Sunucudaki `documentNo` (otomatik artan) çevrimdışıyken kullanılamaz. *(Yapıldı 2026-09-26: `Sale.receiptNo`; biçim `<kasa kodu>-<sayaç>`, ör. `3A6B-000001`; kasa kodu tarayıcıda saklanır, sayaç IndexedDB'de atomik artar.)*
- [+] `Sale` tablosuna satışın **gerçekte yapıldığı zaman** (`soldAt`, kasanın saati) ve **sunucuya ulaştığı zaman** ekle; ikisi farklı olabilir. *(Yapıldı: ayrı sütun yok; kasanın satış zamanı `createdAt` olur, `Sale.offline` işaretlenir. Zaman penceresi: en fazla 14 gün geriye, en fazla 5 dk ileriye; satış, o anda açık olan vardiyaya değil, satış anında süren vardiyaya bağlanır.)*
- [+] Aynı şeyi `Refund`, `Shift`, `CashMovement`, iptal edilen ürün kaydı için de yap (kendi `clientId` alanları). *(Yapıldı 2026-09-26: ayrı sütun yerine kasanın ürettiği kimlik satırın kendi `id`'si olur (vardiya, para hareketi, iade, fişsiz iade); tekrar gönderim aynı satırı döndürür. `SaleItem.lineNo` eklendi (migration `20260926150000_sale_item_line_no`) — henüz yüklenmemiş satışın satırlarına `L:<n>` ile başvurulur.)*
- [~] Prisma migration + canlı sunucuda güvenli uygulama (yedek alarak). *(Yerelde uygulandı: `20260926120000_offline_sales`. Canlı sunucuda henüz yok.)* *(İkinci migration: `20260926150000_sale_item_line_no`. Canlı sunucuda hâlâ uygulanmadı.)*

### 5.2 Sunucu uçları
- [+] `POST /api/sales`: `clientSaleId` kabul et, çift kayıt koruması, `soldAt` kabul et (makul aralıkla sınırla: gelecekteki zaman ve çok eski zaman reddedilir).
- [+] Aynı korumayı iade, vardiya açma/kapama, para giriş/çıkış, iptal kayıtlarına ekle. *(Yapıldı ve doğrulandı: `POST /api/shifts`, `POST /api/shifts/[id]` (kapatma), `POST /api/cash-movements`, `POST /api/sales/[id]/refund` (satış `id` ya da `clientSaleId` ile), `POST /api/pos/returns/without-receipt`. Her biri kasa saatini (`trustedTime`) ve gerçek kasiyeri (`cashierUserId`, yalnızca o markete atanmış çalışan için) kabul eder. `src/lib/offline-write.ts`)*
- [~] Toplu gönderme ucu: kuyruktaki kayıtları sırayla alır, her biri için "kabul / zaten var / hata" döndürür. *(Toplu uç yapılmadı; kuyruk kayıtları sırayla tek tek gönderilir, sunucu her biri için 201/200(duplicate)/hata döndürür. Yeterli.)*
- [+] Kasa için "başlangıç verisi" ucu: ürünler, fiyatlar, barkodlar, hızlı ürünler, kategoriler, kasiyerler, ayarlar, promosyonlar, müşteriler (yalnızca o mağazanın).
- [+] Artımlı güncelleme: "şu zamandan beri değişenler" (UMAG'daki `edit time` mantığı).
- [+] Mağazalar arası izolasyon: her yeni uç `getStoreId()` ile korunur; **çapraz mağaza tarayıcısı** (`scripts/tenant-scan`) yeni uçlar için çalıştırılır. *(Çalıştırıldı 2026-09-26: 0 API bulgusu.)*

### 5.3 Tarayıcı tarafı
- [+] Yerel depo (IndexedDB): ürünler, barkodlar, fiyatlar, hızlı ürünler, kategoriler, kasiyerler, ayarlar, promosyonlar, müşteriler. *(Yapıldı: ürünler, kasiyerler (offline giriş, `auth.ts`), ayarlar/izinler, aktif promosyonlar — bkz. 5.5; hızlı ürünler ve müşteri kopyası (`src/lib/offline/customers.ts`) 2026-09-28 eklendi. İndirim kartı: toplu liste kasiyer rolüne kapalı olduğu için önceden indirilemiyor — bunun yerine her başarılı çevrimiçi sorgu yerelde saklanıyor (`src/lib/offline/discount-cards.ts`), böylece daha önce bu kasada okutulmuş bir kart offline'da da çalışıyor; hiç görülmemiş bir kart offline doğrulanamaz — gerçekçi sınır.)*
- [+] Yerel depo: **gönderilmemiş kuyruk** (satış, iade, vardiya, para hareketi, iptal). Her kayıtta durum (bekliyor / gönderiliyor / gönderildi / hata) ve deneme sayısı. *(Yapıldı: yalnızca satış. İade, vardiya, para hareketi, iptal kaydı henüz kuyruğa girmiyor.)* *(Yapıldı: satış, iade, fişsiz iade, vardiya açma/kapama, para hareketi. Kuyruk kimliği = kasanın ürettiği kimlik.)*
- [+] Kasa fiş sayacı (yerelde saklanır, yenileme/kapanma sonrası korunur).
- [+] Ürün arama yerelden yapılsın (internet olsun olmasın aynı hız).
- [+] Satış anında: yerelde kaydet → ekranda fişi göster → arka planda gönder. Gönderme başarısızsa kuyrukta kalır.
- [+] Yeniden deneme: üstel bekleme, internet geri geldiğinde hemen dene (`online` olayı). *(Sabit aralıklarla: 15 sn bağlantı denetimi, 30 sn kuyruk gönderme, `online` olayında hemen; üstel bekleme yok.)*
- [+] Artımlı veri çekme: açılışta ve periyodik (varsayılan 5 dakika), değişen ürünleri günceller.
- [+] Yerel veride stok: satışta yerel stok düşer (eşitlenince sunucunun gerçek değeri gelir). *(Yapıldı 2026-09-28: `applyLocalStockDelta` (`catalog.ts`) — çevrimdışı kuyruğa giren satışta düşer, fişli/fişsiz iadede geri artar; yalnızca `submitSale`/`sendOrQueue` sonucu `queued: true` döndüğünde uygulanır, çünkü sunucuya doğrudan ulaşan işlemde bir sonraki katalog eşitlemesi zaten gerçek değeri getirir.)*
- [+] **Promosyonlar yerelden hesaplanır (2026-09-27):** `evaluatePromotions` zaten saf/izomorfikti (sunucu VE kasa ekranı aynı fonksiyonu çağırıyordu) — eksik olan kuralların kendisiydi: `/api/promotions/active`'in tek seferlik `fetch`'i internetsizken sessizce boş kalıyordu (`.catch(() => {})`), yani sayfa çevrimdışı açılırsa hiç indirim uygulanmıyordu (bu, projenin başındaki orijinal UMAG şikâyetinin ta kendisi). Düzeltme: yeni `src/lib/offline/config-cache.ts` (IndexedDB `meta` deposu, şema değişikliği yok) — her başarılı `fetch` sonucu önbelleğe yazılıyor, başarısız `fetch`'te son iyi kopya okunuyor. Aynı mekanizma `/api/settings` (vergi oranı + kasa izinleri: iade/silme/miktar-azaltma kimlere açık) için de uygulandı — internetsiz açılışta varsayılanlara (hepsi "ALL") sessizce dönmek, marketin bilerek kısıtladığı bir izni görünmeden gevşetmek anlamına gelirdi, artık son bilinen gerçek ayar kullanılıyor. İndirim kartı sorgusu (`/api/discount-cards`) kapsam dışı bırakıldı — ayrı bir iş.
- [+] Bekleyen satışlar (beklemeye al) yerel de çalışsın. *(Yapıldı 2026-09-28: `src/lib/offline/held-orders.ts` — satış ekranındaki **ve ödeme ekranındaki** beklemeye alma önce sunucuya dener, başarısızsa (internetsiz) tamamen yerelde saklar; liste hem sunucu hem yerel-yalnız kayıtları birleştirir, geri çağırma/silme kaydın nereden geldiğine göre doğru tarafa gider.)*

### 5.4 Sayfa internetsiz açılsın
- [+] `/pos` sayfası ve gereken tüm dosyalar (`_next/static`, yazı tipleri, simgeler) service worker ile saklanır. Şu an `sw.js` yalnızca birkaç sayfayı önbelleğe alıyor ve API isteklerine karışmıyor. *(Yapıldı 2026-09-26. **Bulunan hata:** eski `sw.js` kurulum sırasında olmayan `/icons/icon.svg` dosyasını önbelleğe almaya çalışıp (404) hiç kurulmuyordu; yani sayfanın internetsiz açılması hiç çalışmamıştı. Yeniden yazıldı: gezinme (sayfa) önbelleği, `/pos` → `/store/<id>/pos` yönlendirmesi, POS başlangıç GET istekleri (ayarlar, vardiya, promosyon, danışman, hızlı ürün, kasa) için ağ-önce + önbellek yedeği, yazma istekleri önbelleğe alınmaz. Çıkışta (`signOut`) önbellekler ve katalog kopyası silinir; gönderilmemiş satış kuyruğu silinmez.)*
- [+] Sunucu güncellenince yeni sürümün otomatik alınması (eski önbellek temizliği). *(Yapıldı: sürüm `v2`, eski önbellekler `activate` sırasında silinir.)*
- [+] İnternetsiz açılışta giriş ekranı (aşağıya bak).

### 5.5 Çevrimdışı giriş
- [+] Kasiyer listesi ve giriş bilgisi yerelde saklanır. **Düz metin şifre saklanmaz.** Sunucuda kullanılan doğrulamanın yerel bir türevi (ör. tuzlanmış hash) saklanır, yalnızca o kasadaki çalışanlar için. *(Yapıldı ve doğrulandı: çevrimiçi girişten sonra tuzlu PBKDF2-SHA256 (210 bin tur) hash'i saklanır, düz şifre yok; 5 yanlış denemede 5 dk kilit. Yalnızca bu kasada çevrimiçi giriş yapmış kasiyerler girebilir. `src/lib/offline/auth.ts`)*
- [+] Çevrimdışı oturum süresi sınırlı; internet gelince sunucu ile yeniden doğrulanır. *(Yapıldı: son sunucu doğrulamasından/girişten 16 saat sonra kasa yeniden giriş ister (`TILL_AUTH_TTL_MS`). Sunucuya ulaşılamıyor ve geçerli kayıt yoksa kasa sayfası kendiliğinden giriş sayfasına yönlendirir.)*
- [~] Kasiyer devre dışı bırakılırsa (kovulursa) internet gelince yerel kayıt silinir. *(Sunucu tarafı tam: `attributedUserId` o kasiyerin yüklemesini reddeder/yok sayar. Yerel taraf 2026-09-28'de eklendi: `forgetCashier` (`auth.ts`) — kovulan kasiyer bu kasada tekrar ONLİNE giriş denediğinde sunucudan kesin "уволен" (kovuldu) cevabı gelirse yerel hash kaydı hemen silinir (`kasa-giris/page.tsx`). Sınır: o kasiyer kovulduktan sonra bu kasada hiç tekrar online girişi denemezse (ör. anahtar zaten elinden alınmışsa), yerel hash bir sonraki fiziksel silme/çevrimdışı-girişe kadar kasada kalmaya devam eder — sunucudan kasaya anlık "bu kasiyeri unut" sinyali göndermenin bir yolu yok, tarayıcı tabanlı mimarinin doğal sınırı.)*
- [+] Marketteki mevcut giriş ekranı (`/kasa-giris`) ile uyum. *(Yapıldı: `/kasa-giris` aynı görünümde; internet yoksa kayıtlı bilgiyle girer, gerekirse market seçtirir. Giriş sayfası service worker önbelleğine ısıtılır.)*

### 5.6 Arayüz göstergeleri (UMAG ile aynı)
- [+] Üst çubukta bağlantı noktası: internet varsa yeşil, yoksa kırmızı.
- [+] Gönderilmemiş kayıt varsa uyarı çubuğu: "Есть не синхронизированные данные. Пожалуйста подключите интернет." (kapatılabilir).
- [+] Gönderilmemiş kayıt sayısı gösterilir; hata alan kayıtlar için ayrı uyarı ve elle tekrar deneme. *(Yapıldı; ayrıca **oturum kapalıyken** yükleme bekliyorsa kırmızı 'Данные ждут отправки: войдите в кассу заново' + Войти bağlantısı.)*
- [+] **Saat doğrulama (2026-09-28):** UMAG'daki açılış akışı eklendi: kasa internetsiz açılırsa girişten önce "ПРОВЕРКА ПРАВИЛЬНОСТИ УСТАНОВЛЕННОГО ВРЕМЕНИ КАССЫ" ekranı, 2×2 dört saat seçeneği (ilk, mevcut saat, mavi seçili) ve "НИЧТО ИЗ ВЫШЕПЕРЕЧИСЛЕННОГО" görünür. Seçime dokunmak ayrı onay düğmesi olmadan girişe geçirir (`offline-time-check.tsx`). Tarayıcı Windows saatini değiştiremeyeceği için ekran saati ayarlamaz; kasiyerin bilinçli kontrolünü sağlar. Yüklemede sunucu tarafındaki `trustedTime()` koruması da sürer: zaman penceresi dışındaki 5 offline uç `timeAdjusted: true` döndürür ve `UnsyncedBanner`'da kırmızı "Часы кассы были неверны — часть операций записана со временем сервера." satırı görünür.
- [+] Satış geçmişinde gönderilmemiş fişlerin işareti (UMAG'daki eşitleme simgesi gibi). *(Yapıldı 2026-09-28: `SyncPendingIcon` (saat simgesi) — Satış geçmişi ve İade ekranlarında hem masaüstü tablosunda hem mobil kart görünümünde, `sale.waiting` true olan (henüz sunucuya ulaşmamış) fişin numarasının yanında görünür.)*

### 5.7 Fiskal (WebKassa) ile ilişki
- [ ] Çevrimdışı satışın fiskal durumu "bekliyor" olur; internet gelince fiskal çek kesilir ve fiş güncellenir. (Bkz. Adım 4.)

### 5.8 Test (Adım 1)
- [+] Yerelde: internet kesilip satış yapılır, fiş numarası ve kayıt yerelde görünür. *(Doğrulandı, gerçek sunucu kapatılarak.)*
- [+] İnternet gelince tüm kayıtlar sunucuda görünür, **hiç çift kayıt yok** (aynı kayıt art arda 5 kez gönderilse bile). *(Doğrulandı: aynı `clientSaleId` 3 kez → 1 satış, stok bir kez düştü; internet gelince kuyruk kendiliğinden boşaldı.)*
- [+] Sayfa yenilenir / tarayıcı kapatılıp açılır: kuyruk kaybolmaz. *(Doğrulandı: sayfa yeniden yüklenip sunucu kapatılıp açılsa da kuyruk IndexedDB'de kaldı ve sonra gönderildi.)*
- [+] İnternetsiz sayfa açma ve çevrimdışı giriş. *(Sunucu tamamen kapalıyken `/pos` önbellekten açıldı ve satış yapıldı — doğrulandı. Çevrimdışı giriş henüz yok.)* *(Doğrulandı: sunucu tamamen kapalı ve sunucu oturumu da kapalıyken önbellekten giriş sayfası açıldı, yanlış şifre reddedildi, doğru şifreyle kasa açıldı.)*
- [ ] Kuyrukta 100+ kayıtla toplu gönderme.
- [ ] Yanlış saat senaryosu.
- [ ] Birden fazla kasa aynı anda çevrimdışı: fiş numaraları çakışmaz.
- [+] İki mağaza için çapraz izolasyon taraması. *(Çalıştırıldı, bkz. 5.9.)*
- [ ] Gerçek telefonda ve gerçek market kasasında deneme (kontrollü, kısa süreli).

### 5.9 Bulgular ve tasarım kararları (2026-09-26)

- **Kritik hata bulundu ve düzeltildi:** oturum kapalıyken sunucu açılınca yükleme isteği giriş sayfasına yönlendirilip **200 (HTML)** alıyor; kuyruk bunu "başarılı" sayıp kaydı **siliyordu**. Artık yönlendirilmiş ya da JSON olmayan cevap asla başarı sayılmaz: kayıt kuyrukta kalır, `needsLogin` işaretlenir. Aynı koruma satış anında da var (eskiden HTML cevapla satış sessizce kaybolabiliyordu). Birim testleri: `src/tests/offline-write.test.ts`.
- **Çıkış (`signOut`) önbelleği silmez**, yalnızca "kasada kim çalışıyor" kaydını siler; çünkü bir sonraki kasiyer çevrimdışı girişten sonra açılacak kasa sayfasına ihtiyaç duyar. Tam temizlik (sayfa/ayar/katalog kopyası) **başka bir marketin kasiyeri** giriş yapınca yapılır (`bindTillToStore`). Kuyruk ve kayıtlı kasiyer hash'leri hiçbir zaman silinmez.
- Satışlar **kimin sattığını** taşır (`cashierUserId`); yükleme başka bir kasiyerin oturumuyla yapılsa da doğru kişiye yazılır.
- Vardiya kimliğini kasa üretir; satış ve para hareketi vardiyayı adıyla (`shiftId`) belirtir, sunucu henüz görmemiş olsa bile.
- **Sınırlar (bilerek):** (1) Fişli iade yalnızca bu kasanın gördüğü satışlar için çevrimdışı çalışır (son 300 satış önbelleği + henüz yüklenmemiş satışlar). (2) Yönetici onayı gereken iadeler (kasiyerin iade yetkisi yokken yönetici PIN'i) çevrimiçi olmayı gerektirir. (3) X raporu ve kapanışta **beklenen nakit** çevrimdışıyken hesaplanamaz; kasiyer sayılan tutarı girer, sunucu yüklemede hesaplar ve farkı yazar. (4) Sunucu, oturumu `cookieCache` yüzünden birkaç dakika daha geçerli sayabilir. (5) Vardiya kimliği kasada üretildiği için, sunucuda aynı kasiyerin zaten açık vardiyası varsa (başka cihaz) açılış reddedilir (409).
- **Çapraz market taraması** (`scripts/tenant-scan`) yeni uçlarla çalıştırıldı: 0 API bulgusu (sayfa bulguları önceki turlarda değerlendirilen bilinen yanlış alarmlar).

---

## 6. ADIM 2 — Vardiya ekranı (UMAG ile aynı)

**2026-09-27, canlı gözlem (`_umag-sandbox`, ağ kapalı, gerçek ekran görüntüleri alındı — bkz. `shots/01-smena.png` … `07-closed.png` + bu oturumun yeni `live-*`/`full-*` görüntüleri):**

- Üst çubuk **СМЕНА** sekmesindeyken **kırmızı/bordo** olur (satışta yeşil — 5.6'daki not doğrulandı).
- Üstte sabit kırmızı şerit: **"ВСЕ ПОЛЯ ОБЯЗАТЕЛЬНЫ ДЛЯ ЗАПОЛНЕНИЯ"** — üç sekme boyunca hep görünür, kapatılamıyor.
- 3 sekme yan yana, açık gri kutular, seçili olan yeşil/altı çizili: **КУПЮРЫ | СУММА | ВНОС, ВЫНОС СРЕДСТВ**.
- **КУПЮРЫ:** iki sütun — "КОЛ-ВО КУПЮР" (20000, 10000, 5000, 2000, 1000, 500, 200 тг, her biri kendi metin kutusu, varsayılan `0`) ve "КОЛ-ВО МОНЕТ" (100, 50, 20, 10, 5 тг). Sağda ortak rakam tuş takımı: `7 8 9 / УДЛ.(kırmızı)`, `4 5 6 / <<`, `1 2 3 / >>`, `0 .` — **`<<`/`>>` bir sonraki/önceki tutar kutusuna geçiş** (imleç odağını taşıyor), silme ayrı kırmızı **УДЛ.** düğmesinde.
- **СУММА:** tek bir "СУММА" kutusu, aynı tuş takımı — banknot saymadan direkt toplam tutar girmek için.
- **ВНОС, ВЫНОС СРЕДСТВ:** ayrı bir **pencere** (tab içeriği değil, modal) açılıyor: üstte açılır liste (varsayılan seçili **ВЛОЖЕНИЯ**, altında **РАСХОДЫ**, **ДИВИДЕНДЫ** — tam olarak 3 seçenek, Korgen'deki 4 türden [IN/OUT/PAYOUT/DROP] farklı), altında boş "Сумма" kutusu, altında "Комментарий" çok satırlı metin alanı (sağ üstte klavye simgesi), altta **ЗАКРЫТЬ** (kırmızı, kapat) / **СОХРАНИТЬ** (turkuaz, tutar girilmeden soluk/pasif).
- Sağ altta sabit, üç sekmede de aynı yerde duran **СДАТЬ СМЕНУ** (turkuaz) düğmesi.
- **Yeni bulunan, plandaki `[ ]` maddesini karşılayan ekran — saat doğrulama:** uygulama internetsiz açılışta **её dosyalanmamış** bir ekranla karşılıyor: **"ПРОВЕРКА ПРАВИЛЬНОСТИ УСТАНОВЛЕННОГО ВРЕМЕНИ КАССЫ"** başlığı, açıklama ("İnternet olmadığı için saat sunucuyla karşılaştırılamadı, kasa saati fiş ve işlemlerde böyle görünecek, yanlışsa senkron çalışmaz"), altında **"ДЛЯ ПРОВЕРКИ ВЫБЕРИТЕ ПРАВИЛЬНОЕ ТЕКУЩЕЕ ВРЕМЯ"** ve **2×2 dört seçenek kutusu** (ör. gerçek saat + 1 gün + 1 saat + 30 dk ileri gibi 4 aday, ilki — genelde doğrusu — mavi çerçeveyle **ön seçili**), altında ayrı bir kutuda **"НИЧТО ИЗ ВЫШЕПЕРЕЧИСЛЕННОГО"** (hiçbiri) düğmesi. Bir kutuya tıklamak saati onaylayıp doğrudan giriş ekranına geçiriyor (ayrı bir "onayla" düğmesi yok). *(Bu, Korgen'in şu an yaptığı sessiz `trustedTime()` + sonradan uyarı banner'ından — bkz. 5.6 — daha proaktif: kasiyer açılışta bilerek onaylıyor. İkisi de aynı sorunu çözüyor; UMAG'ınki ekstra bir adım daha var. Birebir istenirse bu ekran ayrıca eklenebilir — aşağıya madde olarak not edildi.)*
- **Gözlenemeyen (bloke):** gerçek rakamlarla **СДАТЬ СМЕНУ**'ye basılınca çıkan kapanış onay/Z-raporu ekranı — giriş ekranına kadar ilerlendi (saat onayı → "ВХОД В СИСТЕМУ", КАССИР: Касса 5, şifre alanı zaten bir nokta ile dolu duruyordu — hatırlanan offline giriş) ama **şifre bilinmediği için** öteye geçilemedi. Korgen'in kendi vardiya kapanış özeti (açılış/satış/giriş/çıkış/iade/beklenen/sayılan/fark — zaten `shift-bar.tsx`'te var ve gerçek offline testte doğrulanmış, bkz. altındaki `[+]` madde) bu ekranın makul bir eşleniği; UMAG'ın gerçek metnini görmek için şifre gerekiyor.

Yapılacaklar:
- [+] **Vardiya artık tam sayfa** — `KioskTopBar`'daki СМЕНА, açılır pencere yerine ПРОДАЖИ/ВОЗВРАТ/ИСТОРИЯ ile aynı tür gerçek sekme oldu (`pos-screen.tsx`'teki `salesPanel` state'ine `"shift"` eklendi); yeni `src/components/pos/shift-screen.tsx` — eski popover `ShiftBar` (`shift-bar.tsx`) kiosk ekranından tamamen kaldırıldı, `shift-bar.tsx` artık yalnızca ofis tarafında da kullanılan `ShiftReportModal`'ı barındırıyor.
- [+] Üst çubuk (`KioskTopBar`) СМЕНА sekmesindeyken **kırmızı/bordo** (`#c0392b`) oluyor, diğer sekmelerde yeşil kalıyor — gerçek gözlemle birebir.
- [+] Sekme **КУПЮРЫ**: banknot/bozuk para adetleri, iki sütun, ortak tuş takımı — `<<`/`>>` odağı bir önceki/sonraki tutar kutusuna taşıyor, УДЛ. son haneyi siliyor (bu son ikisi UMAG'da gözlemlenemedi, en makul yorumla uygulandı — not düşüldü).
- [+] Sekme **СУММА**: doğrudan tutar girişi, aynı tuş takımı.
- [+] **ВНОС, ВЫНОС СРЕДСТВ** ayrı pencere: tür açılır listesi **Вложения/Расходы/Дивиденды** — Korgen'in `CashMovementType` enum'u UMAG'ın 3 türüne **birebir geçirildi** (2026-09-28, kullanıcı kararı: "UMAG'ın 3 türüne geç"). Eski `IN/OUT/PAYOUT/DROP` → `DEPOSIT/EXPENSE/DIVIDEND`; veri migration'ı (`20260928090000_cash_movement_umag_types`) mevcut kayıtları `IN→DEPOSIT`, `OUT|PAYOUT|DROP→EXPENSE` olarak taşıdı (raporlar zaten bunları tek "kasadan çıkan" grubunda topluyordu, davranış değişmedi). Tutar, Комментарий, ЗАКРЫТЬ/СОХРАНИТЬ — hepsi birebir.
- [+] "ВСЕ ПОЛЯ ОБЯЗАТЕЛЬНЫ ДЛЯ ЗАПОЛНЕНИЯ" uyarısı, üstte sabit.
- [+] **СДАТЬ СМЕНУ** düğmesi kapatıyor, ardından Korgen'in kendi Z-raporu (`ShiftReportModal`) açılıyor — gerçek UMAG kapanış ekranı görülemediği için (şifre engeliyle) kullanıcı kararıyla bu temel alındı.
- [+] Açılışta saat doğrulama ekranı (yukarıdaki spesifikasyon) — `offline-time-check.tsx` ile 2026-09-28'de eklendi.
- [+] Çevrimdışı çalışır (Adım 1 kuyruğu kullanır, değişmedi). *(Daha önce doğrulandı: vardiya çevrimdışı açıldı, satış+para girişi+iade yapıldı, vardiya kapatıldı; internet gelince hepsi sırayla yüklendi.)*
- [+] **Gerçek tarayıcı testiyle uçtan uca doğrulandı (2026-09-28):** geçici bir test kasiyer hesabıyla giriş yapılıp СМЕНА sekmesi açıldı — üst çubuk kırmızıya döndü, vardiya açıldı, КУПЮРЫ sekmesinde 1000 тг×5 + `>>` ile 500 тг×7 girildi (₸8500 doğru toplandı, alan odağı `>>` ile doğru taşındı), ВНОС,ВЫНОС penceresi UMAG'daki gibi açılıp kapatıldı, СДАТЬ СМЕНУ ile kapatıldı ve Z-raporu **Фактические наличные ₸8 500, Расхождение +₸8 500** olarak doğru göründü, kapatınca satış ekranına dönüldü ve üst çubuk yeşile geri döndü. Test hesabı ve tüm izleri (Shift/AuditLog/Account/UserStoreAssignment/User) temizlendi. Tip kontrolü, lint ve 65 birim testi temiz.

---

## 6b. ADIM 2b — Ödeme ekranı (UMAG ile birebir)

**UMAG'da görülen ekran (2026-09-26, kullanıcının ekran görüntüsü):** ortada beyaz pencere.

- Üst üçlü: **К ОПЛАТЕ** (ödenecek, ör. 1750.00 тг), **ПОЛУЧЕНО** (alınan, yeşil), **СДАЧА** (para üstü, kırmızı).
- 4 sekme: **Наличная** (nakit), **Безналичная** (kart), **Смешанная** (karma), **В долг** (borç).
- Tutar alanı (nakit simgesiyle), varsayılan `0`, seçili.
- Tuş takımı: 7-8-9 / 4-5-6 / 1-2-3 / 0 `.` ve `←` (sil), **ОЧИСТИТЬ** (temizle).
- Hazır tutar düğmeleri: **+200, +500, +1 000, +2 000, +5 000, +10 000**.
- **ОПЛАТА С ОФД** (fiskal ile öde; ekranda soluk, o an pasif).
- Alt düğmeler: **ОТМЕНА** (kırmızı), **БЕЗ СДАЧИ** (gri, para üstü olmadan öde), **ОПЛАТА** (yeşil).
- Sepet satırı: `№ | наименование | цена ТГ | количество ШТ | скидка % | сумма ТГ`. Satır indirimi **yüzde** olarak gösterilir.

Yapılacaklar:
- [+] Mevcut Korgen ödeme penceresi (`payment-panel.tsx`) UMAG düzenine çevrildi; Korgen'e özgü ekler (bahşiş, sadakat puanı, vergi geçersiz kılma, beklet/geri çağır) yerinde kaldı, en altta/üstte, UMAG'ın kendi akışını bozmadan.
- [+] **Hazır tutar düğmelerinin davranışı düzeltildi** — burada gerçek bir hata bulundu: eski kod `tot + amount` yazıyordu (ödenecek tutara ekliyordu), gözlemlenen UMAG davranışı ise **alandaki mevcut tutara** ekliyor (`0 → +500 = 500 → +200 = 700`). Gerçek tarayıcı testiyle doğrulandı: +500 sonra +200 → Получено tam ₸700 çıktı.
- [+] **ОЧИСТИТЬ** eklendi (alanı sıfırlıyor, `←` tek hane siliyor — ayrı davranışlar). **БЕЗ СДАЧИ** eklendi (tam tutarı anında, para üstü beklemeden öder — `handleCompleteSale`'e stale-state riski olmadan doğrudan tutar geçiriliyor). Gerçek testte: ₸1750 ürün, БЕЗ СДАЧИ → satış anında tamamlandı, fiş "Внесено ₸1 750" gösterdi.
- [+] Üst üçlü **К ОПЛАТЕ / ПОЛУЧЕНО (yeşil) / СДАЧА (kırmızı)** — birebir; "Осталось" (Korgen eklentisi) yalnızca karma ödemede 4. sütun olarak görünüyor.
- [+] Alt düğmeler **ОТМЕНА (kırmızı, sepeti bozmadan kapatır) / БЕЗ СДАЧИ (yalnızca nakit sekmesinde) / ОПЛАТА (yeşil)** — birebir sırada. Eski "Void" (sepeti boşaltan Korgen eklentisi) bu üçünün altında ayrı bir düğme olarak kaldı.
- [+] **Безналичная (kart):** sekmeye geçince ПОЛУЧЕНО anında tam tutarla doluyor (gözlemlenen davranış) — yeni bir `useEffect` ile.
- [+] **ОПЛАТА С ОФД** düğmesi eklendi, soluk/pasif (Adım 4'te fiskal bağlanınca aktifleşecek).
- [+] **Смешанная (karma):** UMAG'ın gözlemlenen iki-alanlı (üstte nakit/altta kart, büyük simgeli alanlar) düzenine çevrildi — Korgen'in 3. ödeme türü (Другое) aynı stille altta 3. alan olarak kaldı (Korgen eklentisi, işlev bozulmadı).
- [+] **В долг (borç) — yepyeni tam ekran, `debt-screen.tsx`:** UMAG'daki gibi ayrı tam sayfa, turkuaz üst çubuk, НОВЫЙ ДОЛЖНИК + arama + tablo (Полное имя/Тел. номер/Сумма/Дата и время), alt kart ("Продажа в долг на сумму X", "Должник: Y", "Общая сумма долга Z"), НАЗАД (doğrudan satış ekranına döner, sepet korunur — ödeme penceresine değil) / ЗАПИСАТЬ. Yeni ekran değil, **mevcut müşteri/borç altyapısı** (`/api/customers` arama+oluşturma, `getCustomerBalance`, CREDIT satış türü) üzerine kuruldu — hiç yeni API yazılmadı. Yeni borçlu formu (`*Полное имя`, `*Номер телефона`, maskeli `+7 (7__) ___ __ __` — mevcut `formatPhoneInput` ile) ОТМЕНИТЬ/СОЗДАТЬ.
  - **Kapsam dışı bırakılan (bilerek):** Ek fonksiyonlar menüsünden (Adım 3) erişilen ДОЛГ varyantı — "Продажа в долг" satırı olmadan, ПОГАСИТЬ (borç kapat) düğmesiyle — bu ayrı bir akış ve `/api/customers/[id]/payments` şu an yalnızca ADMIN/MANAGER/WAREHOUSE'a açık (bir `accountId` seçimi gerektiriyor); kasadan borç kapatma Adım 3'te ele alınacak.
- [+] **Gerçek tarayıcı testiyle uçtan uca doğrulandı (2026-09-28):** ₸2000'lik ürünle В долг açıldı, НОВЫЙ ДОЛЖНИК ile "+7 (705) 123-45-67" telefon maskesi doğru çalıştı, borçlu oluşturulup otomatik seçildi ("Общая сумма долга ₸2 000" doğru), ЗАПИСАТЬ ile satış tamamlandı, fiş "Оплата: В долг" gösterdi. Ayrı bir denemede НАЗАД'ın gerçekten satış ekranına (ödeme penceresine değil) döndüğü ve sepetin korunduğu doğrulandı. Test verisi (kullanıcı, satışlar, borçlu müşteri) temizlendi.
- [+] Ödeme, çevrimdışı kuyruğa (Adım 1) yazar (`submitSale`, değişmedi).
- [+] **Gerçek tarayıcı testiyle uçtan uca doğrulandı (2026-09-28):** test kasiyer hesabıyla ₸1750'lik ürün eklendi, ödeme ekranı açıldı — +500/+200 presetleri doğru topladı, ОЧИСТИТЬ sıfırladı, Карта sekmesi anında ₸1750 doldu, ОТМЕНА sepeti bozmadan kapattı, БЕЗ СДАЧИ ile satış tamamlandı ve fiş doğru göründü. Tip kontrolü, lint, 65 birim test temiz. Test verisi (kullanıcı, satış, iade) temizlendi.

---

## 7. ADIM 3 — Ek fonksiyonlar, iade ve küçük düzeltmeler

### Ek fonksiyonlar menüsü (UMAG ile aynı 12 düğme) — [+] bitti (2026-09-28)

**Gerçek menü, `_umag-sandbox/shots/14-dop.png`/`133-dop.png` ile karşılaştırılarak birebir kuruldu** — yeni `extra-functions-menu.tsx`, 5 sütunlu grid, aynı 12 buton adı. Eskiden "Доп. функции" düğmesi yanlışlıkla müşteri/indirim kartı panelini açıyordu (o panel artık yalnızca kendi "Не выбран консультант" tetikleyicisinden açılıyor — UMAG'ın 12 düğmesiyle hiç ilgisi yoktu).

- [+] **Выход из программы** — signOut() + kasa girişe yönlendirme.
- [+] **Заблокировать кассу** — yeni `lock-screen.tsx`, tam ekran kilit, açmak için mevcut ManagerGate/PIN altyapısı (refund/kasa-ayır akışlarındaki aynı mgr-ok çerezi). Gerçek testle doğrulandı: CASHIER rolüyle PIN istendi, doğru PIN ile açıldı. **Gerçek kullanıcı testinde bulunan ciddi hata (2026-09-28):** kilit durumu yalnızca React state'inde tutuluyordu — kasiyer kilitledikten sonra sayfayı yenileyince (veya `/pos`'a tekrar girince) kilit sessizce sıfırlanıyor, hiç PIN sormadan direkt satış ekranına dönüyordu. Düzeltildi: kilit artık `localStorage`'da tutuluyor (yeni `src/lib/till-lock.ts`), `pos-screen.tsx` sayfa açılışında bunu okuyup kilidi PIN girilene kadar her koşulda (yenileme dahil) gösteriyor.
- [+] **Вкл/выкл принтер** — yerel (localStorage) açık/kapalı anahtarı, buton metni UMAG gibi dinamik ("ВКЛЮЧЕН"/"ВЫКЛЮЧЕН").
- [+] **Распечатать чек последней продажи** — /api/pos/sales?pageSize=1 ile son satış çekilip mevcut ReceiptModal açılıyor. Gerçek testle doğrulandı: doğru ürün/tutar/ödeme türüyle fiş çıktı; satış yokken "Продаж пока нет" doğru gösterildi.
- [+] **Синх. с сервером** — flushQueue() + syncCatalog() anında çağrılıyor. Gerçek testle doğrulandı: "Синхронизировано" toast'ı çıktı.
- [+] **Поиск по штрихкоду** — yeni `barcode-search-modal.tsx`, sadece tuş takımı (UMAG'daki gibi serbest yazı yok), УДАЛИТЬ/ОТМЕНА/OK. Gerçek testle doğrulandı: bilinmeyen kod için "Не найдено — Продукт с данным кодом не найден" UMAG'daki metinle birebir çıktı.
- [+] **Свернуть** — mevcut tam ekran aç/kapa mantığı (eskiden başka bir menüdeydi) buraya taşındı.
- [+] **Долг** — `debt-screen.tsx`'e "repay" modu eklendi (ЗАПИСАТЬ yerine ПОГАСИТЬ, "Продажа в долг" satırı yok — UMAG'ın iki farklı çağrı yeri arasındaki farkla birebir). PIN gerekiyor (aşağıdaki API notuna bak). Gerçek testle doğrulandı: ₸1000 borçlu seçilip tamamı ödendi, bakiye doğru şekilde ₸0'a düştü.
- [+] **Проверить обновление** — window.location.reload().
- [+] **Добавить доп принтер** — bu tarayıcı tabanlı kasada gerçek çoklu yazıcı sürücü katmanı yok (yalnızca tek USB/seri cihaz algılama var); dürüstçe basit tutuldu — localStorage'da isim listesi, ekleme/silme. Gerçek bir sürücü kaydı değil, sadece kasiyerin görebileceği bir etiket listesi olduğu koda not düşüldü.
- [+] **Проверка цены** — zaten var olan PriceCheckModal buraya taşındı (izin kapalıyken soluk/pasif, tıklanamaz — UMAG'daki gibi).
- [+] **Быстрая приемка** — yeni `quick-receiving-modal.tsx`, UMAG'ın gerçek formuyla birebir (Сумма, Дата приёмки, Поставщик, Комментарии, Под консигнацию, Взнос, ОТМЕНА/СОХРАНИТЬ) — mevcut /api/purchase-receipts/quick ucu zaten tam bu forma göre yazılmıştı, kullanıldı. Взнос varsa /api/purchase-receipts/:id/payments'e ikinci bir çağrı. Gerçek testle doğrulandı: ₸5000'lik приёмка POSTED olarak oluştu.

**API tarafında yapılan (birebir yetki deseni):** ДОЛГ→ПОГАСИТЬ (/api/customers/[id]/payments) ve БЫСТРАЯ ПРИЁМКА (/api/purchase-receipts/quick, /api/purchase-receipts/[id]/payments) eskiden yalnızca ADMIN/MANAGER/WAREHOUSE oturumuna açıktı — UMAG'da ise kasadan herkes yapabiliyor. Üç uç da refund/kasa-ayır akışlarında zaten kullanılan aynı manager-PIN çerezi (mgr-ok, verifyManagerToken) ile genişletildi: yetkili rol VEYA geçerli PIN. Ayrıca accountId artık isteğe bağlı — kiosk'ta hesap seçme arayüzü olmadığı için terminalin eşleştiği kasadan (Cashbox.accountId) otomatik çözülüyor (satış/iade akışlarındaki aynı desen).

**Tip kontrolü, lint, 65 test temiz.**

### İade
- [+] **Маркировка товара:** fişsiz iadede kasa satırı seçilir; seçim yoksa UMAG'ın aynı uyarısı açılır: **"Выберите продукт — Не выбран продукт"**. Seçilen satırın DataMatrix kodu kaydedilir; çevrimdışı kuyrukta ve Hub→bulut senkronunda korunur.
- [+] **Поиск по штрихкоду:** çevrimiçiyken sunucuda, bağlantı yokken kasanın yerel katalog kopyasında arar.
- [+] **"С чеком / Без чека"** düzeni ve fiş numarası arama çalışıyor.

### Küçük düzeltmeler
- [ ] Üst çubukta sabit "Учебный" yazısını kaldır; yerine kasa adı (örn. "Касса-4") göster.
- [ ] Boş "Производитель / Заказ / Доставка" açılır listelerini kaldır veya gerçek bir işleve bağla (UMAG'da yoksa kaldır).
- [ ] Üst çubuk rengi sekmeye göre değişsin (satış yeşil, iade sarı, vardiya kırmızı, geçmiş turkuaz).
- [x] Ekran klavyesi: arama kutusunda var, diğer alanlarda gerekmiyor (kullanıcı kararı 2026-09-29).

---

## 8. ADIM 4 — Fiskal (WebKassa)

Ayrı iş: `docs` altındaki fiskalleştirme planı (Kazakistan OFD, test kasası SWK00036070) giriş bilgisi bekliyor.

- [ ] Satış geçmişinde **Фиск.** sütunu ve fiş detay panelinde **ФИСК.** düğmesi.
- [ ] Çevrimdışı satışın internet gelince fiskalleştirilmesi.
- [ ] Fiskal hata durumunda yeniden deneme ve uyarı.

---

## 9. Riskler ve dikkat edilecekler

- **Çift kayıt:** en büyük risk. `clientSaleId` benzersizliği ve testlerle kapatılır.
- **Saat kayması:** yanlış saatli kasa satış saatlerini bozar. Saat doğrulama ve sunucu saatiyle fark kaydı.
- **Stok farkı:** çevrimdışı satışlar stoku eksiye düşürebilir. Raporda görünür olmalı.
- **Yerel veride veri sızıntısı:** çevrimdışı depoda yalnızca ilgili mağazanın verisi olur; şifreler düz metin tutulmaz.
- **Eski sürüm kasa:** sunucu güncellenince açık duran kasa eski kodla çalışabilir. Sürüm kontrolü ve uyumlu uçlar.
- **Canlı sunucu:** her veritabanı değişikliği yedekle ve `deploy/update.sh` ile yapılır. Önce yerelde test.
- **Tarayıcı depolama sınırı:** çok büyük ürün listesi (52 bin ürün deneyimi var) için yerel depo boyutu ve ilk indirme süresi ölçülecek.
- **UMAG kopyası:** `_umag-sandbox/` içinde gerçek market verisi var. İnternete bağlanmaz, işi bitince silinir.

---

## 9b. ADIM 5 — Yerel Hub (ofis bilgisayarı, çok kasalı market)

**Neden (2026-09-26/27, kullanıcı):** Nuray'da 4 kasa var, hepsi aynı ağda. Biri satıp bir ürünü tüketirse **diğer kasalarda hâlâ satılabilir** görünüyor — çünkü şu anki çevrimdışı katman her kasanın **kendi tarayıcı kopyasını** tutuyor, kasalar birbirini görmüyor, yalnızca 5 dakikada bir buluta bakıyor. UMAG'da bunun çözümü **`umag.local`**: ofis bilgisayarında yerel bir sunucu, kasalar ona bağlı, o sunucu buluta senkronize.

**Kapsam netleştirildi:** Yönetim paneli (ürün/fiyat girişi) **değişmiyor**, bulutta kalıyor (korgenkassa.kz), patron oradan (ofis PC'sinden ya da telefondan) yönetmeye devam ediyor, internet ister. Yalnızca **kasa/satış katmanı** yerelleşiyor: ofis PC'sinde görünmez bir arka plan servisi (Hub), buluttaki ürün/fiyat/kasiyer bilgisini çeker, 4 kasaya yerel ağdan sunar, satışları toplayıp buluta gönderir.

**Karar netleşti (2026-09-27, kullanıcı):** İki seçenek karşılaştırıldı (yalnızca Adım 1 / Hub / internet donanımını düzelt), kullanıcı **kasaların internetsizken de birbirini anında görmesini** istedi → Hub tam olarak yapılıyor.

```
BULUT (korgenkassa.kz) — ürün/fiyat/ayar burada yönetilir, "gerçek kaynak"
        ↕ internet varsa: Hub buradan çeker (ürün/fiyat/kasiyer), buraya gönderir (satış/vardiya/...)
OFİS BİLGİSAYARI (Hub) — kendi veritabanı, 24 saat açık, LAN'da hep erişilebilir
        ↕ yerel ağ (ethernet/wifi) — kasa ↔ Hub bağlantısı pratikte hiç kopmaz
Kasa 1 / Kasa 2 / Kasa 3 / Kasa 4 — uygulama gibi açılır, hep aynı kasaya girer (UMAG'daki "Касса 5" gibi)
```

**Önemli sonuç:** Hub mimarisinde kasa tarayıcısının kendi çevrimdışı kuyruğuna (Adım 1) ihtiyacı kalmıyor — kasa her zaman Hub'a bağlı (yerel ağ neredeyse hiç kopmaz), Adım 1'in kuyruk/senkron mantığı **Hub seviyesine taşınıyor** (tarayıcı yerine Node.js arka plan servisi, IndexedDB yerine Hub'ın kendi Postgres'i). Adım 1 kodu **çöp olmuyor**: tek kasalı / Hub kurulmamış marketler için hâlâ geçerli (doğrudan buluta bağlı, tarayıcı içi kuyruk). İki mod:
- **Tek kasa / Hub yok:** Adım 1 (tarayıcı içi çevrimdışı kuyruk), doğrudan buluta.
- **Çok kasa / Hub var:** kasalar Hub'a bağlı, Hub buluta bağlı.

**Zaten var olan altyapı:** `Cashbox` modeli + `cashbox-device.ts` (tek kullanımlık eşleştirme anahtarı → kalıcı imzalı çerez → "bu tarayıcı Kasa 5'tir"). Kasanın "uygulama gibi açılıp direkt kendi kimliğine girmesi" bunun üzerine kurulacak, yeniden yazılmayacak.

### 9b.1 Hub paketi
- [+] `docker-compose.hub.yml`: mevcut `Dockerfile` + yerel Postgres, Caddy/HTTPS yok (LAN, düz HTTP yeterli — kasa her zaman Hub'a bağlı olduğu için service-worker/PWA çevrimdışı katmanına ihtiyaç yok). Ofis bilgisayarının LAN IP'sinde (örn. `192.168.1.50:3000`) yayında. Yerelde ayağa kaldırılıp doğrulandı (`/api/health` cevap verdi).
- [ ] Ofis bilgisayarında kurulum: Docker Desktop (kullanıcı onayladı: kurulabilir), `.env.hub` (Hub'ın kendi `BETTER_AUTH_SECRET`'i, bulut adresi, Hub servis anahtarı).
- [+] Hub'ın kendi veritabanı migration'ları (aynı Prisma şeması) — sadece bu marketin verisini tutar (`storeId` sabit). Yerelde denendi.

### 9b.2 Hub ↔ Bulut senkronizasyonu
- [+] **Servis kimlik doğrulama:** `HubToken` modeli (migration `20260927100000_hub_token`) — SHA-256 hash'i saklanır, düz metin token yalnızca üretimde bir kez gösterilir. `src/lib/hub-auth.ts`: `createHubToken`/`revokeHubToken`/`resolveHubActor`. Üretim script'i: `scripts/create-hub-token.mjs <storeId> [label]`. Token yalnızca o `storeId`'ye erişebilir; iptal edilince anında geçersiz (test edildi).
- [+] **Aşağı doğru (bulut → Hub):** `GET /api/hub/pull` — ürünler (mevcut `/api/pos/catalog` mantığı `catalog-query.ts`'e taşınıp paylaşıldı, `since`/`afterId` ile artımlı), kasiyer listesi (`name`, `phone`, `role`, `allowCashierLogin`, **şifre hash'i** — Better Auth'un `Account.password` alanından, düz metin asla yok), `BusinessSettings`. Gerçek HTTP isteğiyle test edildi (yanlış/eksik token → 401 JSON; doğru token → ürün+5 kasiyer+ayarlar geldi). **Henüz yok:** promosyonlar, hızlı ürünler (ayrı bir geçişte eklenecek — Hub bunlar olmadan da satış/vardiya/iade için tam çalışır).
- [+] **Yukarı doğru (Hub → bulut):** aynı 6 uç, artık hem oturum çerezi hem Hub Bearer token'ı kabul ediyor (`src/lib/pos-request.ts` → `resolvePosRequest`): `POST /api/sales`, `POST /api/shifts` (aç), `POST /api/shifts/[id]` (kapat), `POST /api/cash-movements`, `POST /api/sales/[id]/refund`, `POST /api/pos/returns/without-receipt`. Hub isteğinde `cashierUserId` **zorunlu** (Hub'ın kendi oturumu yok, `attributedUserId` boş dönerse 400 "cashierUserId required"). Hepsi gerçek istekle tek tek denendi: doğru kasiyer/vardiyaya bağlanma, tekrar gönderilince çift kayıt olmama, vardiya kapanışında beklenen nakidin doğru hesaplanması (200 açılış + 130 satış − 130 iade + 50 giriş = 250 doğrulandı).
- [+] **Kritik bulgu ve düzeltme (satır 1):** `src/proxy.ts` (middleware), oturum çerezi olmayan her isteği `/login`'e yönlendiriyordu — `fetch` bunu takip edip **200 (HTML)** döndürüyordu, Hub bunu "başarılı" sanabilirdi. Düzeltme: `Authorization: Bearer hub_...` taşıyan her `/api/` isteği middleware'de doğrudan geçiriliyor.
- [+] **Kritik bulgu ve düzeltme (satır 2):** ilk düzeltme middleware'in setup-tamamlama kontrolünden SONRA eklenmişti — oturumsuz+çerezsiz istek önce `/api/setup/resume`'a yönlendirilip sonsuz döngüye giriyordu (`hub-sync.mjs` ilk gerçek denemede "redirect count exceeded" ile çöktü). Hub kontrolü middleware'in en başına (health-check'ten hemen sonra) taşındı, sorun düzeldi ve doğrulandı.
- [+] **`scripts/hub-sync.mjs` tamamlandı** — gerçek pull/push döngüsü (artık iskelet değil):
  - **Push sırası (bağımlılık zinciri):** vardiya açılışları → satışlar/para hareketleri (vardiyaya referans verir) → iadeler (satışa referans verir) → fişsiz iadeler → vardiya kapanışları (açılışın bulutta olmasını gerektirir). Her satır kendi yerel kimliğiyle gönderilir (`Shift`/`CashMovement`/`CustomerReturn` kimliği doğrudan, `Sale`/`Refund` `clientSaleId`/kendi `id`'si ile) — bulut aynı kimliği görünce tekrar oluşturmuyor.
  - **Bulunan ince hata:** iade, Hub'daki yerel `SaleItem.id`'yi taşıyordu; bu kimlik bulutta hiçbir anlam ifade etmiyor (bulut satışı alınca kendi yeni satır kimliklerini üretiyor). Düzeltme: iade satırları **satır sırasına** (`L:<lineNo>`) çevrilip gönderiliyor — bu, çevrimdışı kasanın zaten kullandığı mekanizmanın aynısı (bkz. Adım 1).
  - **Bulunan ikinci ince hata:** vardiya kapanışını "gönderildi mi" diye `syncedToCloudAt` sütunuyla takip etmek, açılış için de kullanılan aynı sütunla çakışıyordu (açılış "şimdi" ile işaretlenince kapanışın daha eski saatiyle karşılaştırma yanlış sonuç veriyordu). Düzeltme: kapanış, Hub'ın küçük anahtar-değer tablosunda (`shift_closed:<id>`) ayrı takip ediliyor.
  - **Senkron durumu sütunları:** `Sale`/`Shift`/`CashMovement`/`Refund`/`CustomerReturn`'e `syncedToCloudAt` eklendi (migration `20260927120000_hub_sync_columns`) — yalnızca Hub'da anlamlı, bulutta hep boş kalır.
  - **Gerçek uçtan uca test** (yerel ikinci bir "Hub" veritabanı + çalışan bulut sunucusuna karşı): çekme (ürün + 5 kasiyer + gerçek şifre hash'leri geldi), bir kasanın internetsizken üreteceği tam veri seti elle Hub'a yazıldı (vardiya aç/satış/para girişi/iade/fişsiz iade/vardiya kapat) → tek çalıştırmada hepsi buluta gönderildi, doğru bağlantılarla (satış doğru vardiyaya, iade doğru satışın doğru satırına) → **stok tam 60'ta kaldı** (60 −2 satış +1 iade +1 fişsiz iade = 60, matematiksel olarak doğrulandı) → ikinci ve üçüncü çalıştırmada **hiçbir şey tekrar gönderilmedi** (çift kayıt yok) → fiyat değişikliği bulutta yapılıp artımlı çekme ile Hub'a doğru şekilde indi.
  - **Henüz yok:** promosyonlar/hızlı ürünler pull'u; ürün/fiyat çakışma kuralı (zaten tek yönlü olduğu için doğal olarak bulut kazanıyor, ayrıca kod gerekmedi); Hub'ın kendi sağlık/durum sayfası.

### 9b.3 Kasaların Hub'a bağlanması
- [+] Kasa girişi artık Hub'ın **kendi** kullanıcı tablosuna karşı çalışır (buluttan senkronlanan kasiyer + şifre hash'i — `/api/hub/pull` bunu zaten getiriyor). Better Auth aynı algoritmayı kullandığı için kopyalanan hash yerelde doğrulanabilir.
- [+] Her kasa PC'sinde: tarayıcı **uygulama modunda** (`--app=http://<hub-ip>:3000/...`) açan bir kısayol; o PC daha önce bir `Cashbox` kaydına eşleştirilmiş — **mevcut `cashbox-device.ts` mekanizması, hiçbir değişiklik yapılmadan** (aynı `/api/pos/cashbox` GET/POST/DELETE, sadece hedef adres artık Hub). Kasa açılışında kasiyer seçimi yok — bu zaten mevcut pairing çerezinin sağladığı davranış (bir terminal = bir `Cashbox`); UMAG'daki "Касса 5" tam olarak bu.
- [+] **Bulunan ve kapatılan boşluk:** `hub-sync.mjs`'in senkronladığı tek şey ürün + kasiyer(User/Account) idi — `UserStoreAssignment` hiç yoktu, bu yüzden Hub'da gerçek bir tarayıcı oturumuyla giriş yapan kasiyer `getStoreId()`'de `NO_STORE_ACCESS` ile patlardı (Bearer token'lı testler bunu hiç yakalamamıştı çünkü o yol `getStoreId()`'e hiç uğramıyor). Aynı şekilde `Cashbox` hiç senkronlanmıyordu, yani mevcut eşleştirme akışının yerelde eşleşecek hiçbir kaydı yoktu. Düzeltme: `/api/hub/pull` artık `cashboxes` dizisini de döndürüyor; `hub-sync.mjs`'in `upsertCashiers`'ı artık `UserStoreAssignment` satırı da yazıyor, yeni `upsertCashboxes` ise `Cashbox` satırlarını yazıyor.
- [+] **İnce nokta:** `Cashbox` senkronunda `name`/`active`/fiş ayarları her pull'da bulut değerine güncellenir, ama `oneTimeKey`/`pairedAt` yalnızca **ilk** ekleme sırasında yazılır — sonraki pull'larda dokunulmaz. Aksi halde, bir terminal Hub'da yerel olarak eşleştikten sonra (oneTimeKey temizlenip pairedAt yazıldıktan sonra) bir sonraki pull, bulutun hâlâ eski/boş `oneTimeKey`'ini geri yazıp eşleşmeyi görünüşte bozardı — çünkü Hub'daki eşleşme durumu bulutun haberi olmayan bir şey (bkz. 9b.2'nin "henüz yok" notu, geri-yansıtma ayrı bir iş). Bilinen sınır: bulut tarafında admin panelinden **yeni** bir eşleştirme anahtarı üretilirse, bu Hub zaten eşleşmiş bir kasaya hiç ulaşmaz — bu, eşleştirme durumunun Hub→bulut yönünde henüz yansıtılmamasının doğal sonucu, ayrı bir iş olarak bekliyor.
- [+] **Gerçek uçtan uca doğrulama:** ikinci bir Postgres'e ("hub-test") tüm migration'lar uygulanıp gerçek bir Hub token ile çalışan dev sunucusuna karşı `hub-sync.mjs --one-shot` çalıştırıldı — `Cashbox` (Касса-1, no 5), 5 kasiyer + `Account` + `UserStoreAssignment` hepsi doğru geldi. Bulut tarafında test kassasına `oneTimeKey` yazılıp senkron tekrar çalıştırıldı: Hub'daki (zaten var olan, boş) `oneTimeKey` **değişmedi** — üstteki korumanın gerçekten çalıştığı doğrulandı. Test verisi (Hub token, geçici veritabanı, test anahtarı) temizlendi.

### 9b.4 Test
- [+] Çapraz market taraması yeni Hub uçlarıyla çalıştırıldı: 0 API bulgusu.
- [+] Birim testleri (65) ve tip kontrolü Hub değişiklikleriyle birlikte temiz.
- [+] Yerelde iki Postgres ("bulut" = çalışan dev sunucusu, "hub" = ikinci boş veritabanı) ile uçtan uca doğrulandı — bkz. 9b.2 (fiyat değişikliği iniyor, satış/vardiya/iade/para hareketi/fişsiz iade çıkıyor, tekrar çalıştırmada çift kayıt yok). Kalan: 4 gerçek tarayıcı sekmesiyle (Hub'ın kendi API'sinden değil, gerçek kasa arayüzünden) canlı deneme.
- [ ] Gerçek ofis bilgisayarında kurulum ve markette gerçek test.

---

## 10. Çalışma kuralları

1. Her adımdan önce yedek ve yerelde test.
2. Her adım bitince bu dosyada maddeler `[+]` yapılır ve tarih yazılır.
3. Her yeni sunucu ucu için mağazalar arası izolasyon taraması yapılır.
4. Canlıya alma: `git archive` → sunucuya kopyala → `sh deploy/update.sh`.
5. UMAG'ın gerçek verisi olan kopya asla internete bağlanmaz.

---

## 11. İlerleme özeti

| Adım | Konu | Durum |
|------|------|-------|
| 0 | Araştırma ve karşılaştırma | [+] büyük ölçüde bitti (kalan: bakılmamış ekranlar, kopyanın silinmesi) |
| 1 | Çevrimdışı katman | [+] kod tamam: satış, iade, fişsiz iade, vardiya, para hareketi, katalog/yerel stok, sayfa önbelleği, çevrimdışı giriş, UMAG saat doğrulama ekranı, promosyon/ayar/izin/hızlı ürün/müşteri yerel kopyası, daha önce okutulmuş indirim kartı, bekleyen satışlar ve gönderilmemiş fiş simgesi. Kalan yalnızca canlı sunucu migration/deploy'u ve gerçek market donanım testleri. |
| 2 | Vardiya ekranı | [+] bitti (tam sayfa, kırmızı üst çubuk, КУПЮРЫ/СУММА/ВНОС-ВЫНОС, UMAG'ın 3 para-hareketi türü, gerçek tarayıcı testiyle doğrulandı). Kalan: açılışta saat doğrulama ekranı (istenirse) |
| 2b | Ödeme ekranı (görünüm + davranış birebir) | [+] bitti — Наличная/Безналичная/Смешанная/В долг hepsi UMAG düzeninde, gerçek testle doğrulandı (bir gerçek hata bulunup düzeltildi: hazır tutar düğmeleri) |
| 3 | Ek fonksiyonlar, iade, düzeltmeler | [~] Ek fonksiyonlar menüsü (12 düğme, hepsi gerçek testle doğrulandı), fişli/fişsiz iade, barkod araması ve DataMatrix işaretli ürün iadesi çalışıyor. Üst çubuk artık satışta yeşil, iadede sarı, geçmişte turkuaz, vardiyada bordo; işlevsiz Учебный/Производитель/Заказ/Доставка öğeleri kaldırıldı. Kalan: her metin alanı için ekran klavyesi. |
| 4 | Fiskal (WebKassa) | [-] **İPTAL (2026-09-29, kullanıcı kararı):** kendi fişimizi çıkarıyoruz, WebKassa/OFD entegrasyonu yapılmayacak |
| 5 | Yerel Hub (çok kasalı market) | [~] Docker paketi + kimlik doğrulama + 6 uç + `hub-sync.mjs` (gerçek pull/push döngüsü) + kasa eşleştirme (`Cashbox`/`UserStoreAssignment` senkronu, 9b.3) uçtan uca test edildi. Kalan: Hub sağlık sayfası, promosyon/hızlı ürün pull'u, gerçek ofis bilgisayarı + market testi |

## 12. Adım 6 — Kasa programı (.exe), tamamen internetsiz açılan (karar: 2026-09-29)

**Karar (kullanıcı):** Kasa, tarayıcıdan URL ile açılmayacak. UMAG'ın `smartstore` programı gibi (kendi çalışma ortamı + kendi yerel verisi + kendi güncelleyicisi) ayrı bir Windows programı olacak; **ilk açılış dahil hiçbir aşamada internet gerekmeyecek.** Hedef cihaz: dokunmatik Windows 10/11 monobloklar (sürüm marketten teyit edilecek; Windows 7 ise plan değişir). Web teknolojisiyle yazıldığımız için UMAG'ın Java'sının karşılığı **Electron**.

**Bulgu (2026-09-29):** `/pos` şu an sunucuda çiziliyor (`src/app/(kiosk)/pos/layout.tsx` + `page.tsx`: oturum, market, marka renkleri, para birimi veritabanından okunuyor). Yani sayfanın kabuğu bile sunucudan geliyor; service worker önbelleği bunu ancak ilk internetli açılıştan sonra sağlıyor. Program içinde bunun olmaması için kabuk **istemci tarafında, IndexedDB'den** çizilmeli.

**Mimari:**
- Kasa ekranı için statik/istemci-taraflı bir kabuk (`/till`): market, kasiyer, ayarlar, marka, para birimi yerelden gelir. Mevcut çevrimdışı katman (katalog, kuyruk, vardiya, ayar/promosyon önbelleği) aynen kullanılır.
- **Market paketi:** yönetim panelinden üretilir (market kimliği, ürünler/fiyatlar/barkodlar, ayarlar, izinler, kasiyerler + PIN doğrulayıcıları), dosya/flash disk ile kasaya yüklenir → program o markete bağlanır. Kasada internet gerekmez.
- **Kasiyer girişi PIN ile** (hesap şifresinden ayrı; paket yalnızca PIN'in tuzlu-yavaş hash'ini taşır).
- Satış/iade/vardiya/para hareketi kuyruğu programın kendi klasöründe durur; internet gelince (günler sonra bile) sunucuya gider, yeni ürün/fiyat aşağı iner.
- Electron paketleme + Windows kurulum dosyası + kendi güncelleme mekanizması.

**Aşamalar:**
- [x] A1 — İstemci-taraflı kasa kabuğu (`/till`) + yerelden market/kasiyer/ayar okuma. (`src/app/till/page.tsx`, `src/components/till/till-shell.tsx`, `src/lib/offline/till-profile.ts`; `/till` proxy'de herkese açık; `/api/settings` artık renk+dil de döner. Tarayıcıda doğrulandı: boş IndexedDB → "bağlı değil" ekranı, dolu → oturumsuz kasa ekranı, kasiyer adı ve ₸ yerelden.) `/till` kurulum-çerezi kapısından da muaf (çerezsiz 200 döner, yönlendirme yok). Doğrulandı: sunucu kapalıyken yeniden yükleme, çevrimdışı arama/satış (kuyruğa yazıldı, kasiyer atfedildi, vergi yerel ayardan), süresi dolmuş oturum ekranı, `till-profile.test.ts` (6 test), tsc/eslint/71 test/`next build` temiz. Not: `/till` sunucu tarafında dinamik (kök layout next-intl çerezi okuyor) ama veritabanı/oturum istemiyor; Electron'da (A4) yerel sunucuyla servis edilecek. `/pos` içindeki `/api/*` çağrıları çevrimdışı önbelleğe düşüyor; kendi yerel API'si A2/A4'te.
- [x] A2 — Market paketi: üretme (yönetim paneli) + yükleme (kasa) + markete bağlama. Dosya `.kassapack` = `{format, version, checksum(SHA-256), body}`; içerik: market, ayarlar, aktif promosyonlar, hızlı ürün grupları/butonları, kasiyer listesi (id/ad/rol — PIN doğrulayıcı A3'te), tüm ürünler. Yönetim → Кассы sayfasında "Скачать пакет" (`GET /api/till-package`, yalnız ADMIN/MANAGER). Kasada `/till` boş/oturumsuz ekranında "Загрузить пакет магазина": sağlama toplamı doğrulanır, bozuk/kesik/yeni-sürüm dosya reddedilir (veri değişmez); başka markete ait gönderilmemiş satış varsa market değişimi reddedilir; yükleme katalog imleci (`catalogCursor`) ve `packageInfo`'yu yazar, sonra çevrimiçi eşitleme kaldığı yerden artımlı devam eder. Ayar/promosyon/hızlı ürün şekilleri `src/lib/till-data.ts`'te ortaklandı (canlı uçlar ve paket aynı kodu kullanır). Doğrulandı: gerçek veritabanından paket üretimi (ayar sırları/managerPin dahil değil), boş kasaya yükleme, bozuk dosya reddi, paketten kasiyer+₸+ürün araması; `till-package.test.ts` (9 test); tsc/eslint/80 test/`next build` temiz. Ek doğrulamalar: panel kartı gerçek yönetici oturumuyla görüldü; `/api/till-package` gerçek indirmesi kasaya yüklendi (eski 52.500 ürün yerine geçti); CASHIER rolü 401 alıyor; 52.500 ürünlük paket (~18 MB) ~4 sn'de yüklendi, barkod araması <1 sn. Düzeltme: `OfflineManager` oturum bitince `/till`'de `/kasa-giris`'e (sunucu ister) atıyordu, artık `/till`'in kendi giriş ekranına döner.
- [x] A3 — Kasiyer PIN girişi (2026-09-29, kullanıcı kararı: **4 haneli PIN**). Panelde PIN verme zaten vardı (Управление → Сотрудники, 4 hane, scrypt); paket her personelin PIN hash'ini (`pin`, yoksa `null`) taşır → mevcut PIN'ler değişiklik yapmadan çalışır. Kasada `src/lib/offline/pin-login.ts`: aynı scrypt parametreleriyle (N=16384,r=8,p=1) tarayıcıda doğrulama (`@noble/hashes`), personel başına 5 yanlışta 5 dk kilit; `src/components/till/pin-login.tsx`: dokunmatik ekran (isim seç → 4 haneli tuş takımı); `/till` oturumsuz ekranı artık bu. PIN'i olmayan personel listelenmez (boşsa "PIN'i panelden verin, paketi yeniden yükleyin" uyarısı). **Bulunan hata:** `OfflineManager` internet varken sunucu çerezindeki kullanıcıyı kasa kimliği yapıyordu — `/till`'de PIN'le girenin kimliği tarayıcıda kalan başka bir oturumla sessizce değişiyordu (satışlar yanlış kişiye yazılırdı); `/till`'de artık devre dışı. Doğrulandı (gerçek tarayıcı): yanlış PIN reddi, doğru PIN → kasa ekranı ve kimlik doğru kişi, 5 yanlış → kilit (kilitliyken doğru PIN de reddedilir), yeni paket yüklenince liste yenilenir; `pin-login.test.ts` (8 test, sunucunun `hashPin` çıktısıyla uyum dahil); tsc/eslint/88 test temiz. **Güvenlik notu:** 4 haneli PIN paket dosyasından saniyeler içinde kırılabilir → paket yalnız ADMIN/MANAGER indirir ve anahtar gibi saklanmalı. **Gerçek personelde henüz PIN yok** (3 kişinin de `pin` alanı boş) — panelden verilmeli.
- [x] A3b — **Yükleme yetkisi / cihaz anahtarı** (2026-09-29). Mevcut Hub altyapısı yeniden kullanıldı (yeni tablo yok): "Скачать пакет" her indirmede o markete özel, iptal edilebilir yeni bir `hub_...` Bearer anahtarı üretir (`HubToken`, etiket "Пакет кассы <tarih> · <indiren>") ve pakete `deviceToken` olarak koyar; kasa onu IndexedDB'de saklar (`src/lib/offline/device-token.ts`), kuyruk gönderimi ve doğrudan gönderim yalnızca **`/till`'de** `Authorization: Bearer` ekler (tarayıcı kasası `/pos` hâlâ çerezle çalışır; aynı tarayıcıda kalmış eski anahtar onu etkilemez). Sunucuda `proxy.ts` `Bearer hub_`'ı zaten geçiriyor, 6 yazma ucu (satış, iade, fişsiz iade, vardiya aç/kapat, para hareketi) `resolvePosRequest` ile kabul ediyor; kasiyer gövdedeki `cashierUserId` ile atfediliyor. Doğrulandı (gerçek sunucuya, çerezsiz): geçerli anahtar → kabul + doğru kasiyere atıf, yanlış anahtar 401, iptal edilen anahtar 401, çerez/anahtar yok → giriş yönlendirmesi; test kayıtları silindi. `device-token.test.ts` (3 test), tsc/eslint/91 test temiz. **Güvenlik notu:** paket artık hem 4 haneli PIN hash'lerini hem de mağaza için sahte satış yazabilen bir anahtar taşıyor → flash diski ve dosyayı anahtar gibi saklayın; kaybolursa o anahtar iptal edilmeli. **Eksik (sonraya):** anahtarları listeleyip iptal eden yönetim ekranı (şimdilik yalnızca `revokeHubToken`); anahtar iptal edilmişken `/till`'de "войдите заново" yerine "пакет отозван, загрузите новый" mesajı; kasa programı (A4) bulut adresine farklı bir kökenden (Electron) istek atacağı için CORS/aracı süreç kararı A4'te.
- [x] A3c — **Oturumsuz okuma uçları** (2026-09-29). Merkezi çözüm: `src/lib/device-access.ts` — cihaz anahtarı (`Authorization: Bearer hub_…`) + `X-Till-Cashier` geçerliyse `auth.api.getSession` (`auth.ts`'te sarıldı) ve `getStoreId` (`store-context.ts`) sıradan bir kasiyer oturumu döndürür; böylece `hasKioskAccess`, `resolvePosActor` ve doğrudan `getSession` çağıran tüm uçlar değişmeden çalışır. Sınırlar: yalnızca anahtarın market'i; o markete atanmış, kovulmamış, kasada izinli personel; **MANAGER, API'de düz CASHIER sayılır** (paket dosyasından ofis yetkisi doğmaz); yalnızca `DEVICE_API_PREFIXES` listesindeki kasa uçları — `src/proxy.ts` yolu denetler, `x-device-ok` başlığını yalnız o koyar ve istemciden gelen her `x-device-ok`'u siler; anahtarla sayfa isteği 403. Kasada `src/lib/offline/device-fetch.ts`: `/till`'de her `/api/` çağrısına anahtar + çalışan personel eklenir (modül yüklenirken kurulur). Ek: `/api/pos/till-cashiers` (yalnız cihaz oturumu; PIN hash'li personel listesi) → internet varken kasa personel/PIN kopyasını kendiliğinden yeniler (yeni paket taşımak gerekmez). Test (gerçek sunucuya, çerezsiz, 13 durum): satış geçmişi/beklemeye alınanlar/ayarlar/müşteri/kasa durumu/vardiya 200; kasiyer başlığı yok, bilinmeyen kasiyer, yanlış anahtar, ofis API'si (employees), sahte `x-device-ok` (anahtarsız ve anahtarlı), anahtarla sayfa → hepsi reddedildi; test anahtarı silindi. `device-access.test.ts`.
- [x] **Anahtar iptali:** Управление → Кассы altında "Ключи касс" tablosu (etiket, veriliş, son bağlantı, **Отозвать**; `GET /api/till-package/keys`, `DELETE …/keys/:id`, denetim kaydı). İptal edilen anahtarla `/till` şimdi "сервер не принял ключ кассы. Пакет магазина отозван или устарел — загрузите новый пакет" der ("войдите заново" değil).
- [x] **Ödeme yöntemi her yeni çekte Наличная'ya döner** (`clearCart` sıfırlıyordu ama yöntem kalıyordu; önceki kartlı satıştan sonra pencere Карта ile açılıyordu — UMAG'da hep Наличная). `/till` ödeme penceresi eski tasarım değil: UMAG düzeni (ОТМЕНА / БЕЗ СДАЧИ yalnız nakitte / ОПЛАТА).
- [x] **Büyük kuyruk / kesinti / fiş numarası (birim test, `queue-large.test.ts`, 6 test):** 300 kayıt oldest-first, birer kez, kuyruk boşalır; 200 kayıtta bağlantı 120'de kopar → kalan 80 sırayla kalır, sonra 120'den devam eder; anahtar reddi (401) → tek istekte durur, 50 kayıt korunur, `needsLogin`; 200 (zaten var) başarı sayılır, 400 kaydı park edilir ve diğerlerini engellemez; 1000 eşzamanlı fiş numarası benzersiz. **Bulunan risk:** kasa kodu 4 hane hex (65 bin) → çok kasalı markette ~%0,1 fiş numarası çakışması (`receiptNo` benzersiz değil, satış kaybolmaz, yalnız karışık numara); yeni kasalar 6 hane alır (500 kasada çakışma yok), eskiler kendi kodunu korur. Yanlış saat: sunucu tarafı `trustedTime()` 13 testle kapsanıyor + kasiyere uyarı (önceden yapıldı).
- **Gerçek Chrome'da uçtan uca doğrulama (2026-09-29, A3c sonrası):** İстория продаж `/till`'de açılıyor (#151 ve eski fişler, oturum hatası yok); online satış cihaz anahtarıyla doğrudan gitti; kartlı satıştan sonra saklı ödeme yöntemi CASH; yönetici PIN değiştirince kasa personel kopyasını kendiliğinden aldı (yeni paket gerekmedi); "Ключи касс" tablosunda yalnız kendi anahtarım iptal edildi (3→2); iptal edilmiş anahtarla vardiya açma ve satış **reddedilmedi**, kuyruğa alındı (`shift-open [HTTP 401]`, satış 1D9A-000003) ve "ключ кассы не принят / Пакет отозван — загрузите новый" uyarısı çıktı. Bulunan/ders: (1) `send.ts` iptal edilmiş anahtarda satışı REDDEDİYORDU → düzeltildi (`send-device.test.ts`); (2) sunucu aşırı yüklüyken (paralel Docker derlemesi) cihaz oturumu çözümlemesi zaman aşımına uğrayınca istek 401 alıyor — kasa bunu "anahtar reddi" gibi gösterir ve kuyruğa alır (veri kaybı yok, geçici); (3) çerezler port değil sunucu adına bağlı (`localhost:3000` ve `:3100` aynı çerezi paylaşır) — test artefaktı, canlıda tek adres; (4) ödeme penceresinin "farklı görünmesi" tasarım bozukluğu değil: Карта sekmesi tuş takımsız kompakt düzen, Наличные sekmesi tuş takımlı düzen (UMAG gibi).
- [x] **Otomatik anahtar devri (kayıt) — 2026-09-29, gerçek Chrome + Docker'da uçtan uca doğrulandı.** `/api/pos/till-enroll` + `enrollDevice()` (`device-token.ts`): paketteki anahtar yalnız başlangıç anahtarı; kasa internetle ilk bağlanınca **kendiliğinden** kendine özel anahtar alır (etiket "Касса <kod>", aynı kod tekrar kaydolursa eskisi iptal edilir). Sonra paket anahtarı (flash disk) iptal edilse bile kurulu kasa etkilenmez. Deney: paket yüklendi → PIN girişi → hiçbir şey yapılmadan `enrolled=true` ve farklı anahtar → paket anahtarları veritabanında iptal edildi → kasa yine 200 (satış geçmişi, ayarlar, beklemeye alınanlar) → vardiya açıldı (doğrudan gitti) → sunucu durduruldu → satış yerelde tamamlandı (Наличные, fiş, "не синхронизированные (1)") → sunucu başlatıldı → ~15 sn'de kendiliğinden gitti, uyarı kayboldu; sunucuda satış #152 doğru kasiyer/vardiya/tutar, stok 44. `device-token.test.ts` (enroll, 2 test) + 9 sunucu durumu (paket anahtarıyla kayıt, kayıt sonrası bağımsızlık, yeniden kayıtta değiştirme, tek canlı anahtar). Test verisi silindi. Eski 4 haneli kasa kodu ("1D9A") korunur, yeni kasalar 6 hane alır.
- [x] **Aktivasyon kodu (2026-09-29, kullanıcı isteği):** paket dosyası indirip taşıma yerine, yönetici Управление → Кассы → "Создать код" ile 8 haneli, **tek kullanımlık, 24 saat geçerli** kod üretir (`ActivationCode` tablosu, yalnız SHA-256 hash saklanır; migration `20260929130000_till_activation_code` — **canlı sunucuya uygulanmalı**); yeni kasada `/till` "Касса не привязана" ekranına kod yazılır (`activation-form.tsx`), kasa `POST /api/till-activate` ile paketini (başlangıç anahtarıyla) kendisi indirir ve yükler; internet yoksa "или загрузить пакет файлом" yolu duruyor. Kaba kuvvet freni: istemci başına 10 dakikada 8 deneme + tüm sunucu için saatte 200; hatalı/kullanılmış/süresi geçmiş kod aynı mesajı verir. Gerçek Chrome + Docker'da uçtan uca doğrulandı: yönetici kodu üretti (7647-9949) → temiz kasada klavyeyle yazıldı → paket kendiliğinden indi (Нурай, personel) → aynı kod ikinci kez 400 → PIN girişi → katalog indi → kasa kendi anahtarını otomatik aldı (enrolled=true). `till-activation.test.ts` (6 test). Test verisi silindi. **Not:** Electron programı (A4) sunucu adresini bilmeli (varsayılan korgenkassa.kz, ayarlanabilir).
- [x] **Satış ekranı UMAG'la birebir hizalandı (2026-09-29; `_umag-sandbox/shots/70-75`, jar taraması):** (1) alt düğmeler UMAG düzeninde: 4 sütun, 1. satırın ilk hücresi boş, **КОЛИЧЕСТВО düğmesi eklendi**, "Отложка", yalnız metin; (2) **КОЛИЧЕСТВО** ve **УНИВЕРСАЛЬНЫЙ ПРОДУКТ** artık UMAG'ın ortadaki beyaz sayı penceresi (`number-dialog.tsx`: turkuaz başlık, seçili değer — ilk tuş değiştirir —, gri 7-8-9/4-5-6/1-2-3/0 . tuşları, sağda УДАЛИТЬ/ОТМЕНА/OK; Enter/Esc/klavye); satıra tıklamak artık miktar penceresi AÇMAZ (UMAG'da yalnız düğme); Универсальный продукт **yalnız fiyat** sorar; (3) **ИЗМЕНИТЬ ТОВАР** UMAG penceresi (`product-edit-dialog.tsx`: Название товара + Продажная цена `130.000` + turkuaz tuşlar + Отменить/Сохранить) ve **ürünü gerçekten değiştirir** (UMAG'da ProductInfoEdition/ProductPriceEdition yerel kayıtları sunucuya yükleniyor): `POST /api/pos/products/:id/edit` (isim için «Изменение товара на кассе», fiyat için «Изменение цены», «Запретить понижать цену» sunucuda da zorunlu), çevrimdışıyken kuyruğa (`product-edit`) + yerel katalog anında güncellenir, tüm kasalara katalog eşitlemesiyle yayılır; Розница/Оптовая seçimi yalnız o satırı etkiler; (4) tablo başlığında UMAG'ın **«СКИДКА» kutusu**: yüzde yazılıp Enter → işaretli satırlara (yoksa seçili satıra) uygulanır, hücre `10.00 %` gösterir; seçili satır gri. **Kaldırılan (UMAG'da yok):** eski ИЗМЕНИТЬ ТОВАР penceresindeki satır notu ve tutar olarak satır indirimi alanı (indirim artık yüzde, tablodan). **Varsayım (doğrulanamadı):** УДАЛИТЬ tuşu son karakteri siler (UMAG'ın canlı davranışı bu oturumda test edilemedi). **Hata bulundu/düzeltildi:** sayı penceresi çok hızlı gelen tuşlarda rakam kaybediyordu (React eski durumu görüyordu) → `use-number-entry.ts` (durum ref'te de tutulur); regresyon testi. Testler: `number-dialog.test.tsx` (8), `product-edit-route.test.ts` (6); gerçek Chrome'da doğrulandı: pencereler UMAG ekran görüntüleriyle aynı, 3 adet × ₸130 = ₸390, %10 → ₸351, Универсальный продукт ₸250 satırı eklendi. **СВЕРНУТЬ:** tarayıcıda tam ekran aç/kapa; gerçek küçültme A4'te (Electron).
- **Hâlâ yapılmadı:** gerçek market kasasında ve gerçek telefonda deneme; birden fazla GERÇEK kasanın aynı anda çevrimdışı çalışması (yalnız birim düzeyinde); A4 (Electron; bulut adresine farklı kökenden istek → CORS/aracı süreç kararı) ve A5 (kurulum dosyası, güncelleme).
- **Uçtan uca test (2026-09-29, Docker :3000, gerçek Chrome):** yönetici → "Скачать пакет" (anahtar üretildi) → çıkış → `/till` paket yükleme → PIN girişi → sunucudaki 4 günlük açık vardiya devralındı ve kapatıldı (Z-отчёт) → yeni vardiya → sunucu durdurularak internet kesildi → satış yerel kuyruğa yazıldı (fiş 1D9A-000002, yerel stok 45→44) → sunucu geri gelince ~10 sn'de kendiliğinden gönderildi (oturumsuz, yalnızca cihaz anahtarıyla), doğru kasiyer/vardiya/stok (44). Test verisi (satış, anahtar, test yöneticisi) silindi, stok 45'e geri alındı.
- [ ] A4 — Electron sarmalayıcı (kabuğu içinde taşır, verisi kullanıcı klasöründe).
- [ ] A5 — Windows kurulum dosyası + otomatik güncelleme + gerçek kasada deneme.
- Not: Hub (çok kasalı market) bu programla birlikte çalışacak şekilde ayrıca korunur (Adım 5).

### Kararlar (2026-09-29, kullanıcı)
- **Fiskal / WebKassa yapılmayacak** — kendi fişimizi çıkarıyoruz (Adım 4 iptal).
- **Ekran klavyesi** yalnız arama kutusunda kalır.
- **Donanım:** şu an yalnızca barkod okuyucu var (fiş yazıcı, para çekmecesi, müşteri ekranı denenemez).
- **Gerçek market denemesi** proje bitince.
