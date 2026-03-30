exports.handler = async () => {
  // Worthing Pier met station (chart 101) — nearest active to Littlehampton
  // Fallback: Arun Platform (chart 86) if it comes back online
  const url = 'https://coastalmonitoring.org/realtimedata/?chart=101&tab=met&disp_option=1';

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'LittlehamptonBeach-Dashboard/1.0' },
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Met station returned ${response.status}` }),
      };
    }

    const html = await response.text();

    // Find the table with met data — same structure as wave data
    const tableMatch = html.match(/<table[^>]*class="[^"]*table[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
    if (!tableMatch) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Could not find data table' }),
      };
    }

    // Get data rows (those with <td>, skip header row with <th>)
    const allRows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    const rows = allRows.filter(r => /<td/i.test(r));
    if (rows.length === 0) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'No data rows found' }),
      };
    }

    // Parse the last row (most recent reading)
    const lastRow = rows[rows.length - 1];
    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(lastRow)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
    }

    // Columns: Time, Pressure, WindKn, WindMs, GustKn, GustMs, WindDir, AirTemp, Rain, EryRad, UV, Humidity
    if (cells.length < 9) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: `Expected 9+ cells, got ${cells.length}` }),
      };
    }

    const parse = (v) => {
      const n = parseFloat(v);
      return isNaN(n) ? null : n;
    };

    const data = {
      station: 'Worthing Pier',
      timestamp: cells[0] || null,
      pressure: parse(cells[1]),
      windSpeedKn: parse(cells[2]),
      gustSpeedKn: parse(cells[4]),
      windDirection: parse(cells[6]),
      airTemp: parse(cells[7]),
      rainfall: parse(cells[8]),
      uvIndex: cells.length >= 11 ? parse(cells[10]) : null,
      humidity: cells.length >= 12 ? parse(cells[11]) : null,
    };

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
      body: JSON.stringify({ error: 'Failed to fetch met station data' }),
    };
  }
};
