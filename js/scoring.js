/* ── Watersports suitability scoring ──────────────────── */

const Scoring = (() => {
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

  function scoreSwim(wave, wind, precip, tide) {
    if (wave > 1) return 'poor';
    if (wind > 20) return 'poor';
    if (precip > 4) return 'poor';

    let base = 'good';
    if (wave > 0.5) base = 'fair';
    else if (wind > 15) base = 'fair';
    else if (precip > 1) base = 'fair';

    // Low tide penalty for swimming (shallow, exposed)
    if (tide === 'low') base = downgrade(base);

    return base;
  }

  function scoreKayak(wave, wind, gusts, precip, tide) {
    if (wave > 0.7) return 'poor';
    if (wind > 18) return 'poor';
    if (gusts > 25) return 'poor';
    if (precip > 4) return 'poor';

    let base = 'good';
    if (wave > 0.3) base = 'fair';
    else if (wind > 12) base = 'fair';
    else if (gusts > 18) base = 'fair';
    else if (precip > 1) base = 'fair';

    // Tide adjustments for kayak
    if (tide === 'low' || tide === 'near_low') base = downgrade(base);

    return base;
  }

  function scoreSup(wave, wind, gusts, precip, tide) {
    if (wave > 0.5) return 'poor';
    if (wind > 15) return 'poor';
    if (gusts > 20) return 'poor';
    if (precip > 3) return 'poor';

    let base = 'good';
    if (wave > 0.3) base = 'fair';
    else if (wind > 10) base = 'fair';
    else if (gusts > 15) base = 'fair';
    else if (precip > 0.5) base = 'fair';

    // Tide adjustments for SUP
    if (tide === 'low' || tide === 'near_low') base = downgrade(base);

    return base;
  }

  /** Downgrade a rating by one step */
  function downgrade(rating) {
    if (rating === 'good') return 'fair';
    return 'poor';
  }

  /**
   * Find usable time windows for each activity across a day.
   * Takes hourly data array and tide events for the day.
   * Returns { swim, kayak, sup } each with:
   *   { label, tideNote, rating, startHour, endHour }
   */
  function findWindows(hourlyData, tideEvents) {
    // Filter to daytime hours (6am to 8pm)
    const daytime = hourlyData.filter(h => {
      const hour = parseInt(h.time.split('T')[1].split(':')[0], 10);
      return hour >= 6 && hour <= 20;
    });

    if (!daytime.length) {
      const avoid = { label: 'Avoid today', tideNote: null, rating: 'poor', startHour: null, endHour: null };
      return { swim: avoid, kayak: avoid, sup: avoid };
    }

    const hourlyScores = daytime.map(h => {
      const hr = parseInt(h.time.split('T')[1].split(':')[0], 10);
      return { hour: hr, scores: scoreHour(h) };
    });

    return {
      swim: buildWindow('swim', hourlyScores, tideEvents),
      kayak: buildWindow('kayak', hourlyScores, tideEvents),
      sup: buildWindow('sup', hourlyScores, tideEvents),
    };
  }

  /**
   * Build a window description for a single activity.
   */
  function buildWindow(activity, hourlyScores, tideEvents) {
    // Map hours to usable (good or fair) vs not
    const usable = hourlyScores.map(h => ({
      hour: h.hour,
      score: h.scores[activity],
      ok: h.scores[activity] !== 'poor',
      good: h.scores[activity] === 'good',
    }));

    const okHours = usable.filter(h => h.ok);
    const goodHours = usable.filter(h => h.good);
    const totalDaytime = usable.length;

    // No usable hours, or too few to be useful (< 2 hours)
    if (okHours.length < 2) {
      return { label: 'Avoid today', tideNote: null, rating: 'poor', startHour: null, endHour: null };
    }

    // Find the longest contiguous run of usable hours
    const runs = findContiguousRuns(usable);
    const bestRun = runs.reduce((a, b) => a.length > b.length ? a : b, []);

    // If best run is too short (< 2 hours), not worth it
    if (bestRun.length < 2) {
      return { label: 'Avoid today', tideNote: null, rating: 'poor', startHour: null, endHour: null };
    }

    const startHour = bestRun[0].hour;
    const endHour = bestRun[bestRun.length - 1].hour;
    const firstDaytime = usable[0].hour;
    const lastDaytime = usable[usable.length - 1].hour;

    // Determine overall rating for the window
    const goodInRun = bestRun.filter(h => h.good).length;
    const rating = goodInRun >= bestRun.length * 0.6 ? 'good' : 'fair';

    // Generate label
    let label;
    if (bestRun.length >= totalDaytime - 1) {
      // Covers nearly all daytime
      label = 'All day';
    } else if (startHour <= firstDaytime + 1 && endHour < lastDaytime - 1) {
      // Starts at dawn — "Until HH:00"
      label = `Until ${pad(endHour + 1)}:00`;
    } else if (endHour >= lastDaytime - 1 && startHour > firstDaytime + 1) {
      // Runs to evening — "From HH:00"
      label = `From ${pad(startHour)}:00`;
    } else {
      // Mid-day window
      label = `${pad(startHour)}:00\u2013${pad(endHour + 1)}:00`;
    }

    // Tide context (for kayak and SUP mainly)
    const tideNote = getTideNote(startHour, endHour, tideEvents, activity);

    return { label, tideNote, rating, startHour, endHour };
  }

  /**
   * Find contiguous runs of usable (ok=true) hours.
   */
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

  /**
   * Generate a tide note for a time window.
   */
  function getTideNote(startHour, endHour, tideEvents, activity) {
    if (!tideEvents || !tideEvents.length) return null;
    // Tide notes most relevant for kayak and SUP
    if (activity === 'swim') return null;

    // Find high tides
    const highTides = tideEvents.filter(t => t.type === 'HighWater');
    if (!highTides.length) return null;

    for (const ht of highTides) {
      const htHour = ht.date.getHours() + ht.date.getMinutes() / 60;

      // Does the window overlap with ±2hrs of this high tide?
      if (htHour >= startHour - 2 && htHour <= endHour + 2) {
        if (startHour <= htHour && endHour >= htHour) {
          return `around high tide ${ht.time}`;
        }
        if (startHour > htHour) {
          return `after high tide ${ht.time}`;
        }
        return `before high tide ${ht.time}`;
      }
    }

    // If best window is far from high tide, note it
    const nearestHT = highTides.reduce((best, ht) => {
      const htHour = ht.date.getHours() + ht.date.getMinutes() / 60;
      const mid = (startHour + endHour) / 2;
      const dist = Math.abs(htHour - mid);
      return dist < best.dist ? { dist, tide: ht } : best;
    }, { dist: Infinity, tide: null });

    if (nearestHT.tide) {
      return `best near high tide ${nearestHT.tide.time}`;
    }

    return null;
  }

  /** Zero-pad an hour number */
  function pad(n) {
    return String(n).padStart(2, '0');
  }

  /**
   * Recommend wetsuit/gear based on sea temp, air temp, and wind.
   * Wind chill: if wind > 15kn, shift thresholds up ~2°C (one grade thicker).
   * Returns { text, icon }
   */
  function recommendGear(seaTemp, airTemp, windSpeed) {
    if (seaTemp === null || seaTemp === undefined) {
      return { text: 'No sea temp data', icon: '\u2014' };
    }

    const effective = windSpeed > 15 ? seaTemp - 2 : seaTemp;

    if (effective > 20) return { text: 'Boardshorts / swimsuit', icon: '\u2600' };
    if (effective > 17) return { text: 'Shorty / 3/2mm spring suit', icon: '\u{1F30A}' };
    if (effective > 14) return { text: '3/2mm full wetsuit', icon: '\u{1F9CA}' };
    if (effective > 12) return { text: '4/3mm wetsuit + boots', icon: '\u{1F9CA}' };
    if (effective > 10) return { text: '5/4mm + boots & gloves', icon: '\u2744' };
    return { text: '5/4mm + hood, boots & gloves', icon: '\u2744' };
  }

  return { scoreHour, findWindows, recommendGear };
})();
