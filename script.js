const CONFIG = {
  geonameid: 293962,
  candleMinutes: 20,
  shacharitDefault: '10:00',
  shacharitMevarchim: '10:30',
};

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

async function loadShabbatData() {
  showLoading(true);
  hideError();

  try {
    const shabbatUrl = `https://www.hebcal.com/shabbat?cfg=json&geonameid=${CONFIG.geonameid}&M=on&b=${CONFIG.candleMinutes}`;
    const shabbatData = await fetchJSON(shabbatUrl);

    let candles = null;
    let havdalah = null;
    let parasha = null;

    for (const item of shabbatData.items) {
      if (item.category === 'candles' && !candles) candles = item;
      if (item.category === 'havdalah' && !havdalah) havdalah = item;
      if (item.category === 'parashat' && !parasha) parasha = item;
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
      `https://www.hebcal.com/converter?cfg=json&date=${saturdayDateStr}&g2h=1&gs=on`,
    );

    const nextSaturday = new Date(saturdayDateStr);
    nextSaturday.setDate(nextSaturday.getDate() + 7);
    const nextSatStr = formatDateParam(nextSaturday);

    const nextHebrewDate = await fetchJSON(
      `https://www.hebcal.com/converter?cfg=json&date=${nextSatStr}&g2h=1&gs=on`,
    );

    const isMevarchim =
      hebrewDateData.hm !== nextHebrewDate.hm && nextHebrewDate.hm !== 'Tishrei' && hebrewDateData.hd < 30;

    // Parasha
    const parashaEl = document.getElementById('parasha-name');
    if (parasha) {
      const name = parasha.hebrew.replace(/^פרשת\s*/, '');
      parashaEl.textContent = name;
    } else {
      parashaEl.textContent = '—';
    }

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
    document.getElementById('friday-mincha').textContent = sunsetTime;

    // Shacharit
    const shacharitTime = isMevarchim ? CONFIG.shacharitMevarchim : CONFIG.shacharitDefault;
    document.getElementById('shacharit-time').textContent = shacharitTime;
    if (isMevarchim) {
      document.getElementById('shacharit-label').innerHTML =
        'שחרית <span style="font-size:16px;color:#555;">(שבת מברכים)</span>';
    }

    // Shabbat Mincha
    document.getElementById('shabbat-mincha').textContent = sunsetTime;

    // Arvit Motzei Shabbat
    document.getElementById('motzei-arvit').textContent = havdalahTime;
  } catch (error) {
    console.error('Error loading Shabbat data:', error);
    showError('⚠️ שגיאה בטעינת הנתונים. ניתן למלא ידנית ע״י לחיצה על השדות.');

    document.getElementById('parasha-name').textContent = '___________';
    document.getElementById('hebrew-date').textContent = '___ ב___ תשפ״ו';
    const placeholders = [
      'candle-time',
      'havdalah-time',
      'friday-mincha',
      'shacharit-time',
      'shabbat-mincha',
      'motzei-arvit',
    ];
    placeholders.forEach((id) => {
      document.getElementById(id).textContent = '__:__';
    });
  } finally {
    showLoading(false);
  }
}

function togglePrintMode() {
  const btn = document.getElementById('print-mode-btn');
  const isEco = document.body.classList.toggle('print-eco');
  btn.textContent = isEco ? '🌿 חיסכון בדיו' : '🎨 הדפסה עשירה';
}

document.addEventListener('DOMContentLoaded', loadShabbatData);
