const CONFIG = {
  geonameid: 293962,
  candleMinutes: 20,
  shacharitDefault: '10:00',
  shacharitMevarchim: '10:30',
  chassidutDefault: '9:00',
  chassidutMevarchim: '8:30',
};

let weekOffset = 0;
let isSavingImage = false;

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

    const [zmanim, hebrewDateData] = await Promise.all([
      fetchJSON(`https://www.hebcal.com/zmanim?cfg=json&geonameid=${CONFIG.geonameid}&date=${saturdayDateStr}`),
      fetchJSON(`https://www.hebcal.com/converter?cfg=json&date=${saturdayDateStr}&g2h=1`),
    ]);

    const sunsetIso = zmanim.times.sunset;

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
      document.getElementById('molad-section').querySelector('.section-title').textContent = `המולד חודש ${monthHeb}`;
      document.getElementById('molad-day').textContent = dayNames[dow];
      document.getElementById('molad-time').textContent =
        `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      document.getElementById('molad-chalakim').textContent = chalakim;

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
    attachRowButtons();
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
  const parasha = document.getElementById('parasha-name')?.textContent || 'shabbat';
  const filename = `זמני-שבת-${parasha}.jpg`;
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

document.addEventListener('DOMContentLoaded', () => {
  attachRowButtons();
  loadShabbatData();
});
