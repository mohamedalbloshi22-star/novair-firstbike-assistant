<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NOVAIRE Dashboard — First Bike</title>

  <style>
    :root{
      --bg:#171717;
      --card:#232323;
      --line:#3a3a3a;
      --gold:#f2a93b;
      --text:#f5f1e8;
      --muted:#b9b2a7;
    }

    *{box-sizing:border-box}

    body{
      margin:0;
      background:var(--bg);
      color:var(--text);
      font-family:Arial,Tahoma,sans-serif;
    }

    .container{
      width:min(1100px,calc(100% - 32px));
      margin:auto;
      padding:32px 0 50px;
    }

    .header{
      margin-bottom:28px;
    }

    .header h1{
      margin:0;
      font-size:30px;
    }

    .header p{
      color:var(--muted);
      margin-top:8px;
    }

    .grid{
      display:grid;
      grid-template-columns:repeat(3,1fr);
      gap:16px;
    }

    .card{
      background:var(--card);
      border:1px solid var(--line);
      border-radius:12px;
      padding:20px;
    }

    .label{
      color:var(--muted);
      font-size:14px;
      margin-bottom:12px;
    }

    .value{
      font-size:34px;
      font-weight:bold;
      color:var(--gold);
    }

    .small{
      font-size:14px;
      color:var(--muted);
      margin-top:6px;
    }

    .section-title{
      margin-top:34px;
      margin-bottom:14px;
      font-size:20px;
    }

    .table-wrap{
      overflow-x:auto;
      background:var(--card);
      border:1px solid var(--line);
      border-radius:12px;
    }

    table{
      width:100%;
      border-collapse:collapse;
      min-width:700px;
    }

    th,td{
      padding:13px 12px;
      border-bottom:1px solid var(--line);
      text-align:center;
      font-size:13px;
    }

    th{
      color:var(--gold);
      background:#1d1d1d;
    }

    tr:last-child td{
      border-bottom:none;
    }

    .status{
      margin-top:25px;
      padding:14px;
      background:var(--card);
      border:1px solid var(--line);
      border-radius:10px;
      color:var(--muted);
    }

    .error{
      color:#ff8170;
    }

    @media(max-width:800px){
      .grid{
        grid-template-columns:1fr 1fr;
      }
    }

    @media(max-width:500px){
      .grid{
        grid-template-columns:1fr;
      }
    }
  </style>
</head>

<body>

<main class="container">

  <div class="header">
    <h1>NOVAIRE Smart Response</h1>
    <p>First Bike — لوحة الإحصائيات</p>
  </div>

  <div class="grid">

    <div class="card">
      <div class="label">إجمالي المحادثات</div>
      <div class="value" id="totalConversations">-</div>
    </div>

    <div class="card">
      <div class="label">إجمالي الرسائل</div>
      <div class="value" id="totalMessages">-</div>
    </div>

    <div class="card">
      <div class="label">إجمالي طلبات التواصل</div>
      <div class="value" id="totalContactRequests">-</div>
    </div>

    <div class="card">
      <div class="label">طلبات الاتصال</div>
      <div class="value" id="callbackRequests">-</div>
      <div class="small" id="callbackRate">-</div>
    </div>

    <div class="card">
      <div class="label">التحدث مع مسؤول</div>
      <div class="value" id="handoffRequests">-</div>
      <div class="small" id="handoffRate">-</div>
    </div>

  </div>

  <div class="section-title">
    الإحصائيات اليومية
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>التاريخ</th>
          <th>المحادثات</th>
          <th>الرسائل</th>
          <th>طلبات الاتصال</th>
          <th>التحويل لمسؤول</th>
        </tr>
      </thead>

      <tbody id="dailyTable">
        <tr>
          <td colspan="5">جاري تحميل البيانات...</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="status" id="status">
    جاري تحميل البيانات...
  </div>

</main>

<script>
async function loadDashboard(){

  const status =
    document.getElementById("status");

  const dailyTable =
    document.getElementById("dailyTable");

  try{

    const response =
      await fetch("/api/dashboard");

    if(!response.ok){
      throw new Error("Dashboard API failed");
    }

    const data =
      await response.json();

    const summary =
      data.summary || {};

    const daily =
      Array.isArray(data.daily)
        ? data.daily
        : [];

    document.getElementById("totalConversations").textContent =
      summary.total_conversations ?? 0;

    document.getElementById("totalMessages").textContent =
      summary.total_messages ?? 0;

    document.getElementById("totalContactRequests").textContent =
      summary.total_contact_requests ?? 0;

    document.getElementById("callbackRequests").textContent =
      summary.callback_requests ?? 0;

    document.getElementById("handoffRequests").textContent =
      summary.human_handoff_requests ?? 0;

    document.getElementById("callbackRate").textContent =
      "نسبة المحادثات التي طلبت اتصال: " +
      (summary.callback_rate_percent ?? 0) +
      "%";

    document.getElementById("handoffRate").textContent =
      "نسبة المحادثات المحولة لمسؤول: " +
      (summary.human_handoff_rate_percent ?? 0) +
      "%";

    dailyTable.innerHTML = "";

    if(daily.length === 0){

      dailyTable.innerHTML = `
        <tr>
          <td colspan="5">
            لا توجد بيانات يومية حتى الآن
          </td>
        </tr>
      `;

    }else{

      daily.forEach(row=>{

        const tr =
          document.createElement("tr");

        tr.innerHTML = `
          <td>${row.day ?? "-"}</td>
          <td>${row.conversations ?? 0}</td>
          <td>${row.messages ?? 0}</td>
          <td>${row.callback_conversations ?? 0}</td>
          <td>${row.human_handoff_conversations ?? 0}</td>
        `;

        dailyTable.appendChild(tr);
      });
    }

    status.textContent =
      "تم تحديث البيانات بنجاح";

  }catch(error){

    status.textContent =
      "تعذر تحميل بيانات لوحة الإحصائيات";

    status.classList.add("error");

    dailyTable.innerHTML = `
      <tr>
        <td colspan="5">
          تعذر تحميل البيانات
        </td>
      </tr>
    `;
  }
}

loadDashboard();
</script>

</body>
</html>
