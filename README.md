# WMO Urban Flood Forecasting — Pilot Basins

Static map site communicating the pilot basins of the WMO Phase‑2 urban flood
forecasting project. The live site is published via **GitHub Pages** and is
designed to be re-opened by funders and partners as a simple, fast reference.

Pilot basins currently included:

| Country                 | Pilot basins                                                                                      |
|-------------------------|---------------------------------------------------------------------------------------------------|
| Comoros                 | Ngazidja, Ndzuwani, Mwali                                                                         |
| Haiti                   | Griss River, Mapou River, La Quinte River                                                         |
| Guatemala               | Morales, Gualán, Santa Ines Petape, Panzós, Santa Catalina la Tinta, San Pedro Carchá, Cobán      |
| Antigua & Barbuda       | Antigua #1, Antigua #2, Barbuda                                                                   |
| Barbados                | Main pilot basin                                                                                  |

Each basin is clickable on the map — the pop-up includes a one-click
**GeoJSON** and **Shapefile (.zip)** download for partners.

## Layers

- Country boundary
- Pilot basins (interactive)
- Land cover (ESRI / IO Sentinel-2 10 m, 2024)
- Buildings (OSM / Overture, clipped to basins; density hex grid for very large basins)

## Repo layout

```
./
├── index.html             ← site root
├── css/style.css
├── js/app.js
├── data/
│   ├── comoros/{web,to_download}
│   ├── haiti/{web,to_download}
│   ├── gautilama/{web,to_download}        Guatemala
│   ├── antigua_barbuda/{web,to_download}
│   └── barbados/{web,to_download}
├── .nojekyll              ← tells GitHub Pages to serve files as-is (no Jekyll)
├── .gitignore
└── README.md
```

Each country's `web/` folder contains the GeoJSONs / PNG the website renders,
and `to_download/` contains per-basin packaged downloads (GeoJSON + Shapefile zip).

## Deploy on GitHub Pages

1. Push this repo to `main` (or upload files via GitHub Desktop).
2. On GitHub, go to **Settings → Pages**.
3. Under "Build and deployment", set
   - **Source:** *Deploy from a branch*
   - **Branch:** `main` / `/ (root)`
4. Save. Within a minute or two, the site is live at:
   **`https://ahwalab.github.io/WMO_pilote_basins/`**

## Local preview

```bash
python -m http.server 8000
# then open http://localhost:8000/
```

No build step, no dependencies. All GIS data is static files.

## Credits

- **Land cover:** Esri / Impact Observatory Sentinel-2 10 m Land Use / Land Cover (v03), 2024
- **Country boundaries:** GADM
- **Pilot basin polygons:** project hydrological delineations on 30 m DEM
- **Roads / buildings:** OpenStreetMap contributors, Overture Maps Foundation
- **Basemaps:** CARTO, OpenStreetMap, Esri World Imagery
