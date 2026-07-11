# Recent Earthquakes Visualizer

This is a web-based dashboard that tracks and visualizes recent global earthquakes (past 24 hours, magnitude 2.5 and above) using the USGS Earthquake API.

The UI is built with vanilla JavaScript, Leaflet.js, and Turf.js for spatial calculations. It employs a strict, terminal-inspired aesthetic for a professional GIS feel.

## Methodology: The Layered Map Architecture

When an oceanic earthquake marker is clicked, a visual "tsunami wave" animation is triggered. To make this wave look realistic, it needs to be visible in the ocean but disappear (clip) when it hits land.

Instead of relying on fragile SVG clip-paths, this project utilizes a professional **layered GIS architecture** to achieve seamless masking. The map is constructed from the bottom up in four distinct layers (Leaflet panes) controlled by strict z-indexes:

1. **The Ocean Layer (Base)**
   There is no traditional base map image tile for the ocean. Instead, the raw background of the map container is painted a solid near-black CSS color.
   
2. **The Waves Layer (zIndex: 250)**
   The expanding tsunami circles are drawn here. They naturally expand in the empty ocean space.

3. **The Solid Land Layer (zIndex: 260)**
   A medium-resolution (50m) Natural Earth GeoJSON dataset (`ne_50m_land.geojson`) is rendered as a solid, opaque grey polygon representing all global landmasses. 
   Because this layer sits *above* the waves, any expanding wave that crosses the coastline simply slides *underneath* the opaque land polygon, hiding it perfectly without any complex mathematical clipping.

4. **The Labels & Borders Layer (zIndex: 270)**
   A specialized CartoDB map tile layer (`dark_only_labels`) is placed at the absolute top. This layer has a transparent background and contains *only* country borders, city names, and geographic labels. It sits on top of our solid GeoJSON land, ensuring that all map text remains visible and is not covered by the land polygons.

*Note on Wave Physics: The tsunami animations are strictly for visual effect. The waves travel uniformly and their radius is determined by a simplified Gutenberg-Richter empirical calculation. They do not simulate actual ocean depth, wave refraction, or true run-up energy dissipation.*

## Running Locally

No build tools are required. Open `index.html` in your browser, or start a local HTTP server:

```bash
python -m http.server
```