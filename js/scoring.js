/* ── Watersports suitability scoring ──────────────────── */

const Scoring = (() => {

  /* Activity-specific thresholds (used by scoring and explainer page) */
  const THRESHOLDS = {
    swim:  { wavePoor: 1,   waveFair: 0.5, windPoor: 20, windFair: 15, gustPoor: null, gustFair: null, precipPoor: 4, precipFair: 1 },
    kayak: { wavePoor: 0.7, waveFair: 0.3, windPoor: 18, windFair: 12, gustPoor: 25,   gustFair: 18,   precipPoor: 4, precipFair: 1 },
    sup:   { wavePoor: 0.5, waveFair: 0.3, windPoor: 15, windFair: 10, gustPoor: 20,   gustFair: 15,   precipPoor: 3, precipFair: 0.5 },
  };

  /**
   * Score a single hour for all three activities.
   * Returns { swim, kayak, sup } each being 'good' | 'fair' | 'poor'
   */
  function scoreHour({ waveHeight, windSpeed, windGusts, waterTemp, precip, precipProb, tideState, tideHeight }) {
    return {
      swim: scoreSwim(waveHeight, windSpeed, precip, tideState),
      kayak: scoreKayak(waveHeight, windSpeed, windGusts, precip, tideState),
      sup: scoreSup(waveHeight, windSpeed, windGusts, precip, tideState),
    };
  }

  // Treat null/undefined as 0 for safe numeric comparison
  function n(v) { return v ?? 0; }

  function scoreSwim(wave, wind, precip, tide) {
    if (n(wave) > 1) return 'poor';
    if (n(wind) > 20) return 'poor';
    if (n(precip) > 4) return 'poor';

    let base = 'good';
    if (n(wave) > 0.5) base = 'fair';
    else if (n(wind) > 15) base = 'fair';
    else if (n(precip) > 1) base = 'fair';

    if (tide === 'low') base = downgrade(base);
    return base;
  }

  function scoreKayak(wave, wind, gusts, precip, tide) {
    if (n(wave) > 0.7) return 'poor';
    if (n(wind) > 18) return 'poor';
    if (n(gusts) > 25) return 'poor';
    if (n(precip) > 4) return 'poor';

    let base = 'good';
    if (n(wave) > 0.3) base = 'fair';
    else if (n(wind) > 12) base = 'fair';
    else if (n(gusts) > 18) base = 'fair';
    else if (n(precip) > 1) base = 'fair';

    if (tide === 'low' || tide === 'near_low') base = downgrade(base);
    return base;
  }

  function scoreSup(wave, wind, gusts, precip, tide) {
    if (n(wave) > 0.5) return 'poor';
    if (n(wind) > 15) return 'poor';
    if (n(gusts) > 20) return 'poor';
    if (n(precip) > 3) return 'poor';

    let base = 'good';
    if (n(wave) > 0.3) base = 'fair';
    else if (n(wind) > 10) base = 'fair';
    else if (n(gusts) > 15) base = 'fair';
    else if (n(precip) > 0.5) base = 'fair';

    if (tide === 'low' || tide === 'near_low') base = downgrade(base);
    return base;
  }

  function downgrade(rating) {
    if (rating === 'good') return 'fair';
    return 'poor';
  }

  /**
   * Find usable time windows for each activity across a day.
   * daylight: { sunriseHour, sunsetHour } or null
   * minHours: per-activity minimum window (swim=1, kayak/sup=2)
   */
  function findWindows(hourlyData, tideEvents, daylight) {
    // Determine daylight bounds (default 6am–8pm if no data)
    const firstLight = daylight ? Math.max(daylight.sunriseHour, 5) : 6;
    const lastLight = daylight ? Math.min(daylight.sunsetHour, 21) : 20;

    const daytime = hourlyData.filter(h => {
      const hour = parseInt(h.time.split('T')[1].split(':')[0], 10);
      return hour >= firstLight && hour <= lastLight;
    });

    if (!daytime.length) {
      const avoid = avoidResult('no daylight');
      return { swim: avoid, kayak: avoid, sup: avoid };
    }

    const hourlyScores = daytime.map(h => {
      const hr = parseInt(h.time.split('T')[1].split(':')[0], 10);
      return { hour: hr, scores: scoreHour(h), data: h };
    });

    return {
      swim: buildWindow('swim', hourlyScores, tideEvents, daytime, 1),
      kayak: buildWindow('kayak', hourlyScores, tideEvents, daytime, 2),
      sup: buildWindow('sup', hourlyScores, tideEvents, daytime, 2),
    };
  }

  /** Create an avoid result with a reason */
  function avoidResult(reason) {
    return { label: 'Avoid', reason, tideNote: null, rating: 'poor', startHour: null, endHour: null };
  }

  /**
   * Determine the dominant reason for poor scores.
   */
  function getDominantReason(activity, hourlyData) {
    const t = THRESHOLDS[activity];
    let waves = 0, wind = 0, rain = 0, tide = 0;

    hourlyData.forEach(h => {
      if (h.waveHeight > t.wavePoor) waves++;
      if (h.windSpeed > t.windPoor || (t.gustPoor && h.windGusts > t.gustPoor)) wind++;
      if (h.precip > t.precipPoor) rain++;
      if (h.tideState === 'low' || h.tideState === 'near_low') tide++;
    });

    const max = Math.max(waves, wind, rain, tide);
    if (max === 0) return 'conditions';
    if (waves === max) return 'high waves';
    if (wind === max) return 'strong wind';
    if (rain === max) return 'heavy rain';
    if (tide === max) return 'low tide';
    return 'conditions';
  }

  /**
   * Build a window description for a single activity.
   */
  function buildWindow(activity, hourlyScores, tideEvents, rawHourly, minHours) {
    const usable = hourlyScores.map(h => ({
      hour: h.hour,
      score: h.scores[activity],
      ok: h.scores[activity] !== 'poor',
      good: h.scores[activity] === 'good',
    }));

    const okHours = usable.filter(h => h.ok);
    const totalDaytime = usable.length;

    if (okHours.length < minHours) {
      return avoidResult(getDominantReason(activity, rawHourly));
    }

    const runs = findContiguousRuns(usable);
    const bestRun = runs.reduce((a, b) => a.length > b.length ? a : b, []);

    if (bestRun.length < minHours) {
      return avoidResult(getDominantReason(activity, rawHourly));
    }

    const startHour = bestRun[0].hour;
    const endHour = bestRun[bestRun.length - 1].hour;
    const firstDaytime = usable[0].hour;
    const lastDaytime = usable[usable.length - 1].hour;

    const goodInRun = bestRun.filter(h => h.good).length;
    const rating = goodInRun >= bestRun.length * 0.6 ? 'good' : 'fair';

    let label;
    if (bestRun.length >= totalDaytime - 1) {
      label = 'All day';
    } else if (startHour <= firstDaytime + 1 && endHour < lastDaytime - 1) {
      label = `Until ${pad(endHour + 1)}:00`;
    } else if (endHour >= lastDaytime - 1 && startHour > firstDaytime + 1) {
      label = `From ${pad(startHour)}:00`;
    } else {
      label = `${pad(startHour)}:00\u2013${pad(endHour + 1)}:00`;
    }

    const tideNote = getTideNote(startHour, endHour, tideEvents, activity);

    return { label, reason: null, tideNote, rating, startHour, endHour };
  }

  function findContiguousRuns(hours) {
    const runs = [];
    let current = [];
    hours.forEach(h => {
      if (h.ok) {
        current.push(h);
      } else {
        if (current.length) runs.push(current);
        current = [];
      }
    });
    if (current.length) runs.push(current);
    return runs;
  }

  function getTideNote(startHour, endHour, tideEvents, activity) {
    if (!tideEvents || !tideEvents.length) return null;
    if (activity === 'swim') return null;

    const highTides = tideEvents.filter(t => t.type === 'HighWater');
    if (!highTides.length) return null;

    for (const ht of highTides) {
      const htHour = ht.date.getHours() + ht.date.getMinutes() / 60;
      if (htHour >= startHour - 2 && htHour <= endHour + 2) {
        if (startHour <= htHour && endHour >= htHour) return `around high tide ${ht.time}`;
        if (startHour > htHour) return `after high tide ${ht.time}`;
        return `before high tide ${ht.time}`;
      }
    }

    const nearestHT = highTides.reduce((best, ht) => {
      const htHour = ht.date.getHours() + ht.date.getMinutes() / 60;
      const mid = (startHour + endHour) / 2;
      const dist = Math.abs(htHour - mid);
      return dist < best.dist ? { dist, tide: ht } : best;
    }, { dist: Infinity, tide: null });

    if (nearestHT.tide) return `best near high tide ${nearestHT.tide.time}`;
    return null;
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  /**
   * Recommend wetsuit/gear based on sea temp, air temp, and wind.
   */
  function recommendGear(seaTemp, airTemp, windSpeed) {
    if (seaTemp === null || seaTemp === undefined) {
      return { text: 'No sea temp data', icon: '\u2014', sun: null };
    }
    const effective = windSpeed > 15 ? seaTemp - 2 : seaTemp;
    let result;
    if (effective > 20) result = { text: 'Boardshorts / swimsuit', icon: '\u2600' };
    else if (effective > 18) result = { text: 'Rash vest + boardshorts', icon: '\u2600' };
    else if (effective > 16) result = { text: 'Shorty wetsuit', icon: '\u{1F30A}' };
    else if (effective > 14) result = { text: '3/2mm spring suit', icon: '\u{1F30A}' };
    else if (effective > 12) result = { text: '3/2mm full wetsuit', icon: '\u{1F9CA}' };
    else if (effective > 10) result = { text: '4/3mm wetsuit + boots', icon: '\u{1F9CA}' };
    else if (effective > 8) result = { text: '5/4mm + boots & gloves', icon: '\u2744' };
    else result = { text: '5/4mm + hood, boots & gloves', icon: '\u2744' };
    result.sun = null;
    return result;
  }

  /**
   * Recommend sun protection based on peak UV index for the day.
   * Returns { text, spf } or null if UV is low.
   */
  function recommendSun(peakUV) {
    if (peakUV === null || peakUV === undefined || peakUV < 3) return null;
    if (peakUV < 6) return { text: 'SPF 30 suncream', spf: 30 };
    if (peakUV < 8) return { text: 'SPF 50 suncream', spf: 50 };
    return { text: 'SPF 50+ suncream, seek shade', spf: 50 };
  }

  /**
   * Get the peak UV index for daytime hours.
   */
  function peakUVForDay(hourlyData) {
    let peak = 0;
    hourlyData.forEach(h => {
      const hr = parseInt(h.time.split('T')[1].split(':')[0], 10);
      if (hr >= 8 && hr <= 18 && h.uvIndex > peak) peak = h.uvIndex;
    });
    return peak;
  }

  return { scoreHour, findWindows, recommendGear, recommendSun, peakUVForDay, THRESHOLDS };
})();
