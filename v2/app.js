document.getElementById('check').addEventListener('click', async () => {
  const output = document.getElementById('status');
  output.textContent = 'جارٍ فحص البيئة…';
  try {
    const response = await fetch('/api/v2/health', { credentials: 'same-origin' });
    const data = await response.json();
    output.textContent = response.ok ? 'البيئة التجريبية متصلة وجاهزة.' : 'يلزم استكمال إعداد متغيرات Preview.';
    output.dataset.health = data.status;
  } catch { output.textContent = 'تعذر الوصول إلى خدمة الفحص.'; }
});
