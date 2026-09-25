# Shabbat Timetable

A single-page, print-ready A4 synagogue bulletin for Chabad Or Yehuda.

## Stack

Plain HTML/CSS/JS — no build system, no dependencies except `html2canvas` (CDN) for JPG export.

## Files

- `index.html` — page structure and all timetable sections
- `script.js` — data fetching, layout logic, event navigation
- `styles.css` — A4 layout, print styles, compact multi-day styles
- `progress.html` — standalone A4 tracker for the מבצע תפילה בציבור; reuses `styles.css` page chrome, data lives in the `OCCASIONS` array inside the file (all 25 campaign occasions are listed up front, one vertical-header column each; to update, add `names` to the next occasion, entries without `names` render as upcoming; totals and ranking are derived; Yom Tov entries take an extra `label` for the update line)
- `assets/` — logo and background images
- `archive/` — static snapshots of finalized holiday pages (`.html` with times baked in + `.png` image), one per holiday, for reuse in future years

## Key concepts

**Layouts**: Three layouts live in the same HTML, toggled by `showSingleLayout()` / `showMultiLayout()` / `showShabbatYomTovLayout()`:
- `#layout-single` — regular Shabbat or single Yom Tov
- `#layout-yomtov-shabbat` — Yom Tov that falls on Friday and rolls into Shabbat (e.g. Shavuot, Hoshana Raba)
- `#layout-shabbat-yomtov` — Shabbat that is Rosh Hashanah I, followed by RH II (shofar only on day 2)

**Event types** (in the `events` array):
- `shabbat` — regular Friday→Saturday
- `yomtov` — Yom Tov on a weekday
- `yomtovshabbat` — Yom Tov on Friday, handled by `loadYomTovShabbatData()`
- `shabbatyomtov` — Rosh Hashanah I on Shabbat, handled by `loadShabbatYomTovData()`

**Stripe alignment**: Compact sections split tables with `<div class="decorative-line">`. Call `alignCompactStripes()` after any load to fix odd/even row shading across table breaks.

**Scaling**: `fitPageToA4()` applies a CSS `scale()` transform to `.page-frame-inner` so all content fits exactly on one A4 page.

## External APIs (all Hebcal)

- `/shabbat` — candle lighting, havdalah, parasha, molad
- `/hebcal` — holidays, Rosh Chodesh, Pirkei Avot, zmanim range
- `/zmanim` — sunset, tzeit, sof zman shema, chatzot
- `/converter` — Hebrew date from Gregorian

## Times reference (Or Yehuda)

| Event | Time |
|---|---|
| חסידות עם הרב טאלער | 9:00 |
| שחרית (Shabbat/Yom Tov) | 10:00 |
| שחרית (Yom Tov on Friday) | 10:30 |
| מנחה | sunset |
| קבלת שבת | tzeit hakochavim |
