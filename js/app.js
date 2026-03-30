/* ── Main application ─────────────────────────────────── */

const App = (() => {
  let allData = null; // { hourlyByDay, tidesByDay, daylightByDay }

  async function init() {
    try {
      const { weather, marine, tides, coastal, discharges } = await API.fetchAll();
      const hourlyByDay = API.mergeHourlyData(weather, marine);
      const daylightByDay = API.extractDaylight(weather);
      const tidesByDay = API.groupTides(tides);

      // Enrich hourly data with tide state
      API.addTideState(hourlyByDay, tidesByDay);

      allData = { hourlyByDay, tidesByDay, daylightByDay };

      renderCurrentConditions(hourlyByDay, coastal);
      renderDischargeAlert(discharges);
      renderCards(hourlyByDay, tidesByDay, daylightByDay);
      updateTimestamp();
    } catch (err) {
      console.error('Failed to load data:', err);
      showError(err.message);
    }
  }

  /* ── Current conditions (header) ─────────────────────── */
  function renderCurrentConditions(hourlyByDay, coastal) {
    const el = document.getElementById('current-conditions');
    const now = new Date();
    const todayKey = Utils.toDateKey(now);
    const currentHour = now.toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/London' });

    const todayData = hourlyByDay[todayKey];
    if (!todayData) {
      el.innerHTML = '<span class="current-loading">No current data</span>';
      return;
    }

    const hourIdx = todayData.findIndex(h => {
      const hh = h.time.split('T')[1].split(':')[0];
      return parseInt(hh) >= parseInt(currentHour);
    });
    const current = todayData[Math.max(0, hourIdx)] || todayData[0];

    const seaTempForGear = (coastal && coastal.seaTemp) ? coastal.seaTemp : current.waterTemp;
    const gear = Scoring.recommendGear(seaTempForGear, current.airTemp, current.windSpeed);
    const peakUV = Scoring.peakUVForDay(todayData);
    const sunRec = Scoring.recommendSun(peakUV);

    let html = `
      <div class="current-group">
        <div class="current-group__label">Forecast</div>
        <div class="current-stat">
          <div class="current-stat__value">${Utils.r1(current.airTemp)}&deg;C</div>
          <div class="current-stat__label">Air Temp</div>
        </div>
        ${current.waterTemp !== null ? `
        <div class="current-stat">
          <div class="current-stat__value">${Utils.r1(current.waterTemp)}&deg;C</div>
          <div class="current-stat__label">Sea Temp</div>
        </div>` : ''}
        <div class="current-stat">
          <div class="current-stat__value">${Utils.r1(current.windSpeed)} kn</div>
          <div class="current-stat__label">Wind ${Utils.windCompass(current.windDir)}</div>
        </div>
        <div class="current-stat">
          <div class="current-stat__value">${Utils.r1(current.waveHeight ?? 0)} m</div>
          <div class="current-stat__label">Waves</div>
        </div>
      </div>
    `;

    if (coastal && coastal.waveHeight !== null) {
      html += `
        <div class="current-divider"></div>
        <div class="current-group">
          <div class="current-group__label"><span class="live-dot"></span> Live \u2014 Rustington</div>
          <div class="current-stat">
            <div class="current-stat__value">${coastal.waveHeight} m</div>
            <div class="current-stat__label">Waves</div>
          </div>
          ${coastal.seaTemp !== null ? `
          <div class="current-stat">
            <div class="current-stat__value">${coastal.seaTemp}&deg;C</div>
            <div class="current-stat__label">Sea Temp</div>
          </div>` : ''}
          ${coastal.peakPeriod !== null ? `
          <div class="current-stat">
            <div class="current-stat__value">${coastal.peakPeriod} s</div>
            <div class="current-stat__label">Period</div>
          </div>` : ''}
        </div>
      `;
    }

    html += `
      <div class="current-group">
        <div class="current-stat">
          <div class="current-stat__value">${gear.icon} ${gear.text}</div>
          <div class="current-stat__label">What to Wear</div>
        </div>
        ${sunRec ? `
        <div class="current-stat">
          <div class="current-stat__value">\u2600\uFE0E ${sunRec.text}</div>
          <div class="current-stat__label">UV ${Utils.r1(peakUV)}</div>
        </div>` : ''}
      </div>
    `;

    el.innerHTML = html;
  }

  /* ── Sewage discharge alert ───────────────────────────── */

  const CATEGORY_LABELS = {
    coastal: 'coastal outfall',
    river: 'River Arun',
    tributary: 'local waterway',
  };

  function describeOutfalls(list) {
    // Group by category and describe
    const byCat = {};
    list.forEach(o => {
      const cat = o.category || 'coastal';
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(o);
    });
    const parts = [];
    if (byCat.coastal) parts.push(`${byCat.coastal.length} coastal`);
    if (byCat.river) parts.push(`${byCat.river.length} River Arun`);
    if (byCat.tributary) parts.push(`${byCat.tributary.length} tributary`);
    return parts.join(', ');
  }

  function renderDischargeAlert(discharges) {
    const el = document.getElementById('discharge-alert');
    if (!discharges || !discharges.outfalls || !discharges.outfalls.length) {
      el.hidden = true;
      return;
    }

    const outfalls = discharges.outfalls;
    const active = outfalls.filter(o => o.status === 1);
    const now = Date.now();

    if (active.length > 0) {
      const desc = describeOutfalls(active);
      const hasCoastal = active.some(o => o.category === 'coastal');
      const hasRiver = active.some(o => o.category === 'river');

      let context = '';
      if (hasCoastal) {
        context = 'Discharging directly into the sea near the beach.';
      } else if (hasRiver) {
        context = 'Discharging into the River Arun \u2014 may affect the beach via the harbour, especially on an outgoing tide.';
      } else {
        context = 'Discharging into a local waterway. May affect beach water quality.';
      }

      el.innerHTML = `
        <div class="discharge discharge--active">
          <span class="discharge__icon">\u26A0\uFE0F</span>
          <div class="discharge__text">
            <strong>Sewage discharge alert</strong> \u2014
            ${active.length} overflow${active.length > 1 ? 's' : ''} active (${desc}).
            <span class="discharge__detail">${context} Check before entering the water.</span>
          </div>
        </div>
      `;
      el.hidden = false;
      return;
    }

    // Check for recent events (last 48 hours)
    const recentOutfalls = outfalls.filter(o => {
      if (!o.latestEnd) return false;
      return (now - o.latestEnd) / (1000 * 60 * 60) < 48;
    });

    if (recentOutfalls.length > 0) {
      const mostRecent = recentOutfalls.reduce((a, b) =>
        (b.latestEnd || 0) > (a.latestEnd || 0) ? b : a
      );
      const endDate = new Date(mostRecent.latestEnd);
      const hoursAgo = Math.round((now - mostRecent.latestEnd) / (1000 * 60 * 60));
      const catLabel = CATEGORY_LABELS[mostRecent.category] || 'outfall';

      el.innerHTML = `
        <div class="discharge discharge--recent">
          <span class="discharge__icon">\u26A0</span>
          <div class="discharge__text">
            <strong>Recent discharge</strong> \u2014
            ${catLabel} overflow ended ${hoursAgo}h ago (${Utils.formatTime(endDate)}, ${Utils.formatDate(endDate)}).
            ${recentOutfalls.length > 1 ? `${recentOutfalls.length} outfalls discharged in the last 48h. ` : ''}
            <span class="discharge__detail">Water quality may still be affected.</span>
          </div>
        </div>
      `;
      el.hidden = false;
      return;
    }

    // Clear
    el.innerHTML = `
      <div class="discharge discharge--clear">
        <span class="discharge__icon">\u2714</span>
        <div class="discharge__text">
          No storm overflow discharges reported near Littlehampton in the last 48 hours.
          <span class="discharge__detail">Monitoring ${outfalls.length} outfalls (coastal, River Arun &amp; tributaries).</span>
        </div>
      </div>
    `;
    el.hidden = false;
  }

  /* ── Day cards ───────────────────────────────────────── */
  function renderCards(hourlyByDay, tidesByDay, daylightByDay) {
    const container = document.getElementById('forecast-cards');
    const sortedDays = Object.keys(hourlyByDay).sort();

    const html = sortedDays.map(dateKey => {
      const hourly = hourlyByDay[dateKey];
      const tides = tidesByDay[dateKey] || [];
      const daylight = daylightByDay[dateKey] || null;
      const parts = Utils.dateParts(dateKey);
      const today = Utils.isToday(dateKey);

      const mid = hourly[12] || hourly[Math.floor(hourly.length / 2)] || hourly[0];
      const windows = Scoring.findWindows(hourly, tides, daylight);
      const gear = Scoring.recommendGear(mid.waterTemp, mid.airTemp, mid.windSpeed);
      const peakUV = Scoring.peakUVForDay(hourly);
      const sunRec = Scoring.recommendSun(peakUV);

      const sunInfo = daylight
        ? `<span class="sun-times">\u2600\uFE0E ${daylight.sunrise} \u2014 ${daylight.sunset}</span>`
        : '';

      return `
        <div class="card ${today ? 'card--today' : ''}" data-date="${dateKey}" role="button" tabindex="0">
          <div class="card__date">
            <div class="card__day">${today ? 'Today' : parts.day}</div>
            <div class="card__datenum">${parts.dateNum}</div>
            <div class="card__month">${parts.month}</div>
          </div>
          <div class="card__info">
            <div class="card__tides">
              ${tides.map(t => `
                <span class="tide-event ${t.type === 'HighWater' ? 'tide-event--high' : ''}">
                  ${t.type === 'HighWater' ? '\u25B2' : '\u25BC'} ${t.time} (${t.height}m)
                </span>
              `).join('')}
              ${tides.length === 0 ? '<span class="tide-event">No tide data</span>' : ''}
              ${sunInfo}
            </div>
            <div class="card__weather">
              <span>${Utils.r1(mid.airTemp)}&deg;C</span>
              <span>${Utils.r1(mid.windSpeed)} kn ${Utils.windCompass(mid.windDir)}</span>
              <span>${Utils.r1(mid.waveHeight ?? 0)}m waves</span>
              ${mid.precipProb > 20 ? `<span>${Math.round(mid.precipProb)}% rain</span>` : ''}
            </div>
            <div class="card__wetsuit">
              <span class="wetsuit-badge">${gear.icon} ${gear.text}</span>
              ${sunRec ? `<span class="sun-badge">\u2600\uFE0E ${sunRec.text} (UV ${Utils.r1(peakUV)})</span>` : ''}
            </div>
          </div>
          <div class="card__ratings">
            ${windowBadge('Swim', windows.swim)}
            ${windowBadge('Kayak', windows.kayak)}
            ${windowBadge('SUP', windows.sup)}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;

    container.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', () => openDetail(card.dataset.date));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDetail(card.dataset.date);
        }
      });
    });
  }

  function windowBadge(label, win) {
    const reasonText = win.reason ? ` \u2014 ${win.reason}` : '';
    return `
      <div class="window-badge window-badge--${win.rating}">
        <span class="window-badge__label">${label}</span>
        <span class="window-badge__time">${win.label}${reasonText}</span>
        ${win.tideNote ? `<span class="window-badge__tide">${win.tideNote}</span>` : ''}
      </div>
    `;
  }

  /* ── Detail panel (hourly breakdown) ─────────────────── */
  function openDetail(dateKey) {
    if (!allData) return;
    const panel = document.getElementById('detail-panel');
    const titleEl = document.getElementById('detail-title');
    const contentEl = document.getElementById('detail-content');

    const parts = Utils.dateParts(dateKey);
    const today = Utils.isToday(dateKey);
    titleEl.textContent = `${today ? 'Today' : parts.day} ${parts.dateNum} ${parts.month} \u2014 Hourly Breakdown`;

    const hourly = allData.hourlyByDay[dateKey] || [];
    const tides = allData.tidesByDay[dateKey] || [];
    const daylight = allData.daylightByDay[dateKey] || null;

    const mid = hourly[12] || hourly[Math.floor(hourly.length / 2)] || hourly[0];
    const gear = mid ? Scoring.recommendGear(mid.waterTemp, mid.airTemp, mid.windSpeed) : null;
    const windows = Scoring.findWindows(hourly, tides, daylight);

    // Filter to useful hours (6am–9pm)
    const dayHours = hourly.filter(h => {
      const hr = parseInt(h.time.split('T')[1].split(':')[0], 10);
      return hr >= 6 && hr <= 21;
    });

    const rows = dayHours.map(h => {
      const time = h.time.split('T')[1].substring(0, 5);
      const scores = Scoring.scoreHour(h);
      return `
        <tr>
          <td><strong>${time}</strong></td>
          <td>${Utils.r1(h.airTemp)}&deg;</td>
          <td>${h.waterTemp !== null ? Utils.r1(h.waterTemp) + '&deg;' : '\u2014'}</td>
          <td>${Utils.r1(h.windSpeed)} ${Utils.windCompass(h.windDir)}</td>
          <td>${Utils.r1(h.windGusts)}</td>
          <td>${Utils.r1(h.waveHeight ?? 0)}</td>
          <td>${Math.round(h.precipProb)}%</td>
          <td class="cell--${scores.swim}">${scores.swim}</td>
          <td class="cell--${scores.kayak}">${scores.kayak}</td>
          <td class="cell--${scores.sup}">${scores.sup}</td>
        </tr>
      `;
    }).join('');

    const tideInfo = tides.length
      ? `<p style="margin-bottom:0.8rem;font-size:0.85rem;color:#64748b;">
           Tides: ${tides.map(t => `${t.type === 'HighWater' ? 'High' : 'Low'} ${t.time} (${t.height}m)`).join(' &bull; ')}
         </p>`
      : '';

    const sunInfo = daylight
      ? `<p style="margin-bottom:0.5rem;font-size:0.85rem;color:#64748b;">\u2600\uFE0E Sunrise ${daylight.sunrise} &bull; Sunset ${daylight.sunset}</p>`
      : '';

    const gearInfo = gear
      ? `<p class="detail-wetsuit">${gear.icon} Recommended: ${gear.text}</p>`
      : '';

    const windowsSummary = `
      <div class="detail-windows">
        ${windowBadge('Swim', windows.swim)}
        ${windowBadge('Kayak', windows.kayak)}
        ${windowBadge('SUP', windows.sup)}
      </div>
    `;

    contentEl.innerHTML = `
      ${tideInfo}
      ${sunInfo}
      ${gearInfo}
      ${windowsSummary}
      <table class="hourly-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Air &deg;C</th>
            <th>Sea &deg;C</th>
            <th>Wind kn</th>
            <th>Gust</th>
            <th>Waves m</th>
            <th>Rain</th>
            <th>Swim</th>
            <th>Kayak</th>
            <th>SUP</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ── Close detail panel ──────────────────────────────── */
  document.getElementById('detail-close').addEventListener('click', () => {
    document.getElementById('detail-panel').hidden = true;
  });

  /* ── Error state ─────────────────────────────────────── */
  function showError(msg) {
    document.getElementById('forecast-cards').innerHTML = `
      <div class="error">
        <p><strong>Unable to load forecast</strong></p>
        <p>${msg}</p>
        <p style="margin-top:0.5rem;font-size:0.8rem;">Try refreshing the page.</p>
      </div>
    `;
  }

  /* ── Timestamp ───────────────────────────────────────── */
  function updateTimestamp() {
    const el = document.getElementById('last-updated');
    el.textContent = new Date().toLocaleString('en-GB', {
      timeZone: 'Europe/London',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Boot
  init();

  return { init };
})();
