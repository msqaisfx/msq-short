<p align="center"><img src="public/brand/msqaisfx-logo.png" alt="MSQAISFX" width="160"></p>

# MSQ Short

العربية · [English](README.md)

MSQ Short مشروع مفتوح المصدر من MSQAISFX لاختصار الروابط، بواجهة عربية وإنجليزية، ويعمل على Cloudflare Workers مع Static Assets وD1 وTurnstile. منطق التطبيق غير مرتبط بنطاق محدد؛ يحدد `APP_BASE_URL` عنوان كل بيئة.

## الخصائص

- واجهة عربية وإنجليزية مع دعم RTL وLTR.
- إنشاء الروابط القصيرة ونسخها، وتوليد QR بصيغة SVG، وإعادة التوجيه، وإحصائيات تراعي تقليل البيانات.
- إدارة الروابط والإحصائيات عبر D1.
- تحقق Turnstile على الخادم.
- بوابة مصادقة اختيارية ومستقلة لبيئة Staging تحمي الصفحات وAPI وإعادة التوجيه والأصول غير العامة.
- جلسات آمنة، وملفات Cookies محمية، وCSRF، وانتهاء وإلغاء الجلسات، وPBKDF2، وحد لمحاولات الدخول.

## تجربة الاستخدام

المسار الأساسي بسيط: **ألصق الرابط ← اختصر ← انسخ**. يمكن إضافة لقطات الشاشة بعد نشر مصرح به بصورة مستقلة؛ لا يعرض هذا المستودع روابط Staging أو الإدارة الخاصة.

## التقنيات

Cloudflare Workers وWorkers Static Assets وD1 وTurnstile ووحدات JavaScript ومكتبة `qrcode-generator`.

## التشغيل المحلي

تحتاج إلى Node.js 20 أو أحدث وnpm.

```sh
npm install
npx wrangler d1 migrations apply msq-short --local
npx wrangler dev
npm run verify
```

استخدم `.env.example` مرجعًا للأسماء فقط. ضع أسرار التطوير في `.dev.vars` المستبعد من Git، ولا تحفظ بيانات اعتماد حقيقية في المستودع.

## الإعدادات

| المتغير | سري | الغرض |
|---|---:|---|
| `APP_BASE_URL` | لا | العنوان الأساسي للروابط الناتجة |
| `APP_ENV` | لا | `local` أو `staging` أو `production` |
| `TURNSTILE_SITE_KEY` | لا | المفتاح العام لعنصر Turnstile |
| `TURNSTILE_REQUIRED` | لا | إلزام التحقق على الخادم |
| `TURNSTILE_SECRET_KEY` | نعم | مفتاح Turnstile السري |
| `STAGING_AUTH_REQUIRED` | لا | تفعيل بوابة Staging فقط |
| `STAGING_AUTH_CREDENTIALS` | نعم | سجلات PBKDF2 بصيغة JSON دون كلمات مرور صريحة |
| `LOGIN_RATE_LIMIT_SECRET` | نعم | تمويه عناوين عملاء تسجيل الدخول |

تتضمن صيغة الاعتماد المحدودة الحقول `username` و`role` و`salt` و`iterations` و`hash`. ولّدها محليًا وفق عملية آمنة، ولا تعِد استخدام كلمات مرور إنتاجية.

## إعداد Cloudflare

أنشئ قاعدة D1 في حسابك، وضع معرّفها في إعداد نشر خاص، ثم طبّق ملفات `migrations/`. أدخل الأسرار باستخدام `wrangler secret put`، وأنشئ Turnstile مع فصل المفتاح العام عن المفتاح السري. راجع [دليل النشر](docs/DEPLOYMENT.md) و[معمارية المشروع](docs/ARCHITECTURE.md).

## الأمان والاختبارات

يتحقق Worker من روابط HTTP(S)، ويرفض الروابط المحلية أو التي تحتوي بيانات اعتماد، ويتحقق من Turnstile على الخادم ويطبق ترويسات أمان. نفذ:

```sh
npm test
npm run test:integration
npm run test:security
npm run verify
```

الاختبارات الحية على Cloudflare تحتاج موافقة نشر مستقلة. للإبلاغ عن ثغرة راجع [SECURITY.md](SECURITY.md).

## الترخيص والعلامة

الكود مرخص وفق [MIT](LICENSE). اسم MSQAISFX وشعارها وأصول هويتها غير مشمولة تلقائيًا بترخيص MIT؛ راجع [TRADEMARKS.md](TRADEMARKS.md).
