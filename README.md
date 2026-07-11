# Recent Earthquakes Visualizer

A web-based geospatial dashboard that visualizes recent global earthquake activity (past 24 hours, magnitude 2.5+) using real-time data from the USGS (United States Geological Survey).

## 🌍 Features
- **Real-Time Data**: Fetches the latest earthquake data directly from the USGS API.
- **Interactive Map**: Utilizes Leaflet.js with CartoDB Dark Matter tiles for a clean, modern dark-mode aesthetic.
- **Dynamic Styling**: Earthquake markers scale dynamically based on magnitude, and color-code severity (green, yellow, red).
- **Tsunami Simulation**: Clicking on marine earthquakes triggers a visual simulation of Tsunami wave propagation.

## 🛠️ Methodology & Technical Details
1. **Data Source**: The application queries the `earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson` endpoint.
2. **Land Masking (Turf.js & GeoJSON)**: 
   To distinguish between marine and terrestrial earthquakes, the app loads a `Natural Earth 110m land` polygon dataset. It uses `Turf.js` (`booleanPointInPolygon`) to detect if the earthquake epicenter is on land or in the ocean.
3. **SVG Clipping**: 
   The tsunami animation should only be visible over water. A dynamic SVG `<clipPath>` is constructed by subtracting the land polygons from the world bounding rectangle (even-odd rule). This mask is applied to the Leaflet animation pane, completely hiding waves when they "hit" land.

## ⚠️ Limitations & Scientific Accuracy
> [!WARNING]
> The Tsunami wave animations in this project are strictly for **visual and educational effect** and do not represent accurate hydrodynamic modeling.

The current wave simulation has several major scientific weaknesses:
- **No Bathymetry (Depth Data)**: Real tsunami waves propagate faster in deep water and slow down (while increasing in height) as they approach shallow coasts. This application assumes a constant propagation velocity everywhere.
- **No Refraction/Diffraction**: Real waves bend around islands and coastlines (refraction). The waves in this app are simple concentric CSS circles that do not interact with the shoreline topography.
- **Empirical Radii**: The "felt radius" and maximum wave propagation distances are based on simplified empirical formulas (Gutenberg-Richter scaling) and are not calculated from actual fault-line energy release data.
- **Visual Clipping**: The SVG land mask simply hides the wave visually when it overlaps with land. It does not calculate the actual run-up or stopping power of the coastline.

## 🚀 Running Locally
Simply open `index.html` in any modern web browser, or serve it using a local HTTP server (e.g., `npx serve` or `python -m http.server`).