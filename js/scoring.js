/* ── Watersports suitability scoring ──────────────────── */

const Scoring = (() => {
  /**
   * Score a single hour for all three activities.
   * Returns { swim, kayak, sup } each being 'good' | 'fair' | 'poor'
   *
   * Inputs (all numbers):
   *   waveHeight  — combined wave height (m)
   *   windSpeed   — wind speed (knots)
   *   windGusts   — gust speed (knots)
   *   waterTemp   — sea surface temp (°C), can be null
   *   precip      — precipitation (mm/h)
   *   precipProb  — precipitation probability (%)
   *   tideState   — 'rising' | 'falling' | 'high' | 'low' | null
   *   tideHeight  — tide height if available (m), else null
   */
  function scoreHour({ waveHeight, windSpeed, windGusts, waterTemp, precip, precipProb, tideState, tideHeight }) {
    return {
      swim: scoreSwim(waveHeight, windSpeed, waterTemp, precip, tideState),
      kayak: scoreKayak(waveHeight, windSpeed, windGusts, precip, tideState),
      sup: scoreSup(waveHeight, windSpeed, windGusts, precip, tideState),
    };
  }

  function scoreSwim(wave, wind, waterTemp, precip, tide) {
    // Poor conditions
    if (wave > 1) return 'poor';
    if (wind > 20) return 'poor';
    if (waterTemp !== null && waterTemp < 10) return 'poor';
    if (precip > 4) return 'poor';

    // Fair conditions
    if (wave > 0.5) return 'fair';
    if (wind > 15) return 'fair';
    if (waterTemp !== null && waterTemp < 14) return 'fair';
    if (precip > 1) return 'fair';

    return 'good';
  }

  function scoreKayak(wave, wind, gusts, precip, tide) {
    if (wave > 0.7) return 'poor';
    if (wind > 18) return 'poor';
    if (gusts > 25) return 'poor';
    if (precip > 4) return 'poor';

    if (wave > 0.3) return 'fair';
    if (wind > 12) return 'fair';
    if (gusts > 18) return 'fair';
    if (precip > 1) return 'fair';

    return 'good';
  }

  function scoreSup(wave, wind, gusts, precip, tide) {
    if (wave > 0.5) return 'poor';
    if (wind > 15) return 'poor';
    if (gusts > 20) return 'poor';
    if (precip > 3) return 'poor';

    if (wave > 0.3) return 'fair';
    if (wind > 10) return 'fair';
    if (gusts > 15) return 'fair';
    if (precip > 0.5) return 'fair';

    return 'good';
  }

  /**
   * Aggregate hourly scores for a day (daytime hours 6am–8pm).
   * Returns the most common rating, weighted toward worst conditions.
   */
  function scoreDayActivity(hourlyScores) {
    if (!hourlyScores.length) return 'poor';

    const counts = { good: 0, fair: 0, poor: 0 };
    hourlyScores.forEach(s => counts[s]++);

    // If any significant poor period, rate the day poorly
    if (counts.poor >= 4) return 'poor';
    if (counts.poor >= 2 && counts.good < 4) return 'poor';

    // If mostly fair or mixed
    if (counts.fair + counts.poor > counts.good) return 'fair';

    return 'good';
  }

  /** Score a full day given hourly data for all activities */
  function scoreDay(hourlyData) {
    // Filter to daytime hours (6am to 8pm)
    const daytime = hourlyData.filter(h => {
      const hour = parseInt(h.time.split('T')[1].split(':')[0], 10);
      return hour >= 6 && hour <= 20;
    });

    if (!daytime.length) {
      return { swim: 'poor', kayak: 'poor', sup: 'poor' };
    }

    const hourlyScores = daytime.map(h => scoreHour(h));

    return {
      swim: scoreDayActivity(hourlyScores.map(s => s.swim)),
      kayak: scoreDayActivity(hourlyScores.map(s => s.kayak)),
      sup: scoreDayActivity(hourlyScores.map(s => s.sup)),
    };
  }

  return { scoreHour, scoreDay };
})();
