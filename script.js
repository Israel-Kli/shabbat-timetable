const CONFIG = {
  geonameid: 293962,
  candleMinutes: 20,
  shacharitDefault: '10:00',
  shacharitMevarchim: '10:30',
  chassidutDefault: '9:00',
  chassidutMevarchim: '8:30',
  yizkorTime: '12:00',
};

let events = [];
let eventIndex = 0;
let defaultEventIndexAtLoad = 0;
let isSavingImage = false;

function isKiddushLevanaHebrewDay(hd) {
  return typeof hd === 'number' && hd >= 8 && hd <= 14;
}

function setKiddushLevanaRowVisible(visible) {
  const row = document.getElementById('kiddush-levana-row');
  if (row) row.style.display = visible ? 'table-row' : 'none';
}

function setYizkorRowVisible(visible, timeText) {
  const row = document.getElementById('yizkor-row');
  const timeEl = document.getElementById('yizkor-time');
  if (row) row.style.display = visible ? 'table-row' : 'none';
  if (visible && timeEl != null && timeText != null) timeEl.textContent = timeText;
}

function isDuringPesach(hm, hd, isIsrael) {
  if (hm !== 'Nisan' || typeof hd !== 'number') return false;
  const lastDay = isIsrael ? 21 : 22;
  return hd >= 15 && hd <= lastDay;
}

function setHitvaadutRowVisible(visible) {
  const row = document.getElementById('hitvaadut-row');
  if (row) row.style.display = visible ? 'table-row' : 'none';
}

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

function addDaysStr(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return formatDateParam(d);
}

function applyShabbatTitles() {
  const tf = document.getElementById('title-fixed');
  if (tf) tf.textContent = 'זמני תפילות לשבת ';
  const erev = document.getElementById('section-erev-title');
  if (erev) erev.textContent = 'ערב שבת';
  const day = document.getElementById('section-day-title');
  if (day) day.textContent = 'שבת';
  const motzei = document.getElementById('motzei-label');
  if (motzei) motzei.textContent = 'ערבית מוצאי שבת';
  const havZman = document.getElementById('havdalah-zman-label');
  if (havZman) havZman.textContent = 'צאת שבת';
}

function applyYomTovTitles() {
  const tf = document.getElementById('title-fixed');
  if (tf) tf.textContent = 'זמני תפילות ליום טוב · ';
  const erev = document.getElementById('section-erev-title');
  if (erev) erev.textContent = 'ערב חג';
  const day = document.getElementById('section-day-title');
  if (day) day.textContent = 'יום טוב';
  const motzei = document.getElementById('motzei-label');
  if (motzei) motzei.textContent = 'ערבית מוצאי יום טוב';
  const havZman = document.getElementById('havdalah-zman-label');
  if (havZman) havZman.textContent = 'סיום יום טוב';
}

async function buildEventsList() {
  const start = new Date();
  start.setDate(start.getDate() - 21);
  const end = new Date();
  end.setFullYear(end.getFullYear() + 1);
  const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&start=${formatDateParam(start)}&end=${formatDateParam(end)}&geonameid=${CONFIG.geonameid}&maj=on&M=on&c=on&b=${CONFIG.candleMinutes}&i=on`;
  const cal = await fetchJSON(url);
  const items = cal.items || [];
  const isIsrael = cal.location ? cal.location.cc === 'IL' : true;

  const yomtovEvents = [];
  for (const h of items) {
    if (h.category !== 'holiday' || h.subcat !== 'major' || !h.yomtov) continue;
    const dStr = h.date.substring(0, 10);
    const d = new Date(`${dStr}T12:00:00`);
    if (d.getDay() === 6) continue;
    yomtovEvents.push({
      type: 'yomtov',
      date: dStr,
      hebrew: h.hebrew,
      title: h.title,
      sortKey: dStr,
      yizkor: isYizkorChabad(h.title, h.hebrew, isIsrael),
    });
  }

  const fridays = [];
  const fd = new Date(start);
  while (fd.getDay() !== 5) fd.setDate(fd.getDate() + 1);
  const endCap = new Date(`${formatDateParam(end)}T23:59:59`);
  while (fd <= endCap) {
    fridays.push(formatDateParam(fd));
    fd.setDate(fd.getDate() + 7);
  }
  const yomTovDateSet = new Set(yomtovEvents.map((e) => e.date));
  const shabbatEvents = fridays
    .filter((friday) => !yomTovDateSet.has(friday))
    .map((friday) => ({
      type: 'shabbat',
      friday,
      sortKey: friday,
    }));

  const merged = [...shabbatEvents, ...yomtovEvents];
  merged.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return merged;
}

function findDefaultEventIndex(list) {
  if (!list.length) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatDateParam(today);
  for (let i = 0; i < list.length; i++) {
    if (list[i].sortKey >= todayStr) return i;
  }
  return list.length - 1;
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

function stripNikkud(str) {
  return str.replace(/[\u0591-\u05C7]/g, '');
}

function pesachYomTovDisplayName(hebrew, title) {
  const titleTrim = (title || '').trim();
  const h = stripNikkud(hebrew || '');
  if (/^pesach\s+i$/i.test(titleTrim) || h.includes('פסח א')) {
    return 'ראשון של פסח';
  }
  if (/^pesach\s+vii$/i.test(titleTrim) || h.includes('פסח ז')) {
    return 'שביעי של פסח';
  }
  return null;
}

function isYizkorChabad(title, hebrew, isIsrael) {
  const t = (title || '').trim();
  if (/^erev\b/i.test(t)) return false;
  if (/^yom kippur$/i.test(t)) return true;
  if (/^shmini atzeret$/i.test(t)) return true;
  const h = stripNikkud(hebrew || '');
  if (isIsrael) {
    if (/^pesach vii$/i.test(t) || /פסח\s*ז/.test(h)) return true;
    if (/^shavuot$/i.test(t) || (h.includes('שבועות') && !h.includes('ערב'))) return true;
    return false;
  }
  if (/^pesach viii$/i.test(t) || /פסח\s*ח/.test(h)) return true;
  if (/^shavuot ii$/i.test(t) || /^shavuot 2$/i.test(t) || /שבועות\s*ב/.test(h) || /שבועות ב/.test(hebrew || '')) {
    return true;
  }
  return false;
}

function yizkorSuffixIfNeeded(hasYizkor) {
  return hasYizkor ? ' · יזכור' : '';
}

const GREGORIAN_MONTHS_HE = [
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

function formatGregorianRange(fridayIso, saturdayIso) {
  const fri = new Date(fridayIso);
  const sat = new Date(saturdayIso);
  const months = GREGORIAN_MONTHS_HE;
  if (fri.getMonth() === sat.getMonth()) {
    return `${fri.getDate()}-${sat.getDate()} ב${months[fri.getMonth()]} ${fri.getFullYear()}`;
  }
  return `${fri.getDate()} ב${months[fri.getMonth()]} - ${sat.getDate()} ב${
    months[sat.getMonth()]
  } ${fri.getFullYear()}`;
}

function formatSingleGregorian(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return `${d.getDate()} ב${GREGORIAN_MONTHS_HE[d.getMonth()]} ${d.getFullYear()}`;
}

function getEventOptionLabel(ev) {
  if (ev.type === 'yomtov') {
    const name = (ev.hebrew || ev.title || 'יום טוב').replace(/\s+/g, ' ').trim();
    return `${name}${yizkorSuffixIfNeeded(ev.yizkor)} · ${formatSingleGregorian(ev.date)}`;
  }
  const sat = addDaysStr(ev.friday, 1);
  return `שבת · ${formatGregorianRange(`${ev.friday}T12:00:00`, `${sat}T12:00:00`)}`;
}

function populateEventSelect() {
  const sel = document.getElementById('event-select');
  if (!sel) return;
  sel.innerHTML = '';
  if (!events.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'אין רשימת אירועים';
    opt.disabled = true;
    opt.selected = true;
    sel.appendChild(opt);
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  events.forEach((ev, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = getEventOptionLabel(ev);
    sel.appendChild(opt);
  });
  sel.value = String(Math.min(eventIndex, events.length - 1));
}

function selectEventFromDropdown() {
  const sel = document.getElementById('event-select');
  if (!sel || sel.disabled || !events.length) return;
  const idx = parseInt(sel.value, 10);
  if (Number.isNaN(idx) || idx < 0 || idx >= events.length) return;
  if (idx === eventIndex) return;
  eventIndex = idx;
  loadEventData();
}

function showLoading(show) {
  const overlay = document.getElementById('loading-overlay');
  if (show) {
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

function setLoadingText(text) {
  const spinnerText = document.querySelector('#loading-overlay .spinner-text');
  if (spinnerText) spinnerText.textContent = text;
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
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

function adjustMainTitleForContent(parashaEl) {
  const mainTitle = document.querySelector('.main-title');
  const titleFixed = document.getElementById('title-fixed');
  if (!mainTitle || !parashaEl) return;

  const fixed = titleFixed?.textContent ?? '';
  const parasha = parashaEl.textContent ?? '';
  const totalLen = fixed.length + parasha.length;

  mainTitle.classList.remove('main-title--tight', 'main-title--compact', 'main-title--mini');
  if (totalLen > 58) mainTitle.classList.add('main-title--mini');
  else if (totalLen > 44) mainTitle.classList.add('main-title--compact');
  else if (totalLen > 32) mainTitle.classList.add('main-title--tight');

  const len = parasha.length;
  if (len <= 7) parashaEl.style.fontSize = '1.25em';
  else if (len <= 14) parashaEl.style.fontSize = '1.0em';
  else parashaEl.style.fontSize = '0.85em';
}

function getTargetFriday() {
  const now = new Date();
  const day = now.getDay();
  let daysUntilFriday = (5 - day + 7) % 7;
  if (day === 6) daysUntilFriday = 6;
  else if (day === 5) daysUntilFriday = 0;
  const friday = new Date(now);
  friday.setDate(friday.getDate() + daysUntilFriday);
  return friday;
}

function pickSaturdayHolidayHebrew(items, saturdayDateStr) {
  const sat = items.filter(
    (it) =>
      it.category === 'holiday'
      && typeof it.date === 'string'
      && it.date.substring(0, 10) === saturdayDateStr,
  );
  if (sat.length === 0) return null;
  const order = { shabbat: 0, major: 1, fast: 2, modern: 3 };
  sat.sort((a, b) => (order[a.subcat] ?? 9) - (order[b.subcat] ?? 9));
  return sat[0].hebrew || null;
}

function titleSuffixForHolidayHebrew(holidayHebrew) {
  if (!holidayHebrew) return holidayHebrew;
  const pesachName = pesachYomTovDisplayName(holidayHebrew, '');
  const isCholHamoed =
    holidayHebrew.includes('חוה״מ') || /\([^)]*חוה/.test(holidayHebrew);
  if (!isCholHamoed) return pesachName || holidayHebrew;
  if (holidayHebrew.includes('סוכות')) return 'חול המועד סוכות';
  if (holidayHebrew.includes('פסח')) return 'חול המועד פסח';
  return holidayHebrew;
}

async function loadShabbatEventFallback() {
  const friday = getTargetFriday();
  await loadShabbatEvent({
    type: 'shabbat',
    friday: formatDateParam(friday),
    sortKey: formatDateParam(friday),
  });
}

async function loadYomTovData(event) {
  showLoading(true);
  hideError();

  try {
    applyYomTovTitles();
    const holidayDateStr = event.date;
    const rangeStart = addDaysStr(holidayDateStr, -5);
    const rangeEnd = addDaysStr(holidayDateStr, 2);
    const calUrl = `https://www.hebcal.com/hebcal?v=1&cfg=json&start=${rangeStart}&end=${rangeEnd}&geonameid=${CONFIG.geonameid}&maj=on&M=on&c=on&b=${CONFIG.candleMinutes}&i=on`;
    const cal = await fetchJSON(calUrl);
    const items = cal.items || [];

    const holidayItem = items.find(
      (it) =>
        it.category === 'holiday'
        && it.date?.substring(0, 10) === holidayDateStr
        && it.yomtov === true,
    );
    if (!holidayItem) throw new Error('Holiday not found');

    const erevStr = addDaysStr(holidayDateStr, -1);
    let candles = items.find(
      (it) => it.category === 'candles' && it.date.substring(0, 10) === erevStr,
    );
    if (!candles) {
      candles = items.find(
        (it) => it.category === 'candles' && it.date.substring(0, 10) === holidayDateStr,
      );
    }
    let yomTovEnd = items.find(
      (it) => it.category === 'havdalah' && it.date.substring(0, 10) === holidayDateStr,
    );
    if (!yomTovEnd) {
      yomTovEnd = items.find(
        (it) => it.category === 'candles' && it.date.substring(0, 10) === holidayDateStr,
      );
    }

    if (!candles || !yomTovEnd) {
      throw new Error('Could not find candle lighting or end time for holiday');
    }

    const erevDateStr = candles.date.substring(0, 10);

    const dayAfterYomTov = addDaysStr(holidayDateStr, 1);
    const [zmanimYom, zmanimErev, hebrewDateData, motzeiHebrew] = await Promise.all([
      fetchJSON(`https://www.hebcal.com/zmanim?cfg=json&geonameid=${CONFIG.geonameid}&date=${holidayDateStr}`),
      fetchJSON(`https://www.hebcal.com/zmanim?cfg=json&geonameid=${CONFIG.geonameid}&date=${erevDateStr}`),
      fetchJSON(`https://www.hebcal.com/converter?cfg=json&date=${holidayDateStr}&g2h=1`),
      fetchJSON(`https://www.hebcal.com/converter?cfg=json&date=${dayAfterYomTov}&g2h=1`),
    ]);

    setKiddushLevanaRowVisible(isKiddushLevanaHebrewDay(motzeiHebrew?.hd));

    const parashaEl = document.getElementById('parasha-name');
    const isIsrael = cal.location ? cal.location.cc === 'IL' : true;
    const baseName =
      pesachYomTovDisplayName(holidayItem.hebrew, holidayItem.title) || stripNikkud(holidayItem.hebrew);
    parashaEl.textContent = baseName + yizkorSuffixIfNeeded(isYizkorChabad(holidayItem.title, holidayItem.hebrew, isIsrael));
    adjustMainTitleForContent(parashaEl);

    document.getElementById('mevarchim-line').style.display = 'none';
    document.getElementById('molad-section').style.display = 'none';

    document.getElementById('hebrew-date').textContent = stripNikkud(hebrewDateData.hebrew).replace(
      /\sב(?=[א-ת])/u,
      ' ',
    );

    document.getElementById('gregorian-date').textContent = formatGregorianRange(erevDateStr, holidayDateStr);

    document.getElementById('candle-time').textContent = extractTime(candles.date);
    document.getElementById('havdalah-time').textContent = extractTime(yomTovEnd.date);

    const sunsetIso = zmanimYom.times.sunset;
    document.getElementById('sunset-time').textContent = extractTime(sunsetIso);

    const tzeitIso = zmanimYom.times.tzeit7083deg;
    if (tzeitIso) document.getElementById('tzeit-time').textContent = extractTime(tzeitIso);

    const shemaIso = zmanimYom.times.sofZmanShma;
    if (shemaIso) document.getElementById('shema-time').textContent = extractTime(shemaIso);

    const chatzotIso = zmanimYom.times.chatzot;
    if (chatzotIso) document.getElementById('chatzot-time').textContent = extractTime(chatzotIso);

    const erevSunset = zmanimErev.times.sunset;
    const fridayMinchaEl = document.getElementById('friday-mincha');
    if (fridayMinchaEl && erevSunset) fridayMinchaEl.textContent = extractTime(erevSunset);

    const shacharitTimeEl = document.getElementById('shacharit-time');
    if (shacharitTimeEl) shacharitTimeEl.textContent = CONFIG.shacharitDefault;
    const shacharitLabelEl = document.getElementById('shacharit-label');
    if (shacharitLabelEl) shacharitLabelEl.textContent = 'שחרית';

    const hasYizkor = isYizkorChabad(holidayItem.title, holidayItem.hebrew, isIsrael);
    setYizkorRowVisible(hasYizkor, CONFIG.yizkorTime);
    setHitvaadutRowVisible(!isDuringPesach(hebrewDateData.hm, hebrewDateData.hd, isIsrael));

    const chassidutLabelEl = document.getElementById('chassidut-label');
    const chassidutTimeEl = document.getElementById('chassidut-time');
    if (chassidutLabelEl) chassidutLabelEl.textContent = 'חסידות';
    if (chassidutTimeEl) chassidutTimeEl.textContent = CONFIG.chassidutDefault;

    const shabbatMinchaEl = document.getElementById('shabbat-mincha');
    if (shabbatMinchaEl && sunsetIso) {
      const sunsetDate = new Date(sunsetIso);
      sunsetDate.setMinutes(sunsetDate.getMinutes() - 10);
      shabbatMinchaEl.textContent = sunsetDate.toLocaleTimeString('he-IL', {
        timeZone: 'Asia/Jerusalem',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }

    const motzeiArvitEl = document.getElementById('motzei-arvit');
    if (motzeiArvitEl) motzeiArvitEl.textContent = extractTime(yomTovEnd.date);
  } catch (error) {
    console.error('Error loading Yom Tov data:', error);
    showError('⚠️ שגיאה בטעינת הנתונים. ניתן למלא ידנית ע״י לחיצה על השדות.');
    setKiddushLevanaRowVisible(false);
    setYizkorRowVisible(false);
    setHitvaadutRowVisible(true);
    const parashaFallback = document.getElementById('parasha-name');
    if (parashaFallback) {
      parashaFallback.textContent = '___________';
      adjustMainTitleForContent(parashaFallback);
    }
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
    attachRowButtons();
    fitPageToA4();
  }
}

async function loadShabbatEvent(event) {
  showLoading(true);
  hideError();

  try {
    applyShabbatTitles();
    const friday = new Date(`${event.friday}T12:00:00`);
    const shabbatUrl = `https://www.hebcal.com/shabbat?cfg=json&geonameid=${CONFIG.geonameid}&M=on&b=${CONFIG.candleMinutes}&molad=on&gy=${friday.getFullYear()}&gm=${friday.getMonth() + 1}&gd=${friday.getDate()}`;
    const shabbatData = await fetchJSON(shabbatUrl);

    let candles = null;
    let havdalah = null;
    let parasha = null;
    let specialShabbat = null;
    let moladItem = null;
    let mevarchimItem = null;

    for (const item of shabbatData.items) {
      if (item.category === 'candles' && !candles) candles = item;
      if (item.category === 'havdalah' && !havdalah) havdalah = item;
      if (item.category === 'parashat' && !parasha) parasha = item;
      if (item.category === 'holiday' && item.subcat === 'shabbat' && !specialShabbat) specialShabbat = item;
      if (item.category === 'molad' && !moladItem) moladItem = item;
      if (item.category === 'mevarchim' && !mevarchimItem) mevarchimItem = item;
    }

    if (!candles || !havdalah) {
      throw new Error('Could not find candle lighting or havdalah times');
    }

    const isIsrael = shabbatData.location ? shabbatData.location.cc === 'IL' : true;

    const fridayDateStr = candles.date.substring(0, 10);
    const saturdayDateStr = havdalah.date.substring(0, 10);

    const isMevarchim = !!mevarchimItem;

    // For Mevarchim: fetch Rosh Chodesh dates for the upcoming month
    let roshChodeshItems = [];
    if (isMevarchim) {
      // Rosh Chodesh of the new month falls ~2 weeks after this Shabbat — query that Gregorian month
      const rcDate = new Date(saturdayDateStr);
      rcDate.setDate(rcDate.getDate() + 14);
      const rcYear = rcDate.getFullYear();
      const rcMonth = rcDate.getMonth() + 1;
      const rcData = await fetchJSON(
        `https://www.hebcal.com/hebcal?v=1&cfg=json&nx=on&year=${rcYear}&month=${rcMonth}&i=on`,
      );
      roshChodeshItems = (rcData.items || []).filter((it) => it.category === 'roshchodesh');
      // Edge case: RC could span two Gregorian months; also check the next one
      if (roshChodeshItems.length === 0) {
        rcDate.setMonth(rcDate.getMonth() + 1);
        const rcData2 = await fetchJSON(
          `https://www.hebcal.com/hebcal?v=1&cfg=json&nx=on&year=${rcDate.getFullYear()}&month=${rcDate.getMonth() + 1}&i=on`,
        );
        roshChodeshItems = (rcData2.items || []).filter((it) => it.category === 'roshchodesh');
      }
    }

    const sundayDateStr = addDaysStr(saturdayDateStr, 1);
    const [zmanim, hebrewDateData, motzeiHebrew] = await Promise.all([
      fetchJSON(`https://www.hebcal.com/zmanim?cfg=json&geonameid=${CONFIG.geonameid}&date=${saturdayDateStr}`),
      fetchJSON(`https://www.hebcal.com/converter?cfg=json&date=${saturdayDateStr}&g2h=1`),
      fetchJSON(`https://www.hebcal.com/converter?cfg=json&date=${sundayDateStr}&g2h=1`),
    ]);

    setKiddushLevanaRowVisible(isKiddushLevanaHebrewDay(motzeiHebrew?.hd));

    const sunsetIso = zmanim.times.sunset;

    const saturdayHolidayHebrew = pickSaturdayHolidayHebrew(shabbatData.items, saturdayDateStr);

    // Parasha + special Shabbat (e.g. תצוה · זכור). Chol HaMoed from API → חול המועד פסח/סוכות for title flow.
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
    } else if (saturdayHolidayHebrew) {
      parashaEl.textContent = titleSuffixForHolidayHebrew(saturdayHolidayHebrew);
    } else {
      parashaEl.textContent = '—';
    }
    adjustMainTitleForContent(parashaEl);

    // Mevarchim indicator
    const mevarchimEl = document.getElementById('mevarchim-line');
    if (isMevarchim) {
      mevarchimEl.textContent = mevarchimItem.hebrew || `מברכים חודש`;
      mevarchimEl.style.display = 'block';
    } else {
      mevarchimEl.style.display = 'none';
    }

    // Molad display (only on Mevarchim)
    const moladSection = document.getElementById('molad-section');
    if (isMevarchim && moladItem) {
      const { dow, hour, minutes, chalakim, hm } = moladItem.molad;
      const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
      const monthHeb = HEBREW_MONTHS[hm] || hm;
      const moladTitleEl = document.getElementById('molad-section-title');
      if (moladTitleEl) moladTitleEl.textContent = `המולד חודש ${monthHeb}`;
      const moladLineEl = document.getElementById('molad-line');
      if (moladLineEl) {
        moladLineEl.textContent =
          `המולד יהיה ביום ${dayNames[dow]} בשעה ${hour}, ${minutes} דקות ו- ${chalakim} חלקים`;
      }

      // Rosh Chodesh line
      const rcEl = document.getElementById('molad-roshchodesh');
      if (roshChodeshItems.length > 0) {
        const rcDayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
        const rcDays = roshChodeshItems.map((it) => {
          const d = new Date(it.date);
          return rcDayNames[d.getDay()];
        });
        // Deduplicate (two items on the same day are possible for 2-day Rosh Chodesh on same day)
        const uniqueDays = [...new Set(rcDays)];
        const daysText = uniqueDays.length === 2
          ? `יום ה${uniqueDays[0]} ויום ה${uniqueDays[1]}`
          : `יום ה${uniqueDays[0]}`;
        rcEl.textContent = `ראש חודש ${monthHeb} ב${daysText} הבא עלינו לטובה`;
        rcEl.style.display = 'block';
      } else {
        rcEl.style.display = 'none';
      }

      moladSection.style.display = 'block';
    } else {
      moladSection.style.display = 'none';
    }

    // Hebrew date
    document.getElementById('hebrew-date').textContent = stripNikkud(hebrewDateData.hebrew).replace(
      /\sב(?=[א-ת])/u,
      ' ',
    );

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

    setYizkorRowVisible(false);
    setHitvaadutRowVisible(!isDuringPesach(hebrewDateData.hm, hebrewDateData.hd, isIsrael));

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

    // Shabbat Mincha - 10 minutes before sunset
    const shabbatMinchaEl = document.getElementById('shabbat-mincha');
    if (shabbatMinchaEl && sunsetIso) {
      const sunsetDate = new Date(sunsetIso);
      sunsetDate.setMinutes(sunsetDate.getMinutes() - 10);
      const shabbatMinchaTime = sunsetDate.toLocaleTimeString('he-IL', {
        timeZone: 'Asia/Jerusalem',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      shabbatMinchaEl.textContent = shabbatMinchaTime;
    }

    // Arvit Motzei Shabbat
    const motzeiArvitEl = document.getElementById('motzei-arvit');
    if (motzeiArvitEl) motzeiArvitEl.textContent = havdalahTime;
  } catch (error) {
    console.error('Error loading Shabbat data:', error);
    showError('⚠️ שגיאה בטעינת הנתונים. ניתן למלא ידנית ע״י לחיצה על השדות.');
    setKiddushLevanaRowVisible(false);
    setYizkorRowVisible(false);
    setHitvaadutRowVisible(true);

    const parashaFallback = document.getElementById('parasha-name');
    if (parashaFallback) {
      parashaFallback.textContent = '___________';
      adjustMainTitleForContent(parashaFallback);
    }
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
    attachRowButtons();
    fitPageToA4();
  }
}

async function loadEventData() {
  if (!events.length) {
    await loadShabbatEventFallback();
    updateEventNavUI();
    return;
  }
  const ev = events[eventIndex];
  if (!ev) return;
  if (ev.type === 'shabbat') await loadShabbatEvent(ev);
  else await loadYomTovData(ev);
  updateEventNavUI();
}

function toggleEcoMode(enabled) {
  document.body.classList.toggle('eco-mode', enabled);
}

function updateEventNavUI() {
  const sel = document.getElementById('event-select');
  const hint = document.getElementById('event-nav-hint');
  if (sel && events.length && !sel.disabled) {
    const v = String(eventIndex);
    if (sel.value !== v) sel.value = v;
  }
  if (!hint) return;
  if (!events.length) {
    hint.textContent = '';
    return;
  }
  if (eventIndex === defaultEventIndexAtLoad) {
    hint.textContent = 'האירוע הקרוב';
  } else if (eventIndex < defaultEventIndexAtLoad) {
    hint.textContent = `לפני ${defaultEventIndexAtLoad - eventIndex} אירועים`;
  } else {
    hint.textContent = `בעוד ${eventIndex - defaultEventIndexAtLoad} אירועים`;
  }
}

function changeEvent(delta) {
  if (!events.length) return;
  eventIndex += delta;
  eventIndex = Math.max(0, Math.min(eventIndex, events.length - 1));
  loadEventData();
}

function measureAndScale(inner, frame, caller) {
  const footer = frame.querySelector('.footer');
  const footerHeight = footer ? footer.offsetHeight : 0;

  const frameStyle = getComputedStyle(frame);
  const paddingTop = parseFloat(frameStyle.paddingTop);
  const paddingBottom = parseFloat(frameStyle.paddingBottom);
  const availableHeight = frame.clientHeight - paddingTop - paddingBottom - footerHeight;

  // Temporarily remove flex constraints and frame clipping to measure natural content height
  inner.style.flex = 'none';
  inner.style.height = 'auto';
  const prevOverflow = frame.style.overflow;
  frame.style.overflow = 'visible';
  void inner.offsetHeight;
  const contentHeight = inner.scrollHeight;
  frame.style.overflow = prevOverflow;

  console.log('[measureAndScale]', { caller, frameClientHeight: frame.clientHeight, paddingTop, paddingBottom, footerHeight, availableHeight, contentHeight, needsScale: contentHeight > availableHeight });

  if (contentHeight > availableHeight) {
    const scale = availableHeight / contentHeight;
    // Set height to full unscaled content height so layout/overflow doesn't clip
    // content before transform applies. scale() shrinks it visually to availableHeight.
    // Pull the footer up by the gap between layout height and visual height.
    const layoutGap = contentHeight - availableHeight;
    inner.style.flex = 'none';
    inner.style.height = contentHeight + 'px';
    inner.style.transform = `scale(${scale})`;
    if (footer) footer.style.marginTop = `-${layoutGap}px`;
  } else {
    // Restore flex layout — content fits without scaling
    inner.style.flex = '';
    inner.style.height = '';
    inner.style.transform = 'none';
    if (footer) footer.style.marginTop = '';
  }
}

function fitPageToA4() {
  const inner = document.querySelector('.page-frame-inner');
  const frame = document.querySelector('.page-frame');
  if (!inner || !frame) return;

  inner.style.transform = 'none';
  inner.style.flex = '';
  inner.style.height = '';
  const footer = frame.querySelector('.footer');
  if (footer) footer.style.marginTop = '';

  const noPrintEls = inner.querySelectorAll('.no-print');
  noPrintEls.forEach((el) => (el.style.display = 'none'));

  requestAnimationFrame(() => {
    measureAndScale(inner, frame, 'fitPageToA4');
    noPrintEls.forEach((el) => (el.style.display = ''));
  });
}

function fitPageToA4Print() {
  const inner = document.querySelector('.page-frame-inner');
  const frame = document.querySelector('.page-frame');
  if (!inner || !frame) return;

  inner.style.transform = 'none';
  inner.style.flex = '';
  inner.style.height = '';
  const footer = frame.querySelector('.footer');
  if (footer) footer.style.marginTop = '';

  const noPrintEls = inner.querySelectorAll('.no-print');
  noPrintEls.forEach(el => (el.style.display = 'none'));

  void frame.offsetHeight;
  measureAndScale(inner, frame, 'fitPageToA4Print');

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

function createAddRowBtn() {
  const btn = document.createElement('button');
  btn.className = 'row-add-btn no-print';
  btn.textContent = '+';
  btn.title = 'הוסף שורה';
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    const tr = this.closest('tr');
    const table = this.closest('table');
    if (tr && table) {
      addRow(table, tr);
    }
  });
  return btn;
}

function addRow(tableEl, afterRow) {
  const tr = document.createElement('tr');

  const labelTd = document.createElement('td');
  labelTd.className = 'label-cell';
  const labelSpan = document.createElement('span');
  labelSpan.contentEditable = 'true';
  labelSpan.className = 'label-editable';
  labelSpan.textContent = 'שם התפילה';
  labelTd.appendChild(labelSpan);
  labelTd.appendChild(createDeleteBtn());
  labelTd.appendChild(createAddRowBtn());

  const timeTd = document.createElement('td');
  timeTd.className = 'time-cell';
  const timeSpan = document.createElement('span');
  timeSpan.className = 'time-value';
  timeSpan.contentEditable = 'true';
  timeSpan.textContent = '__:__';
  timeTd.appendChild(timeSpan);

  tr.appendChild(labelTd);
  tr.appendChild(timeTd);

  if (afterRow) {
    afterRow.after(tr);
  } else {
    tableEl.appendChild(tr);
  }

  labelSpan.focus();
  fitPageToA4();
}

function attachRowButtons() {
  const editableTables = document.querySelectorAll(
    '.section .times-table, .section-shabbat .times-table',
  );
  editableTables.forEach((table) => {
    table.querySelectorAll('tr').forEach((tr) => {
      const labelCell = tr.querySelector('.label-cell');
      if (!labelCell) return;
      if (!labelCell.querySelector('.row-delete-btn')) {
        labelCell.appendChild(createDeleteBtn());
      }
      if (!labelCell.querySelector('.row-add-btn')) {
        labelCell.appendChild(createAddRowBtn());
      }
    });
  });
}

async function saveAsJPG() {
  if (isSavingImage) return;
  isSavingImage = true;

  const frame = document.querySelector('.page-frame');
  if (!frame) {
    isSavingImage = false;
    return;
  }

  const noPrintEls = frame.querySelectorAll('.no-print');
  const defaultLoadingText = document.querySelector('#loading-overlay .spinner-text')?.textContent || '';
  const parasha = document.getElementById('parasha-name')?.textContent || 'אירוע';
  const prefix = document.getElementById('title-fixed')?.textContent?.includes('יום טוב') ? 'זמני-יום-טוב' : 'זמני-שבת';
  const filename = `${prefix}-${parasha}.jpg`;
  const renderCanvas = () => html2canvas(frame, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  });
  const downloadFromCanvas = async (canvas) => {
    const blob = await new Promise((resolve, reject) => {
      try {
        if (!canvas.toBlob) {
          resolve(null);
          return;
        }
        canvas.toBlob((generatedBlob) => resolve(generatedBlob), 'image/jpeg', 0.95);
      } catch (error) {
        reject(error);
      }
    });

    const link = document.createElement('a');
    link.download = filename;
    document.body.appendChild(link);

    if (blob) {
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      // Fallback for browsers/devices where canvas.toBlob may return null.
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    }

    document.body.removeChild(link);
  };

  setLoadingText('שומר תמונה...');
  showLoading(true);
  await waitForNextPaint();

  noPrintEls.forEach(el => (el.style.display = 'none'));

  try {
    try {
      const canvas = await renderCanvas();
      await downloadFromCanvas(canvas);
    } catch (exportError) {
      const isTaintedError =
        exportError?.name === 'SecurityError'
        || exportError?.message?.includes('Tainted canvases may not be exported');

      if (!isTaintedError) {
        throw exportError;
      }

      // Retry without image assets when running from file://, to avoid tainted canvas.
      document.body.classList.add('capture-safe-export');
      await waitForNextPaint();
      try {
        const safeCanvas = await renderCanvas();
        await downloadFromCanvas(safeCanvas);
      } finally {
        document.body.classList.remove('capture-safe-export');
      }
    }
  } catch (err) {
    console.error('Error saving as JPG:', err);
    alert('שגיאה בשמירת התמונה');
  } finally {
    noPrintEls.forEach(el => (el.style.display = ''));
    setLoadingText(defaultLoadingText);
    showLoading(false);
    isSavingImage = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  attachRowButtons();
  try {
    events = await buildEventsList();
    defaultEventIndexAtLoad = findDefaultEventIndex(events);
    eventIndex = defaultEventIndexAtLoad;
  } catch (err) {
    console.error(err);
    events = [];
  }
  populateEventSelect();
  await loadEventData();
});
