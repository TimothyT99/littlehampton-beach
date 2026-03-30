exports.handler = async () => {
  // Query Southern Water storm overflow data near Littlehampton
  // Bounding box roughly covers Littlehampton to Rustington coastline
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'Id,Status,StatusStart,ReceivingWaterCourse,LatestEventStart,LatestEventEnd,Latitude,Longitude',
    f: 'json',
    geometry: '-0.58,50.78,-0.47,50.83',
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelContains',
    resultRecordCount: '20',
  });

  const url = `https://services-eu1.arcgis.com/XxS6FebPX29TRGDJ/arcgis/rest/services/Southern_Water_Storm_Overflow_Activity/FeatureServer/0/query?${params}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Storm overflow API returned ${response.status}` }),
      };
    }

    const data = await response.json();
    const features = data.features || [];

    const outfalls = features.map(f => {
      const a = f.attributes;
      return {
        id: a.Id,
        status: a.Status, // 1 = active discharge, 0 = stopped, -1 = offline
        waterCourse: a.ReceivingWaterCourse,
        lat: a.Latitude,
        lon: a.Longitude,
        latestStart: a.LatestEventStart, // epoch ms
        latestEnd: a.LatestEventEnd,     // epoch ms
        statusSince: a.StatusStart,      // epoch ms
      };
    });

    // Count active discharges
    const active = outfalls.filter(o => o.Status === 1);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=900', // 15 min cache
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ outfalls, count: outfalls.length }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Failed to fetch storm overflow data' }),
    };
  }
};
