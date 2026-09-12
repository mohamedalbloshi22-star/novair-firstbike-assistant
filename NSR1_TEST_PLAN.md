# NSR-1 Test Plan — UI + Packages + Usage + Billing

## الهدف
اختبار النسخة الجديدة قبل دمجها إلى `main` أو نشرها كنسخة حية.

## الحالة الحالية
- ✅ V1–V13 المنفذة والمطبقة في Supabase تشمل الباقات، الأمان، الفوترة، التنبيهات، الحدود، الدعم، rate limiting، billing idempotency، performance indexes، وتشغيل atomic unanswered resolution.
- ✅ thresholds موحدة: 70 / 85 / 95 / 100.
- ✅ quota والحظر عند 100% والطلب التالي تم اختبارها.
- ✅ reserve / release الأساسي نجح، بما في ذلك عدم وجود active plan لعميل بلا اشتراك.
- ✅ rollover الشهري نجح وحافظ على السجل السابق.
- ✅ Chat مربوط بالحد الشهري مع distributed rate limiting وفشل مغلق عند تعطل الحماية.
- ✅ Contact عليه distributed rate limiting وفشل مغلق.
- ✅ Support Client عليه distributed rate limiting: 20 POST / ساعة لكل Client + IP، ثم حظر مؤقت 15 دقيقة.
- ✅ Admin login عليه distributed persistent rate limiting.
- ✅ unanswered -> knowledge resolution أصبح transaction ذريًا في قاعدة البيانات لكل من العميل والإدارة.
- ✅ Webhook Stripe يتحقق من التوقيع والوقت وevent id ويستخدم claim ledger؛ duplicate المكتمل يعاد 200، أما event الجاري معالجته فيعاد non-2xx حتى يعاد المحاولة بدل فقد الحدث.
- ✅ Client/Admin cookies تتعامل بأمان مع malformed URI encoding بدل رمي 500.
- ✅ hard delete للعميل محمي ويتطلب تعطيل العميل وتأكيد صريح.
- ✅ inactive clients محميون في المسارات الحساسة.
- ✅ xlsx محدث إلى SheetJS 0.20.3.
- ✅ safe logging مطبق على المسارات الحساسة.
- ✅ Supabase security advisor لا يعرض WARN/ERROR حاليًا؛ الموجود INFO فقط عن RLS بدون policies في نموذج service-role-only.
- ✅ آخر Vercel build للفرع نجح.
- ✅ pre-merge DB consistency audit الحالي: لا orphan records، لا cross-client links، لا invalid thresholds، لا stale billing claims، لا failed notifications.
- ⏸️ Stripe الفعلي مؤجل حتى صدور الرخصة وإنشاء حساب Stripe.
- ⏳ الفحص البصري النهائي للواجهات والجوال ما زال مطلوبًا.
- ⏳ Stripe Test Mode ما زال مطلوبًا قبل اعتبار الدفع مكتملًا.
- ⏳ HTTP Preview adversarial A→B tenant test ما زال مطلوبًا عند توفر وصول فعلي للـPreview.

## 1. قاعدة البيانات
الملفات الأساسية المطبقة تشمل:
1. `supabase/nsr1-packages-v1.sql`
2. `supabase/nsr1-packages-v2.sql`
3. `supabase/nsr1-packages-v3.sql`
4. `supabase/nsr1-packages-v4-security.sql`
5. `supabase/nsr1-billing-v5.sql`
6. `supabase/nsr1-notifications-v6.sql`
7. `supabase/nsr1-alert-thresholds-v7.sql`
8. `supabase/nsr1-support-v8.sql`
9. `supabase/nsr1-login-rate-limit-v9.sql`
10. `supabase/nsr1-chat-rate-limit-v10.sql`
11. `supabase/nsr1-billing-idempotency-v11.sql`
12. ملفات V12 للأداء وصلاحيات RLS trigger.
13. `supabase/nsr1-unanswered-atomic-resolve-v13.sql`

العناصر التجارية/التشغيلية الرئيسية:
- `nsr_plans`
- `nsr_client_subscriptions`
- `nsr_usage_counters`
- `nsr_usage_alerts`
- `nsr_subscription_events`
- `nsr_admin_usage_overview`
- `nsr_billing_events`
- `nsr_billing_event_claims`
- `nsr_notification_log`
- `nsr_support_requests`
- `nsr_chat_rate_limits`
- `nsr_login_attempts`

## 2. الباقات والاستخدام
تم:
- ✅ اختبار حد 20 رد على `nsr-test-20`.
- ✅ الوصول إلى الحد ومنع الطلب التالي.
- ✅ reserve/release أساسي ناجح.
- ✅ اختبار عميل بلا active plan: الحجز مرفوض بـ `NO_ACTIVE_PLAN` بدون تغيير counter.
- ✅ rollover شهري ناجح.
- ✅ التنبيهات 70 / 85 / 95 / 100.
- ✅ لوحة الإدارة تستبعد paused/cancelled من MRR والسعة ومؤشرات الباقات الفعالة.

مطلوب لاحقًا:
- ⏳ إعادة اختبار بصري سريع للحدود الجديدة إذا أردنا توثيق كل threshold في الواجهة فعليًا.

## 3. فشل AI
الكود يحجز quota قبل AI ويعمل release عند الفشل قبل اكتمال الرد.

تم:
- ✅ اختبار reserve/release على مستوى قاعدة البيانات.

مطلوب قبل الدمج:
- ⏳ اختبار متكامل متعمد لفشل Anthropic عبر الـPreview والتأكد أن الرصيد لا ينقص.

## 4. واجهة العميل
تم:
- ✅ تسجيل الدخول على Preview سبق ونجح.
- ✅ إحصائيات التشغيل والباقة والاستخدام موجودة.
- ✅ لا تظهر تكاليف AI الداخلية للعميل.
- ✅ يعرض التجديد/الدورة.
- ✅ inactive client protections موجودة.
- ✅ 429 يميز بين quota exhaustion وtemporary chat rate limiting.

مطلوب:
- ⏳ فحص بصري نهائي على المتصفح والجوال.
- ⏳ HTTP tenant isolation A→B فعلي على Preview.
- ⏳ فحص عميل تجاري فعلي عند توفره.

## 5. لوحة الإدارة
تعرض:
- العملاء النشطين.
- MRR الفعال فقط.
- السعة المباعة والاستخدام والمتبقي للحالات الفعالة.
- portfolio utilization.
- 70 / 85 / 95 / 100.
- تكلفة AI الداخلية التقديرية.
- المساهمة التقديرية.
- المستحق خلال 7 أيام والمتأخر.
- أيام متبقية للدفع/التجديد للعميل المحدد.

تم أيضًا:
- ✅ منع error details الخام من Dashboard response.
- ✅ إدارة Support لا تعيد نجاحًا وهميًا عند request id غير موجود أو يخص tenant آخر.

مطلوب:
- ⏳ فحص بصري نهائي.

## 6. إدارة العملاء
تم:
- ✅ اختيار الباقة إلزامي.
- ✅ الهاتف والبريد وبريد الفواتير ومسؤول التواصل والموقع.
- ✅ الشعار.
- ✅ بيانات العقد والمدة والتواريخ والحالة.
- ✅ مربع معلومات شامل.
- ✅ رابط الأسئلة بلا جواب.
- ✅ portal password الجديدة تستخدم scrypt.
- ✅ migration تلقائية للـlegacy plaintext بعد تسجيل دخول صحيح.
- ✅ hard delete محمي.
- ✅ commercial numeric inputs محمية من القيم غير الصالحة.

غير منفذ بعد:
- ⏳ رفع PDF / Word / Excel مباشرة.
- ⏳ ingestion منظم إلى قاعدة معرفة قابلة للمراجعة.
- ⏳ account type رسمي يميز demo/test/commercial بدل الاعتماد على slugs معروفة.

## 7. الأسئلة غير المجابة وقاعدة المعرفة
تم:
- ✅ tenant scoping بالـclient_id في Admin وClient flows.
- ✅ approved answer max = 6000 حرف.
- ✅ Knowledge Admin: question max 1000 / answer max 6000.
- ✅ V13 atomic RPC يجعل تحديث/إضافة Knowledge وحل unanswered في transaction واحدة.
- ✅ اختبار V13 فعليًا ببيانات مؤقتة ثم تنظيفها: resolved=true وإجابة المعرفة صحيحة.
- ✅ RPC V13 executable للـservice_role فقط، وغير متاح لـanon/authenticated.

## 8. التنبيهات والبريد
تم:
- ✅ usage alerts: 70 / 85 / 95 / 100.
- ✅ recipient = `billing_email` ثم fallback إلى `contact_email`.
- ✅ منع تكرار نفس التنبيه في نفس الدورة.
- ✅ تسجيل sent / failed / skipped في `nsr_notification_log`.
- ✅ فشل البريد لا يكسر chat.

مطلوب قبل تفعيل Billing التجاري:
- ⏳ تحويل سجل invoice/subscription emails إلى lifecycle أكثر صرامة `pending -> sent/failed` لتغطية crash بين log insert وResend call.
- ⏳ payment reminders قبل الاستحقاق/يوم الاستحقاق/بعد التأخير تحتاج Stripe billing workflow أو scheduler موثوق.

## 9. Billing / Stripe
جاهز في الكود:
- ✅ Checkout.
- ✅ Customer Portal.
- ✅ Webhook signature/timestamp verification + DB idempotency claim ledger.
- ✅ event الجاري معالجته لا يعاد له 2xx كأنه اكتمل؛ يعاد retryable 503.
- ✅ subscription sync يتحقق من Checkout session قبل الحفظ.
- ✅ invoice.paid / invoice.payment_failed handling.
- ✅ early-cycle restart يتطلب وصول usage cap.
- ✅ early-cycle restart لديه Stripe Idempotency-Key حتمي.
- ✅ early-cycle restart يتطلب أن تكون الحالة المحلية active/trial والحالة في Stripe active/trialing.

بعد إصدار الرخصة:
1. إنشاء حساب Stripe.
2. إنشاء أسعار Essential / Pro / Enterprise.
3. إضافة `STRIPE_SECRET_KEY` و`STRIPE_WEBHOOK_SECRET` و`APP_URL` إلى Vercel.
4. ربط Price IDs.
5. اختبار Checkout في Test Mode.
6. اختبار Customer Portal وتغيير الباقة.
7. اختبار التجديد التلقائي.
8. اختبار فشل الدفع و`past_due`.
9. اختبار webhook idempotency E2E.
10. اختبار وصول الإيصال/الفاتورة فعليًا للبريد.

## 10. العقد
تم:
- ✅ قالب NSR-1 مخصص لكل عميل.
- ✅ الأسعار، الباقة، الحد، البداية، النهاية، المدة.
- ✅ منع إعادة البيع والتحويل لطرف ثالث دون إذن.
- ✅ الملكية الفكرية والاستخدام الممنوع والمسؤوليات والأمن والإيقاف.
- ✅ أماكن توقيع NOVAIRE والعميل.

قبل الاستخدام التجاري:
- ⏳ مراجعة قانونية إماراتية.
- ⏳ اعتماد بيانات الرخصة والاختصاص القضائي.
- ⏳ ربط توقيع إلكتروني موثوق فعليًا.

## 11. الأمن
موجود الآن:
- ✅ الأسرار Server-side في الكود المراجع.
- ✅ Supabase RLS/service-role-only design.
- ✅ anon/authenticated لا يملكان execute على RPCs الحساسة المراجعة.
- ✅ التحقق من slug/client/session.
- ✅ client/admin session HMAC + timing-safe compare + expiry validation.
- ✅ malformed cookie encoding لا يكسر الـAPI.
- ✅ Chat distributed rate limit.
- ✅ Contact distributed rate limit.
- ✅ Support distributed rate limit.
- ✅ Admin login distributed persistent rate limit.
- ✅ Client billing checkout concurrency guard.
- ✅ Security Headers + CSP baseline.
- ✅ `.gitignore` للأسرار والـnode_modules والlogs.
- ✅ SheetJS dependency patched.
- ✅ safe logging واسع.

قبل الإطلاق التجاري الكبير:
- ⏳ WAF / Bot / DDoS protection على مستوى المنصة.
- ⏳ MFA/SSO/RBAC للإدارة عند تعدد المستخدمين.
- ⏳ CSP nonce/hash بدل `unsafe-inline` بعد فصل inline JS/CSS.
- ⏳ monitoring/incident alerts.
- ⏳ backup/PITR verification حسب خطة Supabase.
- ⏳ pentest خارجي.

Supabase Advisor الحالي:
- Security: لا WARN/ERROR؛ INFO فقط `rls_enabled_no_policy` وهو متوقع في نموذج service-role-only الحالي.
- Performance: INFO عن unused indexes؛ لا تحذفها اعتمادًا على بيئة الاختبار الصغيرة فقط.
- مرجع remediation: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## 12. الفحص قبل الدمج
آخر فحص DB أعطى جميعها صفر:
- orphan contact requests / conversations / knowledge / unanswered / usage.
- cross-client contact links.
- cross-client unanswered links.
- invalid usage alert thresholds.
- stale billing claims.
- failed notifications.

عملاء الاختبار المستثنون تجاريًا حاليًا:
- `demo-clinic`
- `first-bike`
- `novaire-test-center`
- `nsr-test-20`

## 13. شرط الدمج إلى main
لا يتم الدمج قبل:
- الفحص البصري النهائي.
- اختبار فشل AI المتكامل على Preview.
- HTTP tenant isolation A→B فعلي على Preview.
- عدم وجود أخطاء تشغيلية.
- موافقة المستخدم الصريحة على الدمج.

Stripe يمكن أن يبقى مؤجلًا فقط إذا بقي الدفع غير مفعّل في الإنتاج حتى يتم اختباره في Test Mode.
