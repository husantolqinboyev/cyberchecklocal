# 🎯 Project Salaam - Yuzni Tanib Olish Asosida Davomat Tizimi

## 📋 Loyiha Maqsadi

**Project Salaam** - bu zamonaviy yuzni tanib olish texnologiyasidan foydalanadigan, xavfsiz va ishonchli davomat tizimi. Talabalar, o'qituvchilar va adminlar uchun mo'ljallangan bu platforma quyidagi imkoniyatlarni taqdim etadi:

- 👨‍🎓 **Talabalar:** Yuz orqali avtomatik davomat
- 👨‍🏫 **O'qituvchilar:** Guruhlarni boshqarish, davomat statistikasi
- 👑 **Adminlar:** Tizimni boshqarish, xavfsizlik nazorati

## 🛡️ Xavfsizlik Himoyasi

### 🔒 Kuchli Autentifikatsiya
- **Yuzni Tanib Olish:** Face-API.js asosida biometric autentifikatsiya
- **Qurilma Bog'lash:** Har bir foydalanuvchi faqat bitta ro'yxatdan o'tgan qurilmadan kirishi mumkin
- **CSRF Himoyasi:** Barcha so'rovlar uchun token tekshiruvi
- **Double Token Strategiyasi:** Qisqa muddatli access tokenlar va uzun muddatli refresh tokenlar

### 🎯 Rollarga Ko'ra Himoya
- **Adminlar:** Faqat bitta qurilmadan kirish mumkin, qattiq himoya
- **O'qituvchilar:** Qurilma o'zgarishi monitoring qilinadi, lekin kirishga ruxsat beriladi
- **Talabalar:** Yuzni tanib olish orqali avtomatik davomat

### 📍 GPS va Joylashuv Himoyasi
- **Haqiqiy GPS Tekshiruvi:** Fake GPS va emulyatorlarni aniqlaydi
- **Radius Nazorati:** Ma'lum masofadan tashqarida ishlashni cheklaydi
- **Haversine Formulasi:** Aniq masofa hisoblash

## 🚀 Vercel ga Joylash uchun Tayyorlik

### 📦 Kerakli Environment Variables

`.env.local` faylini yaratish va Vercel dashboard'da ushbu o'zgaruvchilarni qo'shish:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
VITE_APP_URL=your_vercel_app_url
VITE_ADMIN_LOGIN=AdminHusan
VITE_ADMIN_PASSWORD=Husan0716
```

### ⚙️ Vercel Sozlamalari

1. **Build Command:** `npm run build`
2. **Output Directory:** `dist`
3. **Install Command:** `npm install`

### 🔧 Vercel.json Konfiguratsiyasi

`vercel.json` faylini yaratish:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "dist"
      }
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ]
}
```

## 🛠️ Oʻrnatish va Ishlatish

### 📋 Talablar
- Node.js 16+ 
- npm yoki yarn
- Modern brauzer (Chrome, Firefox, Safari)
- WebRTC qo'llab-quvvatlovchi kamera

### 🔧 Oʻrnatish

```bash
# Loyihani klonlash
git clone <your-repo-url>
cd project-salaam-main

# Dependencies ni o'rnatish
npm install

# Development serverni ishga tushurish
npm run dev

# Production build
npm run build
```

## 🎯 Imkoniyatlar

### 👨‍🎓 Talabalar uchun
- 📸 Yuzni skaner qilish orqali davomat
- 📊 Shaxsiy davomat statistikasi
- 📱 Mobil qurilmalarda ishlash

### 👨‍🏫 O'qituvchilar uchun  
- 👥 Guruhlarni boshqarish
- 📈 Davomat statistikasi
- 📋 Dars jadvallari
- 🔔 Bildirishnomalar

### 👑 Adminlar uchun
- ⚙️ Tizim sozlamalari
- 🛡️ Xavfsizlik nazorati
- 📊 Umumiy statistika
- 👤 Foydalanuvchilarni boshqarish

## 🛡️ Xavfsizlik Xususiyatlari

### 🔐 Autentifikatsiya
- Biometric yuz tanib olish
- Multi-factor autentifikatsiya
- Session management
- Device fingerprinting

### 🛡️ Himoya Mexanizmlari
- CSRF protection
- XSS prevention  
- Rate limiting
- IP whitelisting
- GPS spoofing detection

### 📊 Monitoring
- Security event logging
- Device change detection
- Suspicious activity alerts
- Real-time notifications

## 📊 Texnologiya Stacki

### Frontend
- ⚛️ React 18 + TypeScript
- 🎨 Shadcn/ui (Radix UI + Tailwind CSS)
- 📸 Face-API.js (Yuzni tanib olish)
- 🔄 Tanstack Query (Data management)

### Backend
- 🗄️ Supabase (PostgreSQL + Auth)
- ⚡ Supabase Edge Functions
- 🔐 JWT Authentication
- 📡 RESTful APIs

### Deployment
- 🚀 Vercel (Frontend)
- ☁️ Supabase (Backend)
- 📦 npm (Package management)

## 🚀 Productionga Tayyorlik

### ✅ Test Qilingan
- ✅ Unit tests
- ✅ Integration tests  
- ✅ Security testing
- ✅ Performance testing
- ✅ Cross-browser testing

### 📈 Scaling Ready
- 🚀 CDN optimizatsiya
- 📊 Database indexing
- ⚡ Edge caching
- 🔄 Background jobs

## 📞 Bog'lanish

Loyiha muallifi: [Sizning Ismingiz]  
Email: sizning@email.com  
Telegram: @sizning_username

## 📜 Litsenziya

MIT Litsenziyasi - batafsil [LICENSE](LICENSE) faylida.

---

**⚠️ Eslatma:** Loyihani ishga tushirishdan oldin barcha environment variables'ni to'g'ri sozlang va Supabase projectni to'liq sozlang.