// Initialize Leaflet Map
const map = L.map('map', {
    zoomControl: false // Move it later or hide it for clean UI
}).setView([20, 0], 2);

// We won't use a base map tile layer for the ocean! The CSS background will provide the ocean color.

// 1. Pane for wave animations only (Bottom)
map.createPane('wavesPane');
map.getPane('wavesPane').style.zIndex = 250;

// 2. Pane for the solid land polygons (Middle)
map.createPane('landPane');
map.getPane('landPane').style.zIndex = 260;

// 3. Pane for CartoDB labels and borders (Top)
map.createPane('labelsPane');
map.getPane('labelsPane').style.zIndex = 270;
// Ensure we can click through the labels to drag the map or click markers
map.getPane('labelsPane').style.pointerEvents = 'none';

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
    pane: 'labelsPane'
}).addTo(map);

// Natural Earth 50m land polygons
const LAND_GEOJSON_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson';
let landGeoJSON = null;

async function loadLandMask() {
    try {
        const res = await fetch(LAND_GEOJSON_URL);
        landGeoJSON = await res.json();
        
        // Draw the solid land mass OVER the waves
        L.geoJSON(landGeoJSON, {
            style: {
                fillColor: '#2a2a2a', // Distinct medium-dark grey so landmasses are clearly visible against the black ocean
                fillOpacity: 1,
                stroke: false // Borders will be provided by the dark_only_labels tile layer!
            },
            pane: 'landPane',
            interactive: false
        }).addTo(map);
        
    } catch (e) {
        console.error('Land mask load error:', e);
    }
}

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
                tsunamiWarning = `<div style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">Inland earthquake</div>`;
            } else if (hasTsunami) {
                tsunamiWarning = `<div style="color:#ef4444;font-weight:bold;margin-top:4px;">Tsunami Warning</div><div style="font-size:0.75rem;color:#38bdf8;">Click to simulate waves</div>`;
            } else {
                tsunamiWarning = `<div style="font-size:0.75rem;color:#38bdf8;margin-top:4px;">Click to simulate waves</div>`;
            }
            
            marker.bindPopup(`
                <div class="popup-title">Magnitude ${mag.toFixed(1)}</div>
                <div style="font-size:0.8rem; margin-bottom:4px">Depth: ${depth.toFixed(1)} km</div>
                <div style="margin-bottom:8px">${feature.properties.place}</div>
                <div style="font-size:0.8rem; opacity:0.8">${time}</div>
                ${tsunamiWarning}
            `);

            return marker;
        }
    }).addTo(map);

    // Populate Sidebar List
    const validFeatures = features.filter(f => f.properties.mag !== null);
    
    // Sort by magnitude descending
    validFeatures.sort((a, b) => b.properties.mag - a.properties.mag);

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