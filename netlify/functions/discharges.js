exports.handler = async () => {
  // Wider bounding box to capture:
  // - Coastal outfalls near Littlehampton/Rustington
  // - River Arun upstream outfalls (up to Arundel) which wash down to Littlehampton harbour
  // - Tributary outfalls (Black Ditch, Ryebank Rife, etc.)
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'Id,Status,StatusStart,ReceivingWaterCourse,LatestEventStart,LatestEventEnd,Latitude,Longitude',
    f: 'json',
    geometry: '-0.72,50.75,-0.42,50.86',
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelContains',
    resultRecordCount: '50',
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

    // Categorise each outfall by threat type
    const COASTAL_COURSES = ['ENGLISH CHANNEL'];
    const RIVER_COURSES = ['ARUN'];

    const outfalls = features.map(f => {
      const a = f.attributes;
      const wc = (a.ReceivingWaterCourse || '').toUpperCase();

      let category;
      if (COASTAL_COURSES.some(c => wc.includes(c))) {
        category = 'coastal';
      } else if (RIVER_COURSES.some(c => wc.includes(c))) {
        category = 'river';
      } else {
        category = 'tributary';
      }

      return {
        id: a.Id,
        status: a.Status,
        waterCourse: a.ReceivingWaterCourse,
        category,
        lat: a.Latitude,
        lon: a.Longitude,
        latestStart: a.LatestEventStart,
        latestEnd: a.LatestEventEnd,
        statusSince: a.StatusStart,
      };
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=900',
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
