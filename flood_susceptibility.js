
// ----------------------------------------------------------------
// STEP 1: DEFINE STUDY AREA - DAMODAR RIVER BASIN
Map.centerObject(aoi, 8);
Map.addLayer(aoi, {color: 'red'}, 'AOI Boundary', false);

// ----------------------------------------------------------------
// STEP 2: ELEVATION & SLOPE
// ----------------------------------------------------------------
var dem = ee.Image('USGS/SRTMGL1_003').clip(aoi);
var elevation = dem.select('elevation');
var slope = ee.Terrain.slope(dem);

// ----------------------------------------------------------------
// STEP 3: FLOW ACCUMULATION & TWI
// ----------------------------------------------------------------
var flowAcc = ee.Image('WWF/HydroSHEDS/15ACC').clip(aoi);
var slopeRad = slope.multiply(Math.PI / 180);
var twi = flowAcc.add(1).log()
            .subtract(slopeRad.tan().add(0.001).log())
            .rename('TWI');

// ----------------------------------------------------------------
// STEP 4: STREAM NETWORK & DISTANCE FROM RIVERS
// Higher threshold used since this AOI includes hilly upper
// catchment terrain (Chota Nagpur Plateau) - avoids flagging too
// many minor channels as "rivers"
// ----------------------------------------------------------------
var streamThreshold = 1000;
var streams = flowAcc.gt(streamThreshold).selfMask();

var distRivers = streams.fastDistanceTransform(256).sqrt()
                  .multiply(ee.Image.pixelArea().sqrt())
                  .rename('distRivers')
                  .clip(aoi);

// ----------------------------------------------------------------
// STEP 5: RAINFALL (CHIRPS long-term mean)
// ----------------------------------------------------------------
var rainfall = ee.ImageCollection('UCSB-CHG/CHIRPS/PENTAD')
                .filterDate('2015-01-01', '2023-12-31')
                .filterBounds(aoi)
                .mean()
                .clip(aoi)
                .rename('rainfall');

// ----------------------------------------------------------------
// STEP 6: LAND USE / LAND COVER (ESA WorldCover 2021)
// ----------------------------------------------------------------
var lulc = ee.ImageCollection("ESA/WorldCover/v200").first().clip(aoi);

// ----------------------------------------------------------------
// STEP 7: RECLASSIFY EACH FACTOR INTO SCORES (1 = low, 5 = high susceptibility)
// ----------------------------------------------------------------

// --- Elevation: lower = higher susceptibility ---
var elevMin = ee.Number(elevation.reduceRegion({
  reducer: ee.Reducer.min(), geometry: aoi, scale: 90, maxPixels: 1e10
}).values().get(0));
var elevMax = ee.Number(elevation.reduceRegion({
  reducer: ee.Reducer.max(), geometry: aoi, scale: 90, maxPixels: 1e10
}).values().get(0));

var elevScore = ee.Image(5).subtract(
  elevation.unitScale(elevMin, elevMax).multiply(4)
).rename('elevScore');

// --- Slope: flatter = higher susceptibility ---
var slopeScore = ee.Image(5).subtract(
  slope.unitScale(0, 30).clamp(0, 1).multiply(4)
).rename('slopeScore');

// --- TWI: higher = higher susceptibility ---
var twiMin = ee.Number(twi.reduceRegion({
  reducer: ee.Reducer.min(), geometry: aoi, scale: 90, maxPixels: 1e10
}).values().get(0));
var twiMax = ee.Number(twi.reduceRegion({
  reducer: ee.Reducer.max(), geometry: aoi, scale: 90, maxPixels: 1e10
}).values().get(0));

var twiScore = twi.unitScale(twiMin, twiMax).multiply(4).add(1).rename('twiScore');

// --- Distance to rivers: closer = higher susceptibility ---
var distMax = ee.Number(distRivers.reduceRegion({
  reducer: ee.Reducer.max(), geometry: aoi, scale: 90, maxPixels: 1e10
}).values().get(0));

var distScore = ee.Image(5).subtract(
  distRivers.unitScale(0, distMax).clamp(0, 1).multiply(4)
).rename('distScore');

// --- Rainfall: higher = higher susceptibility ---
var rainMin = ee.Number(rainfall.reduceRegion({
  reducer: ee.Reducer.min(), geometry: aoi, scale: 5000, maxPixels: 1e10
}).values().get(0));
var rainMax = ee.Number(rainfall.reduceRegion({
  reducer: ee.Reducer.max(), geometry: aoi, scale: 5000, maxPixels: 1e10
}).values().get(0));

var rainScore = rainfall.unitScale(rainMin, rainMax).multiply(4).add(1).rename('rainScore');

// --- LULC: assign susceptibility based on class ---
// ESA WorldCover: 10-Tree,20-Shrub,30-Grass,40-Crop,50-Built,60-Bare,
// 70-Snow/Ice,80-Water,90-Wetland,95-Mangrove,100-Moss/Lichen
var lulcBand = lulc.select('Map');
var lulcScore = ee.Image(3)
  .where(lulcBand.eq(10), 1)   // Tree cover - low
  .where(lulcBand.eq(20), 2)   // Shrubland
  .where(lulcBand.eq(30), 3)   // Grassland
  .where(lulcBand.eq(40), 4)   // Cropland
  .where(lulcBand.eq(50), 5)   // Built-up - high
  .where(lulcBand.eq(60), 4)   // Bare/sparse vegetation
  .where(lulcBand.eq(80), 5)   // Permanent water - high
  .where(lulcBand.eq(90), 5)   // Herbaceous wetland - high
  .where(lulcBand.eq(95), 4)   // Mangroves
  .rename('lulcScore');

// ----------------------------------------------------------------
// STEP 8: WEIGHTED OVERLAY
// ----------------------------------------------------------------
var w_elev  = 0.20;
var w_slope = 0.15;
var w_twi   = 0.15;
var w_dist  = 0.20;
var w_rain  = 0.15;
var w_lulc  = 0.15;

var fsi = elevScore.multiply(w_elev)
  .add(slopeScore.multiply(w_slope))
  .add(twiScore.multiply(w_twi))
  .add(distScore.multiply(w_dist))
  .add(rainScore.multiply(w_rain))
  .add(lulcScore.multiply(w_lulc))
  .rename('FloodSusceptibilityIndex')
  .clip(aoi);

// ----------------------------------------------------------------
// STEP 9: CLASSIFY INTO 5 CLASSES USING QUANTILES (DATA-DRIVEN)
// Each class gets ~20% of the AOI - balanced, no "all red" problem
// ----------------------------------------------------------------
var fsiPercentiles = fsi.reduceRegion({
  reducer: ee.Reducer.percentile([20, 40, 60, 80]),
  geometry: aoi,
  scale: 90,
  maxPixels: 1e10
});

print('FSI Percentile breakpoints:', fsiPercentiles);

var p20 = ee.Number(fsiPercentiles.get('FloodSusceptibilityIndex_p20'));
var p40 = ee.Number(fsiPercentiles.get('FloodSusceptibilityIndex_p40'));
var p60 = ee.Number(fsiPercentiles.get('FloodSusceptibilityIndex_p60'));
var p80 = ee.Number(fsiPercentiles.get('FloodSusceptibilityIndex_p80'));

var fsiClass = ee.Image(1)
  .where(fsi.gt(p20).and(fsi.lte(p40)), 2)
  .where(fsi.gt(p40).and(fsi.lte(p60)), 3)
  .where(fsi.gt(p60).and(fsi.lte(p80)), 4)
  .where(fsi.gt(p80), 5)
  .rename('FSI_Class')
  .clip(aoi);

// ----------------------------------------------------------------
// STEP 10: VISUALIZE
// ----------------------------------------------------------------
var palette5 = ['#2b83ba', '#abdda4', '#ffffbf', '#fdae61', '#d7191c'];
var legendLabels = ['Very Low', 'Low', 'Moderate', 'High', 'Very High'];

Map.addLayer(fsi, {min: 1, max: 5, palette: palette5}, 'Flood Susceptibility Index (continuous)');
Map.addLayer(fsiClass, {min: 1, max: 5, palette: palette5}, 'Flood Susceptibility Classes (1=Very Low, 5=Very High)');

// ----------------------------------------------------------------
// STEP 11: ADD LEGEND TO MAP
// ----------------------------------------------------------------
var legend = ui.Panel({
  style: {position: 'bottom-right', padding: '8px 15px', backgroundColor: 'white'}
});

var legendTitle = ui.Label({
  value: 'Flood Susceptibility',
  style: {fontWeight: 'bold', fontSize: '14px', margin: '0 0 6px 0', padding: '0'}
});
legend.add(legendTitle);

var makeRow = function(color, name) {
  var colorBox = ui.Label({
    style: {backgroundColor: color, padding: '8px', margin: '0 6px 4px 0', border: '1px solid #999'}
  });
  var description = ui.Label({value: name, style: {margin: '0 0 4px 0', fontSize: '12px'}});
  return ui.Panel({widgets: [colorBox, description], layout: ui.Panel.Layout.Flow('horizontal')});
};

for (var i = 0; i < 5; i++) {
  legend.add(makeRow(palette5[i], legendLabels[i]));
}
Map.add(legend);

// ----------------------------------------------------------------
// STEP 12: CALCULATE AREA OF EACH SUSCEPTIBILITY CLASS
// ----------------------------------------------------------------
var pixelArea = ee.Image.pixelArea();
var areaImage = pixelArea.addBands(fsiClass);

var areaByClass = areaImage.reduceRegion({
  reducer: ee.Reducer.sum().group({
    groupField: 1,
    groupName: 'class'
  }),
  geometry: aoi,
  scale: 90,
  maxPixels: 1e10
});

print('Raw grouped area output:', areaByClass);

var groups = ee.List(areaByClass.get('groups'));

var areaKm2List = groups.map(function(item) {
  item = ee.Dictionary(item);
  var classNum = ee.Number(item.get('class'));
  var areaM2 = ee.Number(item.get('sum'));
  var areaKm2 = areaM2.divide(1e6);
  return ee.Dictionary({
    'class': classNum,
    'area_km2': areaKm2
  });
});

print('Area per class (km²):', areaKm2List);

// Total area = sum of all class areas (avoids aoi.area() entirely)
var totalAreaKm2 = ee.Number(
  areaKm2List.map(function(item) {
    return ee.Dictionary(item).get('area_km2');
  }).reduce(ee.Reducer.sum())
);

print('Total study area (km²):', totalAreaKm2);

var classNames = ee.Dictionary({
  1: 'Very Low',
  2: 'Low',
  3: 'Moderate',
  4: 'High',
  5: 'Very High'
});

var areaFeatures = ee.FeatureCollection(
  areaKm2List.map(function(item) {
    item = ee.Dictionary(item);
    var classNum = item.get('class');
    var areaKm2 = ee.Number(item.get('area_km2'));
    var percent = areaKm2.divide(totalAreaKm2).multiply(100);
    return ee.Feature(null, {
      'Class_Number': classNum,
      'Class_Name': classNames.get(ee.Number(classNum).format('%d')),
      'Area_km2': areaKm2,
      'Percent_of_AOI': percent
    });
  })
);

print('Flood Susceptibility - Area Summary Table:', areaFeatures);

// ----------------------------------------------------------------
// STEP 13: BAR CHART OF AREA BY CLASS
// ----------------------------------------------------------------
var chart = ui.Chart.feature.byFeature({
  features: areaFeatures,
  xProperty: 'Class_Name',
  yProperties: ['Area_km2']
}).setChartType('ColumnChart')
  .setOptions({
    title: 'Flood Susceptibility Area by Class - Damodar River Basin',
    hAxis: {title: 'Susceptibility Class'},
    vAxis: {title: 'Area (km²)'},
    legend: {position: 'none'},
    colors: ['#d7191c']
  });

print(chart);

// ----------------------------------------------------------------
// STEP 14: EXPORT RESULTS
// ----------------------------------------------------------------
Export.image.toDrive({
  image: fsiClass.toFloat(),
  description: 'Damodar_Flood_Susceptibility_Map',
  folder: 'GEE_exports',
  region: aoi,
  scale: 30,
  maxPixels: 1e10
});

Export.image.toDrive({
  image: fsi.toFloat(),
  description: 'Damodar_Flood_Susceptibility_Index_continuous',
  folder: 'GEE_exports',
  region: aoi,
  scale: 30,
  maxPixels: 1e10
});

Export.table.toDrive({
  collection: areaFeatures,
  description: 'Damodar_Flood_Susceptibility_Area_Summary',
  folder: 'GEE_exports',
  fileFormat: 'CSV'
});