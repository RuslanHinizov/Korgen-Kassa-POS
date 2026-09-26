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

**Henüz bakılmayanlar (bilerek):** СИНХ. С СЕРВЕРОМ, ПРОВЕРИТЬ ОБНОВЛЕНИЕ (ağa çıkmaya çalışır), ЗАБЛОКИРОВАТЬ КАССУ (kilitler, şifre gerekir), ВЫХОД ИЗ ПРОГРАММЫ, СВЕРНУТЬ, РАСПЕЧАТАТЬ ЧЕК, ВКЛ/ВЫКЛ ПРИНТЕР, ДОБАВИТЬ ДОП ПРИНТЕР, giriş ekranı ayrıntıları, СДАТЬ СМЕНУ akışı, история 2. sayfa/takvim.

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
- [~] Yerel depo (IndexedDB): ürünler, barkodlar, fiyatlar, hızlı ürünler, kategoriler, kasiyerler, ayarlar, promosyonlar, müşteriler. *(Yapıldı: yalnızca ürünler. Kasiyer, ayar, promosyon, hızlı ürün, müşteri kopyası henüz yok.)*
- [+] Yerel depo: **gönderilmemiş kuyruk** (satış, iade, vardiya, para hareketi, iptal). Her kayıtta durum (bekliyor / gönderiliyor / gönderildi / hata) ve deneme sayısı. *(Yapıldı: yalnızca satış. İade, vardiya, para hareketi, iptal kaydı henüz kuyruğa girmiyor.)* *(Yapıldı: satış, iade, fişsiz iade, vardiya açma/kapama, para hareketi. Kuyruk kimliği = kasanın ürettiği kimlik.)*
- [+] Kasa fiş sayacı (yerelde saklanır, yenileme/kapanma sonrası korunur).
- [+] Ürün arama yerelden yapılsın (internet olsun olmasın aynı hız).
- [+] Satış anında: yerelde kaydet → ekranda fişi göster → arka planda gönder. Gönderme başarısızsa kuyrukta kalır.
- [+] Yeniden deneme: üstel bekleme, internet geri geldiğinde hemen dene (`online` olayı). *(Sabit aralıklarla: 15 sn bağlantı denetimi, 30 sn kuyruk gönderme, `online` olayında hemen; üstel bekleme yok.)*
- [+] Artımlı veri çekme: açılışta ve periyodik (varsayılan 5 dakika), değişen ürünleri günceller.
- [ ] Yerel veride stok: satışta yerel stok düşer (eşitlenince sunucunun gerçek değeri gelir).
- [ ] Promosyonlar ve indirim kartı yerelden hesaplanır (mevcut `evaluatePromotions` kullanılır).
- [ ] Bekleyen satışlar (beklemeye al) yerel de çalışsın.

### 5.4 Sayfa internetsiz açılsın
- [+] `/pos` sayfası ve gereken tüm dosyalar (`_next/static`, yazı tipleri, simgeler) service worker ile saklanır. Şu an `sw.js` yalnızca birkaç sayfayı önbelleğe alıyor ve API isteklerine karışmıyor. *(Yapıldı 2026-09-26. **Bulunan hata:** eski `sw.js` kurulum sırasında olmayan `/icons/icon.svg` dosyasını önbelleğe almaya çalışıp (404) hiç kurulmuyordu; yani sayfanın internetsiz açılması hiç çalışmamıştı. Yeniden yazıldı: gezinme (sayfa) önbelleği, `/pos` → `/store/<id>/pos` yönlendirmesi, POS başlangıç GET istekleri (ayarlar, vardiya, promosyon, danışman, hızlı ürün, kasa) için ağ-önce + önbellek yedeği, yazma istekleri önbelleğe alınmaz. Çıkışta (`signOut`) önbellekler ve katalog kopyası silinir; gönderilmemiş satış kuyruğu silinmez.)*
- [+] Sunucu güncellenince yeni sürümün otomatik alınması (eski önbellek temizliği). *(Yapıldı: sürüm `v2`, eski önbellekler `activate` sırasında silinir.)*
- [+] İnternetsiz açılışta giriş ekranı (aşağıya bak).

### 5.5 Çevrimdışı giriş
- [+] Kasiyer listesi ve giriş bilgisi yerelde saklanır. **Düz metin şifre saklanmaz.** Sunucuda kullanılan doğrulamanın yerel bir türevi (ör. tuzlanmış hash) saklanır, yalnızca o kasadaki çalışanlar için. *(Yapıldı ve doğrulandı: çevrimiçi girişten sonra tuzlu PBKDF2-SHA256 (210 bin tur) hash'i saklanır, düz şifre yok; 5 yanlış denemede 5 dk kilit. Yalnızca bu kasada çevrimiçi giriş yapmış kasiyerler girebilir. `src/lib/offline/auth.ts`)*
- [+] Çevrimdışı oturum süresi sınırlı; internet gelince sunucu ile yeniden doğrulanır. *(Yapıldı: son sunucu doğrulamasından/girişten 16 saat sonra kasa yeniden giriş ister (`TILL_AUTH_TTL_MS`). Sunucuya ulaşılamıyor ve geçerli kayıt yoksa kasa sayfası kendiliğinden giriş sayfasına yönlendirir.)*
- [~] Kasiyer devre dışı bırakılırsa (kovulursa) internet gelince yerel kayıt silinir. *(Kısmen: internet gelince sunucu, o kasiyerin yüklemesini `attributedUserId` ile reddeder/yok sayar (işten çıkarılmış ya da yetkisiz kasiyer atanmaz). Yerel hash kaydının silinmesi henüz yok.)*
- [+] Marketteki mevcut giriş ekranı (`/kasa-giris`) ile uyum. *(Yapıldı: `/kasa-giris` aynı görünümde; internet yoksa kayıtlı bilgiyle girer, gerekirse market seçtirir. Giriş sayfası service worker önbelleğine ısıtılır.)*

### 5.6 Arayüz göstergeleri (UMAG ile aynı)
- [+] Üst çubukta bağlantı noktası: internet varsa yeşil, yoksa kırmızı.
- [+] Gönderilmemiş kayıt varsa uyarı çubuğu: "Есть не синхронизированные данные. Пожалуйста подключите интернет." (kapatılabilir).
- [+] Gönderilmemiş kayıt sayısı gösterilir; hata alan kayıtlar için ayrı uyarı ve elle tekrar deneme. *(Yapıldı; ayrıca **oturum kapalıyken** yükleme bekliyorsa kırmızı 'Данные ждут отправки: войдите в кассу заново' + Войти bağlantısı.)*
- [ ] Açılışta, internet yoksa **saat doğrulama ekranı** (4 saat seçeneği, doğru olanı seç; yanlışsa satış engellenir ya da işaretlenir). Neden: yanlış saatli satışlar raporları bozar.
- [ ] Satış geçmişinde gönderilmemiş fişlerin işareti (UMAG'daki eşitleme simgesi gibi).

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

- [ ] Vardiya, açılır pencere yerine **tam sayfa** sekme olsun.
- [ ] Sekme **КУПЮРЫ**: banknot adetleri (20000, 10000, 5000, 2000, 1000, 500, 200 тг) ve bozuk para adetleri (100, 50, 20, 10, 5 тг), rakam tuş takımı (7-8-9 / 4-5-6 / 1-2-3 / 0 . ve удл., <<, >>).
- [ ] Sekme **СУММА**: doğrudan tutar girişi.
- [ ] Sekme **ВНОС, ВЫНОС СРЕДСТВ**: pencere, tür listesi **Вложения / Расходы / Дивиденды**, tutar, yorum, ЗАКРЫТЬ / СОХРАНИТЬ.
- [ ] "ВСЕ ПОЛЯ ОБЯЗАТЕЛЬНЫ ДЛЯ ЗАПОЛНЕНИЯ" uyarısı (kapatırken).
- [ ] **СДАТЬ СМЕНУ** (vardiya kapat) düğmesi, Z raporu.
- [ ] Mevcut para hareketi türleri (IN/OUT/PAYOUT/DROP) ile uyum ve raporlara yansıması (kasa akışı raporu).
- [+] Çevrimdışı çalışır (Adım 1 kuyruğu kullanır). *(Doğrulandı: vardiya çevrimdışı açıldı, satış+para girişi+iade yapıldı, vardiya kapatıldı; internet gelince hepsi sırayla yüklendi (vardiya açılışı 500, sunucunun hesapladığı beklenen nakit 750, sayılan 1200, fark 450).)*

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
- [ ] Mevcut Korgen ödeme penceresini (`payment-modal.tsx`, `payment-panel.tsx`) bu düzene çevir; UMAG'da olmayan Korgen özellikleri (bahşiş, sadakat puanı vb.) yerinde kalır ama düzeni bozmaz.
- [ ] Hazır tutar düğmelerinin **davranışı** UMAG'daki gibi (gözleme göre: ekler mi, yerine mi yazar).
- [ ] БЕЗ СДАЧИ, ОЧИСТИТЬ, ← davranışı.
- [ ] Karma ödeme ve borç sekmeleri UMAG'daki alan ve doğrulamalarla (bkz. 3.1 gözlemleri).
- [ ] ОПЛАТА С ОФД: fiskal hazır olunca (Adım 4) bağlanır; o zamana kadar UMAG'daki gibi pasif.
- [+] Ödeme, çevrimdışı kuyruğa (Adım 1) yazar. *(Yapıldı: ödeme `submitSale` ile kuyruğa yazar; henüz UMAG ödeme penceresi düzeni yok.)*

---

## 7. ADIM 3 — Ek fonksiyonlar, iade ve küçük düzeltmeler

### Ek fonksiyonlar menüsü (UMAG ile aynı 12 düğme)
- [ ] Выход из программы
- [ ] Заблокировать кассу (PIN ile kilit)
- [ ] Вкл/выкл принтер
- [ ] Распечатать чек последней продажи
- [ ] Синх. с сервером (elle eşitleme; kuyruğu hemen dener)
- [ ] Поиск по штрихкоду
- [ ] Свернуть
- [ ] Долг (kasada müşteri borcu)
- [ ] Проверить обновление (yeni sürüm kontrolü ve sayfayı yenileme)
- [ ] Добавить доп принтер
- [ ] Проверка цены (var; kapalıyken de görünsün mü, UMAG'a göre kontrol)
- [ ] Быстрая приемка (kasada hızlı mal kabul)

### İade
- [ ] Маркировка товара (işaretli ürün iadesi).
- [ ] Поиск по штрихкоду.
- [ ] "С чеком / Без чека" düzeni ve fiş numarası arama UMAG ile aynı.

### Küçük düzeltmeler
- [ ] Üst çubukta sabit "Учебный" yazısını kaldır; yerine kasa adı (örn. "Касса-4") göster.
- [ ] Boş "Производитель / Заказ / Доставка" açılır listelerini kaldır veya gerçek bir işleve bağla (UMAG'da yoksa kaldır).
- [ ] Üst çubuk rengi sekmeye göre değişsin (satış yeşil, iade sarı, vardiya kırmızı, geçmiş turkuaz).
- [ ] Ekran klavyesi ve tuş takımı tüm giriş alanlarında (dokunmatik kasa için).

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
| 1 | Çevrimdışı katman | [+] büyük ölçüde bitti (satış, iade, fişsiz iade, vardiya, para hareketi, katalog, sayfa önbelleği, çevrimdışı giriş; yerelde doğrulandı). Kalan: saat doğrulama ekranı, promosyon/kasiyer/ayar yerel kopyası, canlıya alma |
| 2 | Vardiya ekranı | [ ] başlanmadı |
| 2b | Ödeme ekranı (görünüm + davranış birebir) | [ ] başlanmadı (ekran görüldü) |
| 3 | Ek fonksiyonlar, iade, düzeltmeler | [ ] başlanmadı |
| 4 | Fiskal | [ ] giriş bilgisi bekleniyor |
