# AI Mesaj Yazıcı Pro + Stripe
Bu sürüm `nextgencommerce.shop` domainine göre hazırlanmıştır.

## 1) Sunucu kurulumu
```bash
npm install
cp .env.example .env
node server.js
```

## 2) .env ayarları
`.env` içinde aşağıdakileri doldur:
- `APP_URL=https://nextgencommerce.shop`
- `JWT_SECRET=guclu-bir-anahtar`
- `OPENAI_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## 3) Stripe webhook
Stripe Dashboard'da webhook endpoint olarak bunu ekle:
`https://nextgencommerce.shop/api/stripe/webhook`

Yerelde test için:
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

## 4) Reverse proxy örneği (Nginx)
```nginx
server {
    listen 80;
    server_name nextgencommerce.shop www.nextgencommerce.shop;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 5) SSL
Nginx sonrası Let's Encrypt ile SSL bağla:
```bash
sudo certbot --nginx -d nextgencommerce.shop -d www.nextgencommerce.shop
```

## 6) PM2 ile sürekli çalıştırma
```bash
npm install
npm install -g pm2
pm2 start server.js --name nextgencommerce-ai
pm2 save
pm2 startup
```

## 7) Notlar
- Yeni kullanıcı 3 ücretsiz krediyle başlar.
- Paket satın alındığında kredi webhook ile eklenir.
- OpenAI anahtarı boşsa demo mod çalışır.


## UI güncellemesi
- Güven veren yeni arayüz
- Footer eklendi
- Mobil uyum güçlendirildi
- Flört hedefi ve cinsiyet alanı eklendi

## Eklenen sayfalar
- Ana sayfaya SSS bölümü eklendi
- /privacy.html gizlilik politikası
- /terms.html kullanım şartları
