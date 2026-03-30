/* ── API fetch layer ──────────────────────────────────── */

const API = (() => {
  const LAT = 50.81;
  const LON = -0.54;
  const FORECAST_DAYS = 7;

  /** Fetch weather forecast from Open-Meteo */
  async function fetchWeather() {
    const params = new URLSearchParams({
      latitude: LAT,
      longitude: LON,
      hourly: [
        'temperature_2m',
        'apparent_temperature',
        'precipitation',
        'precipitation_probability',
        'rain',
        'wind_speed_10m',
        'wind_gusts_10m',
        'wind_direction_10m',
        'visibility',
        'uv_index',
      ].join(','),
      daily: 'sunrise,sunset',
      forecast_days: FORECAST_DAYS,
      wind_speed_unit: 'kn',
      timezone: 'Europe/London',
    });

    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
    return res.json();
  }

  /** Fetch marine forecast from Open-Meteo — degrades gracefully */
  async function fetchMarine() {
    try {
      const params = new URLSearchParams({
        latitude: LAT,
        longitude: LON,
        hourly: [
          'wave_height',
          'wave_period',
          'wave_direction',
          'swell_wave_height',
          'sea_surface_temperature',
        ].join(','),
        forecast_days: FORECAST_DAYS,
        timezone: 'Europe/London',
      });

      const res = await fetch(`https://marine-api.open-meteo.com/v1/marine?${params}`);
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    } catch {
      console.warn('Marine API unavailable \u2014 wave/sea temp data will be missing.');
      return null;
    }
  }

  /** Fetch tidal events — tries Netlify proxy first, falls back gracefully */
  async function fetchTides() {
    try {
      const res = await fetch(`/.netlify/functions/tides?duration=${FORECAST_DAYS}`);
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    } catch {
      console.warn('Tides proxy unavailable — tide data will be missing.');
      return [];
    }
  }

  /** Fetch live coastal monitoring data — optional, graceful fallback */
  async function fetchCoastal() {
    try {
      const res = await fetch('/.netlify/functions/coastal');
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    } catch {
      console.warn('Coastal monitoring data unavailable.');
      return null;
    }
  }

  /** Fetch live met station data — optional, graceful fallback */
  async function fetchMet() {
    try {
      const res = await fetch('/.netlify/functions/met');
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    } catch {
      console.warn('Met station data unavailable.');
      return null;
    }
  }

  /** Fetch storm overflow discharge data — optional, graceful fallback */
  async function fetchDischarges() {
    try {
      const res = await fetch('/.netlify/functions/discharges');
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    } catch {
      console.warn('Storm overflow data unavailable.');
      return null;
    }
  }

  /**
   * Fetch all data sources in parallel.
   * Tides, coastal and discharges are optional — weather + marine are required.
   */
  async function fetchAll() {
    const [weather, marine, tides, coastal, met, discharges] = await Promise.all([
      fetchWeather(),
      fetchMarine(),
      fetchTides(),
      fetchCoastal(),
      fetchMet(),
      fetchDischarges(),
    ]);
    return { weather, marine, tides, coastal, met, discharges };
  }

  /**
   * Merge weather + marine hourly data into a unified structure,
   * keyed by YYYY-MM-DD, with hourly arrays.
   * Also extracts daily sunrise/sunset into a separate object.
   */
  function mergeHourlyData(weather, marine) {
    const days = {};
    const wh = weather.hourly;
    const mh = marine ? marine.hourly : null;

    for (let i = 0; i < wh.time.length; i++) {
      const time = wh.time[i];
      const dateKey = time.split('T')[0];

      if (!days[dateKey]) days[dateKey] = [];

      days[dateKey].push({
        time,
        // Weather
        airTemp: wh.temperature_2m[i],
        feelsLike: wh.apparent_temperature[i],
        precip: wh.precipitation[i],
        precipProb: wh.precipitation_probability[i],
        rain: wh.rain[i],
        windSpeed: wh.wind_speed_10m[i],
        windGusts: wh.wind_gusts_10m[i],
        windDir: wh.wind_direction_10m[i],
        visibility: wh.visibility[i],
        uvIndex: wh.uv_index[i],
        // Marine (may be null if API is down)
        waveHeight: mh ? (mh.wave_height[i] ?? null) : null,
        wavePeriod: mh ? (mh.wave_period[i] ?? null) : null,
        waveDir: mh ? (mh.wave_direction[i] ?? null) : null,
        swellHeight: mh ? (mh.swell_wave_height[i] ?? null) : null,
        waterTemp: mh ? (mh.sea_surface_temperature[i] ?? null) : null,
      });
    }

    return days;
  }

  /**
   * Extract daily sunrise/sunset times from weather response.
   * Returns { 'YYYY-MM-DD': { sunrise: 'HH:MM', sunset: 'HH:MM', sunriseHour, sunsetHour } }
   */
  function extractDaylight(weather) {
    const daylight = {};
    const d = weather.daily;
    if (!d || !d.sunrise) return daylight;

    for (let i = 0; i < d.time.length; i++) {
      const dateKey = d.time[i];
      const rise = d.sunrise[i]; // e.g. "2026-03-30T06:42"
      const set = d.sunset[i];
      daylight[dateKey] = {
        sunrise: rise.split('T')[1].substring(0, 5),
        sunset: set.split('T')[1].substring(0, 5),
        sunriseHour: parseInt(rise.split('T')[1].split(':')[0], 10),
        sunsetHour: parseInt(set.split('T')[1].split(':')[0], 10),
      };
    }
    return daylight;
  }

  /**
   * Group tidal events by YYYY-MM-DD (converting from GMT to London time).
   */
  function groupTides(tidalEvents) {
    const days = {};

    tidalEvents.forEach(evt => {
      const localDate = Utils.admiraltyToLocal(evt.DateTime);
      const dateKey = Utils.toDateKey(localDate);

      if (!days[dateKey]) days[dateKey] = [];

      days[dateKey].push({
        type: evt.EventType,
        time: Utils.formatTime(localDate),
        height: Utils.r1(evt.Height),
        date: localDate,
      });
    });

    return days;
  }

  /**
   * Enrich hourly data with tide state by interpolating between
   * Admiralty high/low events. Sets tideState and tideHeight on each hour.
   */
  function addTideState(hourlyByDay, tidesByDay) {
    Object.keys(hourlyByDay).forEach(dateKey => {
      const hours = hourlyByDay[dateKey];
      const tides = tidesByDay[dateKey] || [];

      if (!tides.length) return;

      // Build a list of tide event timestamps (as fractional hours) for this day
      const events = tides.map(t => ({
        type: t.type,
        hour: t.date.getHours() + t.date.getMinutes() / 60,
        height: t.height,
      }));

      hours.forEach(h => {
        const hr = parseInt(h.time.split('T')[1].split(':')[0], 10);

        // Find nearest tide event
        let nearest = null;
        let nearestDist = Infinity;
        events.forEach(e => {
          const dist = Math.abs(hr - e.hour);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = e;
          }
        });

        if (!nearest) return;

        if (nearestDist <= 1) {
          // Within ±1hr of an event
          h.tideState = nearest.type === 'HighWater' ? 'high' : 'low';
        } else if (nearestDist <= 2 && nearest.type === 'HighWater') {
          h.tideState = 'near_high';
        } else if (nearestDist <= 2 && nearest.type === 'LowWater') {
          h.tideState = 'near_low';
        } else {
          // Determine rising or falling based on surrounding events
          const before = events.filter(e => e.hour <= hr).pop();
          const after = events.find(e => e.hour > hr);
          if (before && before.type === 'LowWater') h.tideState = 'rising';
          else if (before && before.type === 'HighWater') h.tideState = 'falling';
          else h.tideState = null;
        }

        h.tideHeight = nearest.height;
      });
    });
  }

  return { fetchAll, mergeHourlyData, extractDaylight, groupTides, addTideState };
})();
