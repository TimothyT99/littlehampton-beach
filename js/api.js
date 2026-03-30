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
      ].join(','),
      forecast_days: FORECAST_DAYS,
      wind_speed_unit: 'kn',
      timezone: 'Europe/London',
    });

    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
    return res.json();
  }

  /** Fetch marine forecast from Open-Meteo */
  async function fetchMarine() {
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
    if (!res.ok) throw new Error(`Marine API error: ${res.status}`);
    return res.json();
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

  /**
   * Fetch all data sources in parallel.
   * Tides are optional — weather + marine are required.
   */
  async function fetchAll() {
    const [weather, marine, tides] = await Promise.all([
      fetchWeather(),
      fetchMarine(),
      fetchTides(),
    ]);
    return { weather, marine, tides };
  }

  /**
   * Merge weather + marine hourly data into a unified structure,
   * keyed by YYYY-MM-DD, with hourly arrays.
   */
  function mergeHourlyData(weather, marine) {
    const days = {};
    const wh = weather.hourly;
    const mh = marine.hourly;

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
        // Marine (may be shorter array)
        waveHeight: mh.wave_height[i] ?? null,
        wavePeriod: mh.wave_period[i] ?? null,
        waveDir: mh.wave_direction[i] ?? null,
        swellHeight: mh.swell_wave_height[i] ?? null,
        waterTemp: mh.sea_surface_temperature[i] ?? null,
      });
    }

    return days;
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

  return { fetchAll, mergeHourlyData, groupTides };
})();
