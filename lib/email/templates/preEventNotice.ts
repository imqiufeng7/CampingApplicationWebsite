// 行前通知 (pre-event notice) — sent to 正取 registrations whose payment is settled
// (已完成 or 無需繳費). This email doubles as the 報到通知書 people show at check-in.
// Two variants: 自搭帳 (bring your own tent — earlier check-in, vehicle unloading, and
// a licence plate to reply with) and 主辦搭設帳 (tent set up by the organizer).

export interface PreEventNoticeInput {
  selfPitch: boolean;
  leaderName: string;
  sessionName: string;
  location: string;
  dateStart: string; // YYYY-MM-DD
  dateEnd: string; // YYYY-MM-DD
  tentNo: string;
  memberCount: number;
  // registrations.sleeping_bag_own_qty / sleeping_bag_rent_qty (rent = 機關提供)
  sleepingBagOwn: number;
  sleepingBagProvided: number;
  // registrations.comfort_bed_needed === "需要"
  comfortBedRequested: boolean;
  officeContact: string;
  // event_sessions.unload_entrance — where 自搭帳 vehicles unload (e.g. 大成路一段)
  unloadEntrance: string | null;
  replyUrl: string;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function parts(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  // Noon UTC so the weekday can't drift across a date line.
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
  return { rocYear: y - 1911, m, d, weekday };
}

// 115年10月17日（六）至10月18日（日）
export function formatSessionDateRange(dateStart: string, dateEnd: string): string {
  const s = parts(dateStart);
  const e = parts(dateEnd);
  const start = `${s.rocYear}年${s.m}月${s.d}日（${s.weekday}）`;
  if (dateStart === dateEnd) return start;
  return `${start}至${e.m}月${e.d}日（${e.weekday}）`;
}

// 10月17日（星期六）
function formatDayWithWeekday(isoDate: string): string {
  const p = parts(isoDate);
  return `${p.m}月${p.d}日（星期${p.weekday}）`;
}

// group_zone "A" + group_number "2" → "A02"
export function formatTentNo(zone: string | null, number: string | null): string {
  if (!zone || !number) return "";
  const n = number.trim();
  return `${zone.trim()}${/^\d+$/.test(n) ? n.padStart(2, "0") : n}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const P = "margin:0 0 12px 0;font-size:15px;line-height:1.8;color:#1a1a1a;";
const TH =
  "padding:10px 14px;border:1px solid #d9d3c4;background-color:#faf8f3;font-size:14px;color:#5c574c;text-align:left;white-space:nowrap;width:30%;";
const TD = "padding:10px 14px;border:1px solid #d9d3c4;font-size:15px;color:#1a1a1a;font-weight:600;";
const LI = "margin:0 0 6px 0;font-size:14px;line-height:1.7;color:#1a1a1a;";

export function preEventNoticeSubject(input: Pick<PreEventNoticeInput, "sessionName">): string {
  return `【行前通知／報到通知書】彰化縣115年災民夜宿體驗活動（${input.sessionName}）`;
}

export function buildPreEventNoticeBody(input: PreEventNoticeInput): string {
  const name = escapeHtml(input.leaderName);
  const tentNo = escapeHtml(input.tentNo || "（尚未安排）");
  const checkInTime = input.selfPitch ? "下午4時至4時30分" : "下午4時30分至5時";

  const rows: [string, string][] = [
    ["主要報名者", name],
    ["帳篷編號", tentNo],
    ["參加人數", `${input.memberCount}人`],
    ["睡袋(墊)", `自備 ${input.sleepingBagOwn} 份／機關提供 ${input.sleepingBagProvided} 份`],
    ["福慧床借用", input.comfortBedRequested ? "已申請借用" : "未申請"],
  ];
  // Red, like the original template's 「(請回填)」.
  if (input.selfPitch)
    rows.push(["車牌號碼", `<span style="color:#d00000;">(請點選下方「回覆確認」按鈕回填)</span>`]);

  const table = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:4px 0 16px 0;">
${rows.map(([k, v]) => `<tr><td style="${TH}">${k}</td><td style="${TD}">${v}</td></tr>`).join("\n")}
</table>`;

  // Bold / underline below mirrors the vendor's 行前通知（範本）.docx emphasis.
  const selfPitchVehicle = input.selfPitch
    ? `<p style="${P}"><strong>★</strong>為確保場地秩序與安全，自搭帳車輛僅限於報到時間於活動入口處${
        input.unloadEntrance ? `(${escapeHtml(input.unloadEntrance)})` : ""
      }卸下帳篷裝備，卸貨完成後請將車輛駛離，停放至鄰近周邊之停車格或停車場。</p>`
    : "";
  // 主辦搭設帳 has to clear out earlier so the organizer can take its tents down.
  const checkOutTime = input.selfPitch ? "上午10時前" : "上午8時";
  const selfPitchPosition = input.selfPitch
    ? `<p style="${P}">搭設位置：由承辦單位規劃，提供約4米×4米場地，請依規定之進退場時間完成搭帳作業。</p>`
    : "";

  const gearReminder = [
    input.sleepingBagOwn > 0 ? `自備睡袋(墊) ${input.sleepingBagOwn} 份，請記得自行攜帶` : null,
    input.sleepingBagProvided > 0 ? `機關提供睡袋(墊) ${input.sleepingBagProvided} 份` : null,
    input.comfortBedRequested ? "已申請借用福慧床" : null,
  ].filter(Boolean);
  const gearNote =
    gearReminder.length > 0
      ? `<p style="${P}"><strong>★物資提醒：本帳${gearReminder.join("；")}。${
          input.sleepingBagProvided > 0 || input.comfortBedRequested ? "借用物資請於報到時攜帶證件抵押領取。" : ""
        }</strong></p>`
      : "";

  const replyAsk = input.selfPitch
    ? "★為確認您的報名資格，收到本通知後，請點選下方「回覆確認」按鈕確認出席，並填寫車牌號碼，以利公所安排。"
    : "★為確認您的報名資格，收到本通知後，請點選下方「回覆確認」按鈕確認出席。";

  const BU = "font-weight:700;text-decoration:underline;";
  const parking = input.selfPitch
    ? "參加活動請盡量搭乘大眾交通工具，本活動<strong>不提供停車</strong>服務（自搭帳車輛卸貨完成後亦須駛離場地）。"
    : "參加活動請盡量搭乘大眾交通工具，本活動<strong>不提供停車</strong>服務。";

  const notes = [
    "報到時請出示<strong>主要報名者「身分證」或本封 E-MAIL 報到通知書進行報到</strong>。",
    `模擬災民收容餐食：體驗現代防災食品(香積飯)及行動救援餐車協力供餐，請<span style="${BU}">自備餐具、碗(建議含蓋)</span>。`,
    `模擬基礎設施損毀：請配合活動期間<span style="${BU}">部分時段模擬停電、停水及通訊中斷</span>，並至指定闖關站完成任務。`,
    "登記借用相關物資參加者，請該帳攜帶證件抵押領取，並於活動結束歸還時發還證件。",
    "活動期間請勿攜帶任何貴重物品，攜帶者須自行妥善保管。",
    "活動提供簡易淋浴設備，請自行斟酌使用。響應環保，請依自行需求準備防蚊液、個人藥品、手持電風扇、清潔用品(溼紙巾、拖鞋、牙膏、牙刷、沐浴乳和洗髮乳等)。",
    parking,
    `因故無法參與者，請務必於活動前電洽${escapeHtml(input.officeContact)}。`,
  ];

  return `<p style="${P}">${name} 您好：</p>
<p style="${P}">歡迎您於${formatSessionDateRange(input.dateStart, input.dateEnd)}參加彰化縣115年災民夜宿體驗活動（${escapeHtml(input.sessionName)}）。</p>
<p style="${P}">活動地點：${escapeHtml(input.location)}。</p>
<p style="${P}">報到時間：${formatDayWithWeekday(input.dateStart)}${checkInTime}。</p>
${selfPitchVehicle}
<p style="${P}">退場時間：${formatDayWithWeekday(input.dateEnd)}${checkOutTime}。</p>
${selfPitchPosition}
${table}
${gearNote}
<p style="${P}"><strong>${replyAsk}</strong></p>
<p style="${P}"><strong>★活動注意事項、流程及各式公告可至「彰化縣防災資訊網－防災教育日系列活動專區」查詢（網址：<a href="https://changhuadp.com/" style="color:#0000ff;text-decoration:underline;">https://changhuadp.com/</a>）。</strong></p>
<p style="${P}margin-bottom:8px;"><strong>★為使民眾參與沉浸式避難收容安置體驗，相關規劃請配合辦理：</strong></p>
<ol style="margin:0 0 12px 0;padding-left:22px;">
${notes.map((n) => `<li style="${LI}">${n}</li>`).join("\n")}
</ol>`;
}
