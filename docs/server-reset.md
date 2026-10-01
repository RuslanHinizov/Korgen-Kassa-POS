# Sunucuyu sıfırlama (tüm marketleri silip yeni boş market açma)

Canlı sunucudaki **bütün marketleri ve verilerini** siler; yalnızca platform sahibi (SUPERADMIN) hesabı kalır.
Geri alınamaz, ama betik önce yedek alır (`/opt/korgen-backups/before-reset-*.dump`, `deploy/restore.sh` ile geri yüklenir).

1. Güncel kodu yükle (`korgen-src.tar.gz` → `sh deploy/update.sh ...`).
2. Sunucuda: `cd /opt/korgen && sh deploy/reset-all-data.sh` — istenince `DELETE EVERYTHING` yaz.
3. https://korgenkassa.kz/login → platform sahibi olarak gir → `/superadmin` → yeni market:
   ad `Нурай`, yönetici adı/telefonu/şifresi. Yeni market Rusça ve ₸ (ondalıksız) ile açılır.
4. Yönetici: Управление → Кассы (Касса-1…), çalışanlar (PIN), ürünler.
5. Daha önce kurulmuş kasa programları kesilir: her birinde `%APPDATA%\Korgen Kassa` klasörünü sil, programı aç,
   yeni aktivasyon kodunu gir (kodu panelde "Это касса:" seçerek üret).

Silinenler: tüm marketler, çalışanlar (SUPERADMIN hariç), ürünler, satışlar, vardiyalar, finans, destek yazışmaları,
hata kayıtları, cihaz anahtarları/aktivasyon kodları, yüklenmiş resimler. Fiş/belge numaraları 1'den başlar.

## Her şeyi sil (süper admin dahil), yedeksiz
`sh deploy/reset-all-data.sh --everything --no-backup` — `DELETE EVERYTHING` yazılır, sonra yeni süper admin için telefon,
ad ve şifre (8+ karakter) sorulur. Geri alınamaz. Yeni süper admin, uygulama kapalıyken oluşturulur (kurulum sihirbazı
bir an bile yabancıya açık kalmaz).
