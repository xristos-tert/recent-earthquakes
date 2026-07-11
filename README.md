# Recent Earthquakes Visualizer

This is a simple web-based dashboard that pulls recent global earthquake data (past 24 hours, magnitude 2.5 and above) from the USGS API and visualizes it on an interactive map.

It's built with vanilla JavaScript and Leaflet.js, using CartoDB's Dark Matter tiles for a clean, minimal look. The markers scale automatically based on the earthquake's magnitude.

## How the Tsunami Animation Works (And Why It's Fake)

When you click on an earthquake that happened in the ocean, it triggers a visual "tsunami wave" animation. 

I want to be very clear here: this animation is entirely for visual flair and is not scientifically accurate in any way. Here is why:

1. No depth data: Real tsunami waves travel much faster in deep ocean water and slow down dramatically when they hit the continental shelf, while their height increases. This script assumes the wave travels at a constant speed everywhere.
2. Perfect circles: Real waves refract and bend around islands and coastlines. The waves in this project are just concentric CSS circles that expand uniformly.
3. Coastline clipping: The script uses Turf.js and a Natural Earth polygon dataset to detect where the land is. I'm using a Leaflet GeoJSON mask to simply hide the CSS circles when they overlap with land. It creates a cool visual effect of the wave "hitting" the coast, but it does not simulate actual wave run-up or energy dissipation.
4. Arbitrary radius: The maximum distance the waves travel is based on a very rough empirical formula using the Gutenberg-Richter scale, not actual fault line energy modeling.

## Running it

You don't need a build step. Just open `index.html` in your browser, or run a simple local server in the project directory:

```bash
npx serve
# or
python -m http.server
```