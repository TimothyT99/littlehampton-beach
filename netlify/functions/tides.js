exports.handler = async (event) => {
  const API_KEY = process.env.ADMIRALTY_API_KEY;

  if (!API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Admiralty API key not configured' }),
    };
  }

  const duration = event.queryStringParameters?.duration || '7';
  const stationId = '0074'; // Littlehampton

  const url = `https://admiraltyapi.azure-api.net/uktidalapi/api/V1/Stations/${stationId}/TidalEvents?duration=${duration}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Ocp-Apim-Subscription-Key': API_KEY,
      },
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Admiralty API returned ${response.status}` }),
      };
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Failed to fetch tidal data' }),
    };
  }
};
