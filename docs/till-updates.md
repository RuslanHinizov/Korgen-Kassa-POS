# Kasa programının otomatik güncellemesi

Kasa programı (`till-app/`, Windows) yeni sürümleri **kendisi bulur, indirir ve kapanırken kurar**. Kasiyerin veya
yöneticinin bir şey yapması gerekmez; program satışın ortasında asla yeniden başlamaz.

## Nasıl çalışır

- Program açıldıktan ~20 sn sonra ve her 4 saatte bir `https://korgenkassa.kz/till-updates/latest.yml` dosyasına bakar
  (adres, programın bağlandığı sunucudan türetilir). İnternet yoksa sessizce vazgeçer; bir sonraki denemede tekrar bakar.
- Daha yüksek bir sürüm varsa arka planda indirir (`update.log`: `%APPDATA%\Korgen Kassa\update.log`).
- İndirilen sürüm, program **bir sonraki kapatılışında** kurulur (kasa PC'si her gün kapanır).
- **ДОП. ФУНКЦИИ → ПРОВЕРИТЬ ОБНОВЛЕНИЕ** hemen bakar; hazırsa "Установить сейчас?" diye sorar (kabul edilirse program
  yeniden açılır). Tarayıcıdaki kasada bu düğme sayfayı yeniler.
- Kasiyerin verisi (bekleyen satışlar, PIN, paket) `%APPDATA%\Korgen Kassa` içinde durur; güncelleme ona dokunmaz.

## Yeni sürüm yayınlamak

1. `till-app/package.json` içinde `version` değerini **artır** (ör. `1.1.0` → `1.1.1`). Aynı veya düşük sürüm güncelleme sayılmaz.
2. Kasa ekranlarının son halini programa al ve yükleyiciyi üret (Docker'da güncel `web` çalışırken):
   ```bash
   cd till-app
   node scripts/sync-web.mjs
   npm run dist
   ```
3. `till-app/dist/` içindeki **üç dosyayı** sunucuya kopyala (klasör yoksa önce oluştur):
   ```bash
   ssh root@<IP-СЕРВЕРА> "mkdir -p /opt/korgen/till-updates"
   scp "till-app/dist/latest.yml" "till-app/dist/Korgen Kassa Setup 1.1.1.exe" "till-app/dist/Korgen Kassa Setup 1.1.1.exe.blockmap" root@<IP-СЕРВЕРА>:/opt/korgen/till-updates/
   ```
   Sunucuyu yeniden başlatmak gerekmez; kasalar bir sonraki kontrolde yeni sürümü görür.
4. Eski dosyaları silebilirsin; `latest.yml` her zaman en yeni sürümü göstermelidir.

## Sunucu tarafı

- Rota: `src/app/till-updates/[...file]/route.ts` (`/till-updates/latest.yml` ve yükleyici). Oturum istemez; sadece
  `latest.yml`, `Korgen Kassa Setup <sürüm>.exe` ve `.blockmap` adlarını sunar, başka hiçbir dosyayı veya yolu değil.
- Dosyalar sunucuda `/opt/korgen/till-updates/` klasöründe durur (`docker-compose.prod.yml` bunu `/app/till-updates`
  olarak bağlar; `TILL_UPDATES_DIR` ile değiştirilebilir). Bu klasör Git'e girmez.
- Yükleyici hiçbir market verisi taşımaz; her yeni kasa yine kendi aktivasyon koduyla açılır.

## Bilinen sınırlar

- Yükleyici **imzasız** (Windows SmartScreen ilk kurulumda uyarı verir). Kod imzalama sertifikası alınırsa
  `electron-builder` ayarına eklenir; güncelleme mekanizması aynı kalır.
- Program ilk kez elle kurulmalıdır (1.0.0 sürümünde güncelleyici yoktu). 1.1.0'dan sonrası otomatiktir.
- Güncelleme yalnızca kasa **programı** içindir. Sunucu tarafındaki değişiklikler (API, raporlar) zaten
  `deploy/update.sh` ile anında herkese ulaşır; programın içindeki ekranlar (`web/`) ise yeni sürümle güncellenir.
