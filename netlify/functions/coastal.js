exports.handler = async () => {
  const url = 'https://coastalmonitoring.org/realtimedata/?chart=78&tab=waves&disp_option=1';

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'LittlehamptonBeach-Dashboard/1.0' },
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Coastal monitoring returned ${response.status}` }),
      };
    }

    const html = await response.text();

    // Extract the latest data row from the waves table.
    // The page has a <tbody> with rows of sensor readings.
    // Each row has <td> cells in order:
    // Date/Time, Lat, Lon, Hs, Hmax, Tpeak, Tz, PeakDir, Spread, SeaTemp, Te, Power
    const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    if (!tbodyMatch) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Could not find data table in page' }),
      };
    }

    // Get the last row (most recent reading)
    const rows = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    if (!rows || rows.length === 0) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'No data rows found' }),
      };
    }

    const lastRow = rows[rows.length - 1];
    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(lastRow)) !== null) {
      // Strip HTML tags and trim
      cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
    }

    if (cells.length < 10) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: `Expected 10+ cells, got ${cells.length}` }),
      };
    }

    const data = {
      timestamp: cells[0] || null,
      waveHeight: parseFloat(cells[3]) || null,
      maxWaveHeight: parseFloat(cells[4]) || null,
      peakPeriod: parseFloat(cells[5]) || null,
      meanPeriod: parseFloat(cells[6]) || null,
      peakDirection: parseFloat(cells[7]) || null,
      spread: parseFloat(cells[8]) || null,
      seaTemp: parseFloat(cells[9]) || null,
    };

    // Include energy period and wave power if available
    if (cells.length >= 12) {
      data.energyPeriod = parseFloat(cells[10]) || null;
      data.wavePower = parseFloat(cells[11]) || null;
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Failed to fetch coastal monitoring data' }),
    };
  }
};
