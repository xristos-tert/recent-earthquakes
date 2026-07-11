// Initialize Leaflet Map
const map = L.map('map', {
    zoomControl: false // Move it later or hide it for clean UI
}).setView([20, 0], 2);

// Add Dark CartoDB Map Tiles (perfect for dark mode dashboards)
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

// Add zoom control to bottom right
L.control.zoom({
    position: 'bottomright'
}).addTo(map);

// Pane for wave animations only
map.createPane('wavesPane');
map.getPane('wavesPane').style.zIndex = 250;

// Natural Earth 110m land polygons — used for SVG clip path + Turf land detection
const LAND_GEOJSON_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson';
let landGeoJSON = null;
let clipPathReady = false;

async function loadLandMask() {
    try {
        const res = await fetch(LAND_GEOJSON_URL);
        landGeoJSON = await res.json();
        // No visible rendering — the GeoJSON is used only for:
        // 1. SVG clipPath to clip waves at coastlines (buildOceanClipPath)
        // 2. Turf.js land detection (isOnLand)
    } catch (e) {
        console.error('Land mask load error:', e);
    }
}

// Build an SVG <clipPath> that defines the OCEAN area (world rect minus land polygons).
// Applied to the wavesPane SVG so waves are invisible over land.
function buildOceanClipPath() {
    if (!landGeoJSON) return;

    const wavePane = map.getPane('wavesPane');
    const svg = wavePane.querySelector('svg');
    if (!svg) return; // SVG created lazily by Leaflet on first layer add

    // Ensure <defs> exists
    let defs = svg.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.insertBefore(defs, svg.firstChild);
    }

    // Replace existing clip path
    const old = defs.querySelector('#ocean-clip');
    if (old) old.remove();

    const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    clipPath.setAttribute('id', 'ocean-clip');

    // World bounding rect in layer coordinates (huge, covers all zoom levels)
    const pad = 50000;
    const tl = map.latLngToLayerPoint([85, -180]);
    const br = map.latLngToLayerPoint([-85, 180]);
    let d = `M${tl.x - pad},${tl.y - pad} L${br.x + pad},${tl.y - pad} L${br.x + pad},${br.y + pad} L${tl.x - pad},${br.y + pad} Z `;

    // Subtract each land polygon using even-odd rule → leaves only ocean
    for (const feature of landGeoJSON.features) {
        const geom = feature.geometry;
        const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
        for (const rings of polys) {
            const outer = rings[0];
            const pts = [];
            for (const coord of outer) {
                const lp = map.latLngToLayerPoint([coord[1], coord[0]]);
                pts.push(`${lp.x.toFixed(0)},${lp.y.toFixed(0)}`);
            }
            if (pts.length >= 3) {
                d += `M${pts[0]} L${pts.slice(1).join(' L')} Z `;
            }
        }
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill-rule', 'evenodd');
    clipPath.appendChild(path);
    defs.appendChild(clipPath);

    // Apply clip to the entire wavesPane SVG
    svg.setAttribute('clip-path', 'url(#ocean-clip)');
    clipPathReady = true;
}

// Rebuild clip path on zoom (layer coordinates change)
map.on('zoomend', () => {
    clipPathReady = false;
    buildOceanClipPath();
});

function isOnLand(lon, lat) {
    if (!landGeoJSON) return false;
    const pt = turf.point([lon, lat]);
    for (const feature of landGeoJSON.features) {
        try {
            if (turf.booleanPointInPolygon(pt, feature)) return true;
        } catch (_) {}
    }
    return false;
}

// USGS Earthquake API URL (Past 24 hours, Magnitude 2.5+)
const EQ_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';

// Empirical felt radius based on Gutenberg-Richter scaling and depth
function calculateFeltRadius(magnitude, depthKm) {
    let radiusKm = Math.pow(10, (0.5 * magnitude - 1.0)) * 10; 
    // Adjust based on depth: deeper = waves propagate wider but less intense.
    if (depthKm > 50) {
        radiusKm *= 1.5;
    } else if (depthKm > 100) {
        radiusKm *= 2.0;
    }
    return radiusKm * 1000; // Convert to meters for Leaflet
}

// Function to simulate Tsunami wave propagation using geographic coordinates
function triggerTsunamiAnimation(latlng, color, mag) {
    const maxRadiusMeters = Math.pow(2, mag) * 15000; // e.g., mag 6 -> 960km radius
    
    for (let i = 0; i < 3; i++) {
        setTimeout(() => {
            const wave = L.circle(latlng, {
                pane: 'wavesPane', // Add to our custom low-z-index pane
                radius: 1000, // start small
                color: color,
                fillColor: 'transparent',
                weight: 2,
                opacity: 1,
                interactive: false
            }).addTo(map);

            // Build/rebuild clip path now that the SVG element exists
            if (!clipPathReady) buildOceanClipPath();

            const duration = 3000; // 3 seconds
            const startTime = performance.now();

            function animateWave(time) {
                const elapsed = time - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // Ease out (fast start, slow end)
                const easeOut = 1 - Math.pow(1 - progress, 3);
                
                wave.setRadius(1000 + (maxRadiusMeters * easeOut));
                wave.setStyle({ opacity: 1 - progress });

                if (progress < 1) {
                    requestAnimationFrame(animateWave);
                } else {
                    map.removeLayer(wave);
                }
            }
            requestAnimationFrame(animateWave);
            
        }, i * 600); 
    }
}

// Function to fetch and process GeoJSON data
async function loadEarthquakes() {
    try {
        const response = await fetch(EQ_URL);
        const data = await response.json();
        
        processData(data);
    } catch (error) {
        console.error("Error loading earthquake data:", error);
    }
}

// Function to process and display data
function processData(geojsonData) {
    const features = geojsonData.features;
    
    // Update Stats
    document.getElementById('total-quakes').textContent = features.length;
    
    let maxMag = 0;
    features.forEach(f => {
        if (f.properties.mag > maxMag) maxMag = f.properties.mag;
    });
    document.getElementById('max-magnitude').textContent = maxMag.toFixed(1);

    const listContainer = document.getElementById('quake-list');
    
    // Custom GeoJSON layer
    const geoJsonLayer = L.geoJSON(geojsonData, {
        filter: function(feature) {
            return feature.geometry !== null && feature.properties.mag !== null && feature.properties.mag !== undefined;
        },
        pointToLayer: function (feature, latlng) {
            const mag = feature.properties.mag;
            const depth = feature.geometry.coordinates[2] || 0;
            const time = new Date(feature.properties.time).toLocaleString();
            const lon = feature.geometry.coordinates[0];
            const lat = feature.geometry.coordinates[1];
            const onLand = isOnLand(lon, lat);
            let color = '#34d399'; // green (low)
            if (mag >= 4.0) color = '#fbbf24'; // yellow (medium)
            if (mag >= 5.5) color = '#f87171'; // red (high)

            // Create range circle (scientifically calculated)
            const rangeRadius = calculateFeltRadius(mag, depth);
            L.circle(latlng, {
                radius: rangeRadius,
                color: color,
                fillColor: color,
                fillOpacity: 0.05,
                weight: 1,
                dashArray: '4, 4',
                interactive: false // Do not block mouse events on the main marker
            }).addTo(map);

            const normalRadius = mag * 3;
            const geojsonMarkerOptions = {
                radius: normalRadius, // scale radius with magnitude
                fillColor: color,
                color: "#fff",
                weight: 1,
                opacity: 1,
                fillOpacity: 0.7
            };

            const marker = L.circleMarker(latlng, geojsonMarkerOptions);
            
            // Hover effect to enlarge marker
            marker.on('mouseover', function () {
                this.setRadius(normalRadius * 1.6);
                this.setStyle({ fillOpacity: 0.9, weight: 2 });
            });
            marker.on('mouseout', function () {
                this.setRadius(normalRadius);
                this.setStyle({ fillOpacity: 0.7, weight: 1 });
            });

            // Tsunami animation — only for marine earthquakes
            const hasTsunami = feature.properties.tsunami === 1;

            if (!onLand) {
                marker.on('click', function() {
                    triggerTsunamiAnimation(latlng, color, mag);
                });
            }

            let tsunamiWarning;
            if (onLand) {
                tsunamiWarning = `<div style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">Χερσαίος σεισμός</div>`;
            } else if (hasTsunami) {
                tsunamiWarning = `<div style="color:#ef4444;font-weight:bold;margin-top:4px;">⚠️ Προειδοποίηση Τσουνάμι</div><div style="font-size:0.75rem;color:#38bdf8;">Κλικ για εξομοίωση κυμάτων</div>`;
            } else {
                tsunamiWarning = `<div style="font-size:0.75rem;color:#38bdf8;margin-top:4px;">Κλικ για εξομοίωση κυμάτων</div>`;
            }
            
            marker.bindPopup(`
                <div class="popup-title">Magnitude ${mag.toFixed(1)}</div>
                <div style="font-size:0.8rem; margin-bottom:4px">Βάθος: ${depth.toFixed(1)} km</div>
                <div style="margin-bottom:8px">${feature.properties.place}</div>
                <div style="font-size:0.8rem; opacity:0.8">${time}</div>
                ${tsunamiWarning}
            `);

            return marker;
        }
    }).addTo(map);

    // Populate Sidebar List
    const validFeatures = features.filter(f => f.properties.mag !== null);
    validFeatures.slice(0, 50).forEach(feature => { // Limit to 50 for performance in list
        const mag = feature.properties.mag;
        const place = feature.properties.place;
        const time = new Date(feature.properties.time).toLocaleString();
        const coords = [feature.geometry.coordinates[1], feature.geometry.coordinates[0]];

        let magClass = 'mag-low';
        if (mag >= 4.0) magClass = 'mag-med';
        if (mag >= 5.5) magClass = 'mag-high';

        const li = document.createElement('li');
        li.className = 'quake-item';
        li.innerHTML = `
            <span class="quake-mag ${magClass}">${mag.toFixed(1)}</span>
            <div class="quake-place">${place}</div>
            <div class="quake-time">${time}</div>
        `;

        // Pan to location on click
        li.addEventListener('click', () => {
            map.flyTo(coords, 6, {
                animate: true,
                duration: 1.5
            });
            // Open popup for the matched coordinates (Optional, slightly complex in Leaflet without iterating layers)
        });

        listContainer.appendChild(li);
    });
}

// Init — load land mask first (needed for both visual clipping and land detection)
async function initApp() {
    await loadLandMask();
    await loadEarthquakes();
}
initApp();