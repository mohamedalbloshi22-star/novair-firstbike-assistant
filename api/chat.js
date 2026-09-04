<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>First Bike — Al Ain | Motorcycle Rental & Repair</title>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap" rel="stylesheet">

<style>
:root{
  --asphalt:#1A1A1A;
  --asphalt-2:#242424;
  --steel:#3A3A3A;
  --amber:#F2A93B;
  --amber-deep:#D48F24;
  --off-white:#F4F0E6;
  --grey-text:#B8B2A6;
  --line:rgba(244,240,230,0.12);
  --red-tag:#C4432E;
}

*{box-sizing:border-box;}

html,body{
  margin:0;
  padding:0;
}

body{
  font-family:'Tajawal','Tahoma',sans-serif;
  background:var(--asphalt);
  color:var(--off-white);
  min-height:100vh;
}

.site{
  max-width:760px;
  margin:0 auto;
  padding:0 20px 130px;
}

.top-strip{
  background:var(--amber);
  color:var(--asphalt);
  text-align:center;
  font-size:12.5px;
  font-weight:700;
  padding:8px 12px;
}

.language-bar{
  max-width:760px;
  margin:14px auto 0;
  padding:0 20px;
  display:flex;
  justify-content:flex-end;
}

.language-switch{
  display:flex;
  border:1px solid var(--steel);
  border-radius:8px;
  overflow:hidden;
  background:var(--asphalt-2);
}

.lang-btn{
  border:0;
  background:transparent;
  color:var(--grey-text);
  padding:8px 14px;
  cursor:pointer;
  font-family:inherit;
  font-weight:700;
}

.lang-btn.active{
  background:var(--amber);
  color:var(--asphalt);
}

.site-header{
  padding:24px 0 22px;
  border-bottom:2px solid var(--steel);
}

.brand-row{
  display:flex;
  align-items:center;
  gap:12px;
  margin-bottom:14px;
}

.brand-badge{
  width:46px;
  height:46px;
  background:var(--amber);
  border-radius:6px;
  display:flex;
  align-items:center;
  justify-content:center;
  font-weight:900;
  font-size:20px;
  color:var(--asphalt);
  flex:none;
  transform:skewX(-6deg);
}

.site-header h1{
  font-size:30px;
  margin:0;
  font-weight:900;
}

.site-header .tag{
  color:var(--amber);
  font-size:13px;
  font-weight:700;
}

.loc-line{
  margin-top:14px;
  font-size:13.5px;
  color:var(--grey-text);
  line-height:1.9;
}

.loc-line b{
  color:var(--off-white);
}

.rent-table{
  margin-top:32px;
}

.rent-table h2{
  font-size:18px;
  font-weight:700;
  margin-bottom:14px;
  display:flex;
  align-items:center;
  gap:8px;
}

.rent-table h2::before{
  content:"";
  width:4px;
  height:18px;
  background:var(--amber);
  display:inline-block;
  border-radius:2px;
}

.cc-row{
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:13px 14px;
  background:var(--asphalt-2);
  border-radius:8px;
  margin-bottom:8px;
  border:1px solid var(--line);
}

.cc-row .cc{
  font-weight:700;
  font-size:14.5px;
}

.cc-row .price{
  background:var(--red-tag);
  color:var(--off-white);
  padding:5px 12px;
  border-radius:5px;
  font-weight:700;
  font-size:13.5px;
  white-space:nowrap;
}

.other-services{
  margin-top:30px;
  display:flex;
  gap:10px;
  flex-wrap:wrap;
}

.svc-chip{
  background:var(--asphalt-2);
  border:1px solid var(--steel);
  border-radius:20px;
  padding:9px 16px;
  font-size:13px;
  color:var(--off-white);
}

.hours-box{
  margin-top:30px;
  background:var(--asphalt-2);
  border-radius:8px;
  padding:16px 18px;
  font-size:13.5px;
  line-height:2;
  color:var(--grey-text);
  border:1px solid var(--line);
}

.hours-box b{
  color:var(--amber);
}

.launcher{
  position:fixed;
  bottom:20px;
  left:20px;
  background:var(--amber);
  color:var(--asphalt);
  border:none;
  border-radius:8px;
  padding:14px 20px;
  font-size:14px;
  font-weight:700;
  display:flex;
  align-items:center;
  gap:9px;
  cursor:pointer;
  box-shadow:0 10px 26px rgba(0,0,0,0.5);
  font-family:'Tajawal',sans-serif;
  z-index:40;
}

.chat-wrap{
  position:fixed;
  bottom:20px;
  left:20px;
  width:min(360px, calc(100vw - 32px));
  height:min(560px, calc(100vh - 100px));
  background:var(--asphalt-2);
  border-radius:12px;
  box-shadow:0 24px 60px rgba(0,0,0,0.55);
  display:none;
  flex-direction:column;
  overflow:hidden;
  z-index:50;
  border:1px solid var(--steel);
}

.chat-wrap.open{
  display:flex;
}

.chat-head{
  background:var(--asphalt);
  color:var(--off-white);
  padding:15px 16px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  border-bottom:2px solid var(--amber);
}

.chat-head .who{
  display:flex;
  align-items:center;
  gap:10px;
}

.avatar{
  width:34px;
  height:34px;
  border-radius:6px;
  background:var(--amber);
  display:flex;
  align-items:center;
  justify-content:center;
  font-weight:900;
  font-size:15px;
  color:var(--asphalt);
  flex:none;
  transform:skewX(-6deg);
}

.chat-head .name{
  font-size:14px;
  font-weight:700;
}

.chat-head .status{
  font-size:11px;
  color:var(--grey-text);
}

.chat-head button{
  background:none;
  border:none;
  color:var(--off-white);
  font-size:18px;
  cursor:pointer;
  opacity:0.7;
}

.chat-body{
  flex:1;
  overflow-y:auto;
  padding:16px;
  display:flex;
  flex-direction:column;
  gap:10px;
  background:var(--asphalt);
}

.msg{
  max-width:84%;
  padding:10px 13px;
  border-radius:10px;
  font-size:13.5px;
  line-height:1.7;
}

.msg.bot{
  align-self:flex-start;
  background:var(--asphalt-2);
  border:1px solid var(--line);
  color:var(--off-white);
}

.msg.user{
  align-self:flex-end;
  background:var(--amber);
  color:var(--asphalt);
  font-weight:500;
}

.msg.typing{
  align-self:flex-start;
  background:var(--asphalt-2);
  border:1px solid var(--line);
  display:flex;
  gap:4px;
  padding:12px 14px;
}

.msg.typing span{
  width:6px;
  height:6px;
  border-radius:50%;
  background:var(--grey-text);
  animation:blink 1.2s infinite;
}

.msg.typing span:nth-child(2){animation-delay:.2s;}
.msg.typing span:nth-child(3){animation-delay:.4s;}

@keyframes blink{
  0%,80%,100%{opacity:0.25;}
  40%{opacity:1;}
}

.quick-row{
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  padding:0 16px 12px;
  background:var(--asphalt);
}

.quick-btn{
  border:1px solid var(--amber);
  color:var(--amber);
  background:transparent;
  border-radius:16px;
  padding:6px 12px;
  font-size:12px;
  cursor:pointer;
  white-space:nowrap;
  font-family:inherit;
}

.chat-input{
  display:flex;
  gap:8px;
  padding:12px;
  border-top:1px solid var(--line);
  background:var(--asphalt-2);
}

.chat-input input{
  flex:1;
  border:1px solid var(--steel);
  border-radius:8px;
  padding:10px 14px;
  font-size:13.5px;
  outline:none;
  font-family:inherit;
  background:var(--asphalt);
  color:var(--off-white);
}

.chat-input input::placeholder{
  color:var(--grey-text);
}

.chat-input input:focus{
  border-color:var(--amber);
}

.chat-input button{
  background:var(--amber);
  color:var(--asphalt);
  border:none;
  border-radius:8px;
  width:38px;
  height:38px;
  cursor:pointer;
  font-size:15px;
  flex:none;
  font-weight:700;
}

.chat-input button:disabled{
  opacity:0.5;
  cursor:not-allowed;
}

html[dir="ltr"] .language-bar{
  justify-content:flex-start;
}

html[dir="ltr"] .launcher,
html[dir="ltr"] .chat-wrap{
  left:auto;
  right:20px;
}
</style>
</head>

<body>

<div class="top-strip" id="topStrip"></div>

<div class="language-bar">
  <div class="language-switch">
    <button class="lang-btn" id="arBtn">العربية</button>
    <button class="lang-btn" id="enBtn">English</button>
  </div>
</div>

<div class="site">
  <div class="site-header">
    <div class="brand-row">
      <div class="brand-badge">FB</div>
      <div>
        <h1>First Bike</h1>
        <div class="tag" id="tag"></div>
      </div>
    </div>

    <div class="loc-line" id="locationInfo"></div>
  </div>

  <div class="rent-table">
    <h2 id="rentTitle"></h2>

    <div class="cc-row">
      <span class="cc">50 cc</span>
      <span class="price" id="price50"></span>
    </div>

    <div class="cc-row">
      <span class="cc">90 cc</span>
      <span class="price" id="price90"></span>
    </div>

    <div class="cc-row">
      <span class="cc">220 cc</span>
      <span class="price" id="price220"></span>
    </div>

    <div class="cc-row">
      <span class="cc">400 cc</span>
      <span class="price" id="price400"></span>
    </div>

    <div class="cc-row">
      <span class="cc">800 cc+</span>
      <span class="price" id="price800"></span>
    </div>
  </div>

  <div class="other-services">
    <span class="svc-chip" id="serviceRepair"></span>
    <span class="svc-chip" id="serviceParts"></span>
    <span class="svc-chip" id="serviceRental"></span>
  </div>

  <div class="hours-box" id="noteBox"></div>
</div>

<button class="launcher" id="launcher">
  <span>⚡</span>
  <span id="launcherText"></span>
</button>

<div class="chat-wrap" id="chatWrap">
  <div class="chat-head">
    <div class="who">
      <div class="avatar">FB</div>
      <div>
        <div class="name" id="assistantName"></div>
        <div class="status" id="assistantStatus"></div>
      </div>
    </div>

    <button id="closeChat">✕</button>
  </div>

  <div class="chat-body" id="chatBody"></div>

  <div class="quick-row" id="quickRow"></div>

  <div class="chat-input">
    <input type="text" id="userInput">
    <button id="sendBtn">➤</button>
  </div>
</div>

<script>
let history = [];

let language =
  localStorage.getItem('novaire_language') || 'ar';

let sessionId =
  localStorage.getItem('novaire_session_id');

if (!sessionId) {
  sessionId =
    'fb-' +
    Date.now() +
    '-' +
    Math.random().toString(36).slice(2);

  localStorage.setItem(
    'novaire_session_id',
    sessionId
  );
}

const translations = {
  ar: {
    dir: 'rtl',

    topStrip:
      'تجربة NOVAIRE — مساعد ذكي فعلي لمحل First Bike',

    tag:
      'تأجير وتصليح الدراجات النارية',

    location:
      '<b>الموقع:</b> العين، السلامات، شارع الهيبة، بجانب كافيه 1 مليون<br><b>الدوام:</b> يوميًا من 3 العصر حتى 12 منتصف الليل',

    rentTitle:
      'أسعار تأجير الدراجات بالساعة',

    hour:
      'درهم / ساعة',

    serviceRepair:
      '🔧 تصليح دراجات',

    serviceParts:
      '⚙️ قطع غيار أصلية وبديلة',

    serviceRental:
      '🏍️ إيجار من المحل إلى منطقة الرمل القريبة',

    note:
      '<b>ملاحظة:</b> أسعار قطع الغيار والتصليح تختلف حسب نوع القطعة والجودة والتركيب. اسأل المساعد للحصول على التفاصيل.',

    launcher:
      'تحدث مع مساعد المحل',

    assistantName:
      'مساعد First Bike',

    status:
      'متصل الآن',

    placeholder:
      'اكتب سؤالك هنا...',

    welcome:
      'هلا فيك 🏍️ أنا مساعد First Bike. تقدر تسألني عن أسعار الإيجار، التصليح، أو موقع المحل.',

    error:
      'عذرًا، صار خلل بسيط. جرب مرة ثانية.',

    offline:
      'عذرًا، ما قدرت أوصل للخدمة الآن. جرب بعد قليل.',

    quick: [
      {
        label:'سعر إيجار 220 سي سي؟',
        q:'كم سعر إيجار دراجة 220 سي سي؟'
      },
      {
        label:'كم تكلفة التصليح؟',
        q:'عندي عطل بالدراجة، كم تكلفة التصليح؟'
      },
      {
        label:'وينكم بالضبط؟',
        q:'وينكم بالضبط؟'
      }
    ]
  },

  en: {
    dir: 'ltr',

    topStrip:
      'NOVAIRE Demo — Live AI Assistant for First Bike',

    tag:
      'Motorcycle Rental & Repair',

    location:
      '<b>Location:</b> Al Ain, Al Salamat, Al Heeba Street, next to 1 Million Cafe<br><b>Hours:</b> Daily from 3 PM to midnight',

    rentTitle:
      'Hourly Motorcycle Rental Prices',

    hour:
      'AED / hour',

    serviceRepair:
      '🔧 Motorcycle Repair',

    serviceParts:
      '⚙️ Original & Alternative Spare Parts',

    serviceRental:
      '🏍️ Rental from the shop to the nearby sand area',

    note:
      '<b>Note:</b> Repair and spare-part prices vary by part type, quality and installation. Ask the assistant for details.',

    launcher:
      'Chat with First Bike',

    assistantName:
      'First Bike Assistant',

    status:
      'Online now',

    placeholder:
      'Type your question here...',

    welcome:
      'Hi 🏍️ I am the First Bike assistant. Ask me about rental prices, repairs, or our location.',

    error:
      'Sorry, something went wrong. Please try again.',

    offline:
      'Sorry, I cannot reach the service right now. Please try again shortly.',

    quick: [
      {
        label:'220cc rental price?',
        q:'How much is the 220cc motorcycle rental?'
      },
      {
        label:'Repair cost?',
        q:'How much does motorcycle repair cost?'
      },
      {
        label:'Where are you?',
        q:'Where exactly are you located?'
      }
    ]
  }
};

const chatBody =
  document.getElementById('chatBody');

const chatWrap =
  document.getElementById('chatWrap');

const launcher =
  document.getElementById('launcher');

const userInput =
  document.getElementById('userInput');

const sendBtn =
  document.getElementById('sendBtn');

const quickRow =
  document.getElementById('quickRow');

function escapeHtml(str){
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function formatText(text){
  let safe = escapeHtml(text);

  safe = safe.replace(
    /\*\*(.+?)\*\*/g,
    '<strong>$1</strong>'
  );

  safe = safe.replace(
    /\n/g,
    '<br>'
  );

  return safe;
}

function addMsg(text, who){
  const div =
    document.createElement('div');

  div.className =
    'msg ' + who;

  div.innerHTML =
    formatText(text);

  chatBody.appendChild(div);

  chatBody.scrollTop =
    chatBody.scrollHeight;

  return div;
}

function addTyping(){
  const div =
    document.createElement('div');

  div.className =
    'msg typing';

  div.innerHTML =
    '<span></span><span></span><span></span>';

  chatBody.appendChild(div);

  chatBody.scrollTop =
    chatBody.scrollHeight;

  return div;
}

function renderLanguage(){
  const t =
    translations[language];

  document.documentElement.lang =
    language;

  document.documentElement.dir =
    t.dir;

  document.getElementById(
    'topStrip'
  ).textContent =
    t.topStrip;

  document.getElementById(
    'tag'
  ).textContent =
    t.tag;

  document.getElementById(
    'locationInfo'
  ).innerHTML =
    t.location;

  document.getElementById(
    'rentTitle'
  ).textContent =
    t.rentTitle;

  document.getElementById(
    'price50'
  ).textContent =
    '80 ' + t.hour;

  document.getElementById(
    'price90'
  ).textContent =
    '150 ' + t.hour;

  document.getElementById(
    'price220'
  ).textContent =
    '200 ' + t.hour;

  document.getElementById(
    'price400'
  ).textContent =
    '250 ' + t.hour;

  document.getElementById(
    'price800'
  ).textContent =
    '300 ' + t.hour;

  document.getElementById(
    'serviceRepair'
  ).textContent =
    t.serviceRepair;

  document.getElementById(
    'serviceParts'
  ).textContent =
    t.serviceParts;

  document.getElementById(
    'serviceRental'
  ).textContent =
    t.serviceRental;

  document.getElementById(
    'noteBox'
  ).innerHTML =
    t.note;

  document.getElementById(
    'launcherText'
  ).textContent =
    t.launcher;

  document.getElementById(
    'assistantName'
  ).textContent =
    t.assistantName;

  document.getElementById(
    'assistantStatus'
  ).textContent =
    t.status;

  userInput.placeholder =
    t.placeholder;

  document.getElementById(
    'arBtn'
  ).classList.toggle(
    'active',
    language === 'ar'
  );

  document.getElementById(
    'enBtn'
  ).classList.toggle(
    'active',
    language === 'en'
  );

  quickRow.innerHTML = '';

  t.quick.forEach(item => {
    const button =
      document.createElement('button');

    button.className =
      'quick-btn';

    button.textContent =
      item.label;

    button.dataset.q =
      item.q;

    quickRow.appendChild(button);
  });
}

function switchLanguage(newLanguage){
  if (
    newLanguage !== 'ar' &&
    newLanguage !== 'en'
  ) return;

  language =
    newLanguage;

  localStorage.setItem(
    'novaire_language',
    language
  );

  history = [];
  chatBody.innerHTML = '';

  renderLanguage();

  if (
    chatWrap.classList.contains('open')
  ) {
    addMsg(
      translations[language].welcome,
      'bot'
    );
  }
}

async function sendMessage(text){
  if (!text.trim()) return;

  const userText =
    text.trim();

  addMsg(
    userText,
    'user'
  );

  history.push({
    role:'user',
    content:userText
  });

  userInput.value = '';

  sendBtn.disabled = true;

  const typingEl =
    addTyping();

  try{
    const response =
      await fetch(
        '/api/chat',
        {
          method:'POST',

          headers:{
            'Content-Type':
              'application/json'
          },

          body:JSON.stringify({
            messages:history,
            language,
            session_id:sessionId
          })
        }
      );

    const data =
      await response.json();

    typingEl.remove();

    let reply =
      translations[language].error;

    if (
      data &&
      Array.isArray(data.content)
    ) {
      reply =
        data.content
          .map(
            block =>
              block.text || ''
          )
          .join('\n')
          .trim() ||
        reply;
    }

    addMsg(
      reply,
      'bot'
    );

    history.push({
      role:'assistant',
      content:reply
    });

  }catch(error){

    typingEl.remove();

    addMsg(
      translations[language].offline,
      'bot'
    );
  }

  sendBtn.disabled = false;
}

document.getElementById(
  'arBtn'
).addEventListener(
  'click',
  () => switchLanguage('ar')
);

document.getElementById(
  'enBtn'
).addEventListener(
  'click',
  () => switchLanguage('en')
);

launcher.addEventListener(
  'click',
  () => {
    chatWrap.classList.add('open');

    launcher.style.display =
      'none';

    if (
      chatBody.children.length === 0
    ) {
      addMsg(
        translations[language].welcome,
        'bot'
      );
    }
  }
);

document.getElementById(
  'closeChat'
).addEventListener(
  'click',
  () => {
    chatWrap.classList.remove('open');

    launcher.style.display =
      'flex';
  }
);

sendBtn.addEventListener(
  'click',
  () =>
    sendMessage(
      userInput.value
    )
);

userInput.addEventListener(
  'keydown',
  event => {
    if (
      event.key === 'Enter'
    ) {
      sendMessage(
        userInput.value
      );
    }
  }
);

quickRow.addEventListener(
  'click',
  event => {
    const button =
      event.target.closest(
        '.quick-btn'
      );

    if (button) {
      sendMessage(
        button.dataset.q
      );
    }
  }
);

renderLanguage();
</script>

</body>
</html>
