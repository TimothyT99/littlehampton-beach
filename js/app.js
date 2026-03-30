/* ── Main application ─────────────────────────────────── */

const App = (() => {
  let allData = null; // { hourlyByDay, tidesByDay }

  async function init() {
    try {
      const { weather, marine, tides } = await API.fetchAll();
      const hourlyByDay = API.mergeHourlyData(weather, marine);
      const tidesByDay = API.groupTides(tides);

      allData = { hourlyByDay, tidesByDay };

      renderCurrentConditions(hourlyByDay);
      renderCards(hourlyByDay, tidesByDay);
      updateTimestamp();
    } catch (err) {
      console.error('Failed to load data:', err);
      showError(err.message);
    }
  }

  /* ── Current conditions (header) ─────────────────────── */
  function renderCurrentConditions(hourlyByDay) {
    const el = document.getElementById('current-conditions');
    const now = new Date();
    const todayKey = Utils.toDateKey(now);
    const currentHour = now.toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/London' });

    const todayData = hourlyByDay[todayKey];
    if (!todayData) {
      el.innerHTML = '<span class="current-loading">No current data</span>';
      return;
    }

    // Find closest hour
    const hourIdx = todayData.findIndex(h => {
      const hh = h.time.split('T')[1].split(':')[0];
      return parseInt(hh) >= parseInt(currentHour);
    });
    const current = todayData[Math.max(0, hourIdx)] || todayData[0];

    el.innerHTML = `
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
    `;
  }

  /* ── Day cards ───────────────────────────────────────── */
  function renderCards(hourlyByDay, tidesByDay) {
    const container = document.getElementById('forecast-cards');
    const sortedDays = Object.keys(hourlyByDay).sort();

    const html = sortedDays.map(dateKey => {
      const hourly = hourlyByDay[dateKey];
      const tides = tidesByDay[dateKey] || [];
      const parts = Utils.dateParts(dateKey);
      const today = Utils.isToday(dateKey);

      // Day summary weather (midday-ish, index 12)
      const mid = hourly[12] || hourly[Math.floor(hourly.length / 2)] || hourly[0];

      // Score the day
      const scores = Scoring.scoreDay(hourly);

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
            </div>
            <div class="card__weather">
              <span>${Utils.r1(mid.airTemp)}&deg;C</span>
              <span>${Utils.r1(mid.windSpeed)} kn ${Utils.windCompass(mid.windDir)}</span>
              <span>${Utils.r1(mid.waveHeight ?? 0)}m waves</span>
              ${mid.precipProb > 20 ? `<span>${Math.round(mid.precipProb)}% rain</span>` : ''}
            </div>
          </div>
          <div class="card__ratings">
            ${ratingBadge('Swim', scores.swim)}
            ${ratingBadge('Kayak', scores.kayak)}
            ${ratingBadge('SUP', scores.sup)}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;

    // Attach click handlers
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

  function ratingBadge(label, rating) {
    const icons = { good: '\u2713', fair: '\u223C', poor: '\u2717' };
    return `
      <span class="rating rating--${rating}">
        <span class="rating__icon">${icons[rating]}</span>
        ${label}
      </span>
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
    titleEl.textContent = `${today ? 'Today' : parts.day} ${parts.dateNum} ${parts.month} — Hourly Breakdown`;

    const hourly = allData.hourlyByDay[dateKey] || [];
    const tides = allData.tidesByDay[dateKey] || [];

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
          <td>${h.waterTemp !== null ? Utils.r1(h.waterTemp) + '&deg;' : '—'}</td>
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

    contentEl.innerHTML = `
      ${tideInfo}
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
