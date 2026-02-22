const CONFIG = {
  geonameid: 293962,
  candleMinutes: 20,
  shacharitDefault: '10:00',
  shacharitMevarchim: '10:30',
  chassidutDefault: '9:00',
  chassidutMevarchim: '8:30',
};

let weekOffset = 0;

const HEBREW_MONTHS = {
  Nisan: 'ניסן',
  Iyyar: 'אייר',
  Sivan: 'סיוון',
  Tamuz: 'תמוז',
  Av: 'אב',
  Elul: 'אלול',
  Tishrei: 'תשרי',
  Cheshvan: 'חשוון',
  Kislev: 'כסלו',
  Tevet: 'טבת',
  "Sh'vat": 'שבט',
  Adar: 'אדר',
  'Adar I': 'אדר א׳',
  'Adar II': 'אדר ב׳',
};

function formatDateParam(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function extractTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function subtractMinutes(isoString, minutes) {
  const date = new Date(isoString);
  date.setMinutes(date.getMinutes() - minutes);
  return date.toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function stripNikkud(str) {
  return str.replace(/[\u0591-\u05C7]/g, '');
}

function formatGregorianRange(fridayIso, saturdayIso) {
  const fri = new Date(fridayIso);
  const sat = new Date(saturdayIso);
  const months = [
    'ינואר',
    'פברואר',
    'מרץ',
    'אפריל',
    'מאי',
    'יוני',
    'יולי',
    'אוגוסט',
    'ספטמבר',
    'אוקטובר',
    'נובמבר',
    'דצמבר',
  ];
  if (fri.getMonth() === sat.getMonth()) {
    return `${fri.getDate()}-${sat.getDate()} ב${months[fri.getMonth()]} ${fri.getFullYear()}`;
  }
  return `${fri.getDate()} ב${months[fri.getMonth()]} - ${sat.getDate()} ב${
    months[sat.getMonth()]
  } ${fri.getFullYear()}`;
}

function showLoading(show) {
  const overlay = document.getElementById('loading-overlay');
  if (show) {
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

function showError(message) {
  const el = document.getElementById('error-msg');
  el.textContent = message;
  el.style.display = 'block';
}

function hideError() {
  document.getElementById('error-msg').style.display = 'none';
}

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function adjustParashaFontSize(el) {
  const len = el.textContent.length;
  if (len <= 7) el.style.fontSize = '1.25em';
  else if (len <= 14) el.style.fontSize = '1.0em';
  else el.style.fontSize = '0.85em';
}

function getTargetFriday() {
  const now = new Date();
  const day = now.getDay();
  let daysUntilFriday = (5 - day + 7) % 7;
  if (day === 6) daysUntilFriday = 6;
  else if (day === 5) daysUntilFriday = 0;
  const friday = new Date(now);
  friday.setDate(friday.getDate() + daysUntilFriday + weekOffset * 7);
  return friday;
}

async function loadShabbatData() {
  showLoading(true);
  hideError();

  try {
    const friday = getTargetFriday();
    const shabbatUrl = `https://www.hebcal.com/shabbat?cfg=json&geonameid=${CONFIG.geonameid}&M=on&b=${CONFIG.candleMinutes}&gy=${friday.getFullYear()}&gm=${friday.getMonth() + 1}&gd=${friday.getDate()}`;
    const shabbatData = await fetchJSON(shabbatUrl);

    let candles = null;
    let havdalah = null;
    let parasha = null;
    let specialShabbat = null;

    for (const item of shabbatData.items) {
      if (item.category === 'candles' && !candles) candles = item;
      if (item.category === 'havdalah' && !havdalah) havdalah = item;
      if (item.category === 'parashat' && !parasha) parasha = item;
      if (item.category === 'holiday' && item.subcat === 'shabbat' && !specialShabbat) specialShabbat = item;
    }

    if (!candles || !havdalah) {
      throw new Error('Could not find candle lighting or havdalah times');
    }

    const fridayDateStr = candles.date.substring(0, 10);
    const saturdayDateStr = havdalah.date.substring(0, 10);

    const zmanim = await fetchJSON(
      `https://www.hebcal.com/zmanim?cfg=json&geonameid=${CONFIG.geonameid}&date=${saturdayDateStr}`,
    );

    const sunsetIso = zmanim.times.sunset;

    const hebrewDateData = await fetchJSON(
      `https://www.hebcal.com/converter?cfg=json&date=${saturdayDateStr}&g2h=1`,
    );

    const nextSaturday = new Date(saturdayDateStr);
    nextSaturday.setDate(nextSaturday.getDate() + 7);
    const nextSatStr = formatDateParam(nextSaturday);

    const nextHebrewDate = await fetchJSON(
      `https://www.hebcal.com/converter?cfg=json&date=${nextSatStr}&g2h=1`,
    );

    const isMevarchim =
      hebrewDateData.hm !== nextHebrewDate.hm && nextHebrewDate.hm !== 'Tishrei' && hebrewDateData.hd < 30;

    // Parasha + special Shabbat name (e.g. תצוה · זכור)
    const parashaEl = document.getElementById('parasha-name');
    if (parasha) {
      const parashaName = parasha.hebrew.replace(/^פרשת\s*/, '');
      if (specialShabbat) {
        const specialName = specialShabbat.hebrew.replace(/^שבת\s*/, '');
        parashaEl.textContent = `${parashaName} · ${specialName}`;
      } else {
        parashaEl.textContent = parashaName;
      }
    } else if (specialShabbat) {
      parashaEl.textContent = specialShabbat.hebrew;
    } else {
      parashaEl.textContent = '—';
    }
    adjustParashaFontSize(parashaEl);

    // Mevarchim indicator
    const mevarchimEl = document.getElementById('mevarchim-line');
    if (isMevarchim) {
      const nextMonthHeb = HEBREW_MONTHS[nextHebrewDate.hm] || nextHebrewDate.hm;
      mevarchimEl.textContent = `שבת מברכים חודש ${nextMonthHeb}`;
      mevarchimEl.style.display = 'block';
    } else {
      mevarchimEl.style.display = 'none';
    }

    // Hebrew date
    document.getElementById('hebrew-date').textContent = stripNikkud(hebrewDateData.hebrew);

    // Gregorian date
    document.getElementById('gregorian-date').textContent = formatGregorianRange(fridayDateStr, saturdayDateStr);

    // Candle lighting & Havdalah
    const candleTime = extractTime(candles.date);
    const havdalahTime = extractTime(havdalah.date);
    document.getElementById('candle-time').textContent = candleTime;
    document.getElementById('havdalah-time').textContent = havdalahTime;

    // Sunset
    const sunsetTime = extractTime(sunsetIso);
    document.getElementById('sunset-time').textContent = sunsetTime;

    // Tzeit Hakochavim - 7.083° below horizon per Alter Rebbe
    const tzeitIso = zmanim.times.tzeit7083deg;
    if (tzeitIso) document.getElementById('tzeit-time').textContent = extractTime(tzeitIso);

    // Sof Zman Kriat Shema
    const shemaIso = zmanim.times.sofZmanShma;
    if (shemaIso) document.getElementById('shema-time').textContent = extractTime(shemaIso);

    // Chatzot
    const chatzotIso = zmanim.times.chatzot;
    if (chatzotIso) document.getElementById('chatzot-time').textContent = extractTime(chatzotIso);

    // Friday Mincha
    const fridayMinchaEl = document.getElementById('friday-mincha');
    if (fridayMinchaEl) fridayMinchaEl.textContent = sunsetTime;

    // Shacharit
    const shacharitTime = isMevarchim ? CONFIG.shacharitMevarchim : CONFIG.shacharitDefault;
    const shacharitTimeEl = document.getElementById('shacharit-time');
    if (shacharitTimeEl) shacharitTimeEl.textContent = shacharitTime;
    const shacharitLabelEl = document.getElementById('shacharit-label');
    if (shacharitLabelEl) {
      if (isMevarchim) {
        shacharitLabelEl.innerHTML =
          'שחרית <span style="font-size:16px;color:#555;">(שבת מברכים)</span>';
      } else {
        shacharitLabelEl.textContent = 'שחרית';
      }
    }

    // Chassidut / Tehillim on Mevarchim
    const chassidutLabelEl = document.getElementById('chassidut-label');
    const chassidutTimeEl = document.getElementById('chassidut-time');
    if (isMevarchim) {
      if (chassidutLabelEl) chassidutLabelEl.textContent = 'אמירת תהילים בציבור';
      if (chassidutTimeEl) chassidutTimeEl.textContent = CONFIG.chassidutMevarchim;
    } else {
      if (chassidutLabelEl) chassidutLabelEl.textContent = 'חסידות';
      if (chassidutTimeEl) chassidutTimeEl.textContent = CONFIG.chassidutDefault;
    }

    // Shabbat Mincha
    const shabbatMinchaEl = document.getElementById('shabbat-mincha');
    if (shabbatMinchaEl) shabbatMinchaEl.textContent = sunsetTime;

    // Arvit Motzei Shabbat
    const motzeiArvitEl = document.getElementById('motzei-arvit');
    if (motzeiArvitEl) motzeiArvitEl.textContent = havdalahTime;
  } catch (error) {
    console.error('Error loading Shabbat data:', error);
    showError('⚠️ שגיאה בטעינת הנתונים. ניתן למלא ידנית ע״י לחיצה על השדות.');

    const parashaFallback = document.getElementById('parasha-name');
    if (parashaFallback) parashaFallback.textContent = '___________';
    const hebrewFallback = document.getElementById('hebrew-date');
    if (hebrewFallback) hebrewFallback.textContent = '___ ב___ תשפ״ו';
    const placeholders = [
      'candle-time',
      'havdalah-time',
      'friday-mincha',
      'shacharit-time',
      'shabbat-mincha',
      'motzei-arvit',
    ];
    placeholders.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '__:__';
    });
  } finally {
    showLoading(false);
    fitPageToA4();
  }
}

function toggleEcoMode(enabled) {
  document.body.classList.toggle('eco-mode', enabled);
}

function updateWeekLabel() {
  const label = document.getElementById('week-label');
  if (weekOffset === 0) label.textContent = 'השבת הקרובה';
  else if (weekOffset === 1) label.textContent = 'בעוד שבוע';
  else if (weekOffset === -1) label.textContent = 'שבת שעברה';
  else if (weekOffset > 1) label.textContent = `בעוד ${weekOffset} שבועות`;
  else label.textContent = `לפני ${Math.abs(weekOffset)} שבועות`;
}

function changeWeek(delta) {
  weekOffset += delta;
  updateWeekLabel();
  loadShabbatData();
}

function measureAndScale(inner, frame, caller) {
  const frameStyle = getComputedStyle(frame);
  const paddingTop = parseFloat(frameStyle.paddingTop);
  const paddingBottom = parseFloat(frameStyle.paddingBottom);
  const availableHeight = frame.clientHeight - paddingTop - paddingBottom;
  const contentHeight = inner.scrollHeight;

  // #region agent log
  fetch('http://127.0.0.1:7282/ingest/30998bba-842a-40e8-934b-5e1b144ef3cd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d9f303'},body:JSON.stringify({sessionId:'d9f303',location:'script.js:measureAndScale',message:'dimensions',data:{caller,frameClientHeight:frame.clientHeight,paddingTop,paddingBottom,availableHeight,contentHeight,innerScrollHeight:inner.scrollHeight,innerOffsetHeight:inner.offsetHeight,frameOffsetHeight:frame.offsetHeight,needsScale:contentHeight>availableHeight,scale:contentHeight>availableHeight?availableHeight/contentHeight:1,innerCurrentHeight:inner.style.height,innerCurrentTransform:inner.style.transform},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  if (contentHeight > availableHeight) {
    const scale = availableHeight / contentHeight;
    inner.style.transform = `scale(${scale})`;
    inner.style.height = contentHeight + 'px';
  } else {
    inner.style.transform = 'none';
    inner.style.height = '100%';
  }

  // #region agent log
  fetch('http://127.0.0.1:7282/ingest/30998bba-842a-40e8-934b-5e1b144ef3cd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d9f303'},body:JSON.stringify({sessionId:'d9f303',location:'script.js:measureAndScale:after',message:'applied',data:{caller,transform:inner.style.transform,height:inner.style.height,footerRect:document.querySelector('.footer')?.getBoundingClientRect(),frameRect:frame.getBoundingClientRect()},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
}

function fitPageToA4() {
  const inner = document.querySelector('.page-frame-inner');
  const frame = document.querySelector('.page-frame');
  if (!inner || !frame) return;

  inner.style.transform = 'none';
  inner.style.height = 'auto';

  const noPrintEls = inner.querySelectorAll('.no-print');
  noPrintEls.forEach((el) => (el.style.display = 'none'));

  requestAnimationFrame(() => {
    measureAndScale(inner, frame, 'fitPageToA4');
    noPrintEls.forEach((el) => (el.style.display = ''));
  });
}

function applyPrintStyles(frame, inner) {
  const saved = [];
  const set = (el, props) => {
    const prev = {};
    for (const [k, v] of Object.entries(props)) { prev[k] = el.style[k]; el.style[k] = v; }
    saved.push(() => { for (const [k] of Object.entries(props)) el.style[k] = prev[k]; });
  };

  set(frame, { height: '297mm', maxHeight: '297mm', padding: '14px 25px' });
  inner.querySelectorAll('.section').forEach(s => set(s, { margin: '4px 28px', padding: '5px 14px' }));
  inner.querySelectorAll('.section-title').forEach(t => set(t, { padding: '6px 44px', marginBottom: '5px' }));
  inner.querySelectorAll('.times-table td').forEach(td => set(td, { padding: '5px 12px' }));
  inner.querySelectorAll('.decorative-line').forEach(d => set(d, { margin: '1px auto' }));
  const footer = inner.querySelector('.footer');
  if (footer) set(footer, { padding: '10px 30px 8px' });

  return () => saved.forEach(fn => fn());
}

function fitPageToA4Print() {
  const inner = document.querySelector('.page-frame-inner');
  const frame = document.querySelector('.page-frame');
  if (!inner || !frame) return;

  inner.style.transform = 'none';
  inner.style.height = 'auto';

  const noPrintEls = inner.querySelectorAll('.no-print');
  noPrintEls.forEach(el => (el.style.display = 'none'));

  const restoreStyles = applyPrintStyles(frame, inner);
  void frame.offsetHeight;

  const availableHeight = frame.clientHeight - 14 - 14;
  const contentHeight = inner.scrollHeight;

  // #region agent log
  fetch('http://127.0.0.1:7282/ingest/30998bba-842a-40e8-934b-5e1b144ef3cd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d9f303'},body:JSON.stringify({sessionId:'d9f303',location:'script.js:fitPageToA4Print',message:'print-dimensions-v2',data:{availableHeight,contentHeight,needsScale:contentHeight>availableHeight,scale:contentHeight>availableHeight?availableHeight/contentHeight:1,runId:'post-fix-v2'},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  if (contentHeight > availableHeight) {
    const scale = availableHeight / contentHeight;
    inner.style.transform = `scale(${scale})`;
    inner.style.height = contentHeight + 'px';
  } else {
    inner.style.transform = 'none';
    inner.style.height = '100%';
  }

  restoreStyles();
  noPrintEls.forEach(el => (el.style.display = ''));
}

window.addEventListener('beforeprint', fitPageToA4Print);
window.addEventListener('afterprint', fitPageToA4);

function createDeleteBtn() {
  const btn = document.createElement('button');
  btn.className = 'row-delete-btn no-print';
  btn.textContent = '×';
  btn.title = 'הסר שורה';
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    const tr = this.closest('tr');
    if (tr) {
      tr.remove();
      fitPageToA4();
    }
  });
  return btn;
}

function addRow(tableEl) {
  const tr = document.createElement('tr');

  const labelTd = document.createElement('td');
  labelTd.className = 'label-cell';
  const labelSpan = document.createElement('span');
  labelSpan.contentEditable = 'true';
  labelSpan.className = 'label-editable';
  labelSpan.textContent = 'שם התפילה';
  labelTd.appendChild(labelSpan);
  labelTd.appendChild(createDeleteBtn());

  const timeTd = document.createElement('td');
  timeTd.className = 'time-cell';
  const timeSpan = document.createElement('span');
  timeSpan.className = 'time-value';
  timeSpan.contentEditable = 'true';
  timeSpan.textContent = '__:__';
  timeTd.appendChild(timeSpan);

  tr.appendChild(labelTd);
  tr.appendChild(timeTd);
  tableEl.appendChild(tr);

  labelSpan.focus();
  fitPageToA4();
}

function attachDeleteButtons() {
  const editableTables = document.querySelectorAll(
    '.section .times-table, .section-shabbat .times-table',
  );
  editableTables.forEach((table) => {
    table.querySelectorAll('tr').forEach((tr) => {
      const labelCell = tr.querySelector('.label-cell');
      if (labelCell && !labelCell.querySelector('.row-delete-btn')) {
        labelCell.appendChild(createDeleteBtn());
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  attachDeleteButtons();
  loadShabbatData();
});
