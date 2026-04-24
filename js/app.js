/* ======================================================================
   WMO Pilot Basins — app
   ====================================================================== */
(() => {
  "use strict";

  const COUNTRIES = window.COUNTRIES || [];
  const map = L.map("map", { zoomControl: true }).setView([0, 0], 2);

  map.createPane("lc").style.zIndex       = 300;
  map.createPane("density").style.zIndex  = 405;
  map.createPane("basin").style.zIndex    = 410;
  map.createPane("bldg").style.zIndex     = 430;
  map.createPane("boundary").style.zIndex = 440;

  const basemaps = {
    "Carto Light": L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 19, attribution: '&copy; <a href="https://carto.com">CARTO</a> &copy; OpenStreetMap contributors' }),
    "OpenStreetMap": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }),
    "Esri Imagery": L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Imagery: Esri, Maxar, Earthstar" }),
  };
  basemaps["Carto Light"].addTo(map);
  L.control.layers(basemaps, {}, { position: "bottomright", collapsed: true }).addTo(map);

  const STYLES = {
    boundary: { color: "#003E7E", weight: 2, fill: false, dashArray: "4 3", pane: "boundary" },
    basin:    { color: "#1E5AA0", weight: 2, fillColor: "#4F81BD", fillOpacity: 0.15, pane: "basin" },
    building: { color: "#7A2E2E", weight: 0.4, fillColor: "#B22222", fillOpacity: 0.6, pane: "bldg" },
  };

  const DENSITY_COLORS = ["#fff5f0","#fee0d2","#fcbba1","#fc9272","#fb6a4a","#ef3b2c","#cb181d","#a50f15","#67000d"];
  function densityColor(count, max) {
    if (!count) return "#00000000";
    const t = Math.log10(count + 1) / Math.log10(max + 1);
    const i = Math.min(DENSITY_COLORS.length - 1, Math.max(0, Math.floor(t * DENSITY_COLORS.length)));
    return DENSITY_COLORS[i];
  }

  let activeBase = "";
  let activeDownloads = {};
  const activeLayers = {};
  let activeBasinLayer = null;

  function clearLayers() {
    Object.values(activeLayers).forEach((l) => map.removeLayer(l));
    for (const k of Object.keys(activeLayers)) delete activeLayers[k];
    activeBasinLayer = null;
  }

  function buildSwitcher() {
    const nav = document.getElementById("country-switcher");
    nav.innerHTML = "";
    COUNTRIES.forEach((c) => {
      const b = document.createElement("button");
      b.innerHTML = c.name;
      b.dataset.code = c.code;
      if (!c.available) {
        b.classList.add("disabled");
        b.title = "Data not yet available";
      } else {
        b.addEventListener("click", () => selectCountry(c));
      }
      nav.appendChild(b);
    });
  }

  function setActiveButton(code) {
    document.querySelectorAll("#country-switcher button").forEach((b) => {
      b.classList.toggle("active", b.dataset.code === code);
    });
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(url + " -> HTTP " + r.status);
    return r.json();
  }

  async function selectCountry(c) {
    setActiveButton(c.code);
    document.getElementById("country-name").textContent = c.name;
    document.getElementById("country-blurb").textContent = c.blurb || "";

    clearLayers();
    document.getElementById("layer-list").innerHTML = "";
    document.getElementById("basin-list").innerHTML = "";
    document.getElementById("legend").innerHTML = "";
    document.getElementById("legend-section").classList.add("hidden");

    const base = (window.DATA_BASE || "data/") + c.folder + "/web/";
    activeBase = base;
    activeDownloads = {};

    let meta;
    try { meta = await fetchJSON(base + "meta.json"); }
    catch (e) { alert("Could not load data for " + c.name + ": " + e.message); return; }

    (meta.downloads || []).forEach((d) => { activeDownloads[d.basin_id] = d; });

    if (meta.bbox && meta.bbox.length === 4) {
      const [minx, miny, maxx, maxy] = meta.bbox;
      map.fitBounds([[miny, minx], [maxy, maxx]], { padding: [30, 30] });
    }

    // Land cover raster overlay
    if (meta.landcover && meta.landcover.file && meta.landcover.bounds) {
      try {
        const overlay = L.imageOverlay(base + meta.landcover.file, meta.landcover.bounds, { opacity: 0.65, pane: "lc" });
        activeLayers["landcover"] = overlay;
        overlay.addTo(map);
        addLayerToggle("landcover", "Land cover", true);
      } catch (e) { console.warn("landcover overlay failed:", e.message); }
    }

    // Vector layers (no roads)
    const layerDefs = [
      { key: "boundary", file: "country_boundary.geojson", label: "Country boundary", on: true,  style: STYLES.boundary },
      { key: "basins",   file: "basins.geojson",           label: "Pilot basins",     on: true,  style: STYLES.basin, interactive: true },
    ];
    for (const def of layerDefs) {
      if (!meta.files || !meta.files[def.file]) continue;
      if (meta.files[def.file] < 200) continue;
      try {
        const gj = await fetchJSON(base + def.file);
        if (!gj.features || !gj.features.length) continue;
        const layer = L.geoJSON(gj, {
          style: def.style,
          onEachFeature: def.interactive ? (feat, l) => attachPopup(def.key, feat, l) : null,
        });
        activeLayers[def.key] = layer;
        if (def.on) layer.addTo(map);
        if (def.key === "basins") activeBasinLayer = layer;
        addLayerToggle(def.key, def.label, def.on);
      } catch (e) { console.warn("Layer failed:", def.file, e.message); }
    }

    // Buildings - prefer density hex, else polygons under 5 MB
    if (meta.files && meta.files["buildings_density.geojson"] && meta.files["buildings_density.geojson"] > 200) {
      try {
        const gj = await fetchJSON(base + "buildings_density.geojson");
        if (gj.features && gj.features.length) {
          const maxCount = gj.features.reduce((m, f) => Math.max(m, f.properties.count || 0), 1);
          const layer = L.geoJSON(gj, {
            style: (f) => ({
              color: "#8B0000", weight: 0.4,
              fillColor: densityColor(f.properties.count, maxCount),
              fillOpacity: 0.75, pane: "density",
            }),
            onEachFeature: (f, l) => l.bindPopup("<strong>" + f.properties.count.toLocaleString() + "</strong> buildings"),
          });
          activeLayers["density"] = layer;
          layer.addTo(map);
          addLayerToggle("density", "Building density", true);
        }
      } catch (e) { console.warn("density load failed:", e.message); }
    } else if (meta.files && meta.files["buildings.geojson"] && meta.files["buildings.geojson"] > 200
               && meta.files["buildings.geojson"] < 5 * 1024 * 1024) {
      try {
        const gj = await fetchJSON(base + "buildings.geojson");
        if (gj.features && gj.features.length) {
          const layer = L.geoJSON(gj, { style: STYLES.building });
          activeLayers["buildings"] = layer;
          layer.addTo(map);
          addLayerToggle("buildings", "Buildings", true);
        }
      } catch (e) { console.warn("buildings failed:", e.message); }
    }

    renderBasinList(meta);
    renderLegend(meta);
  }

  function attachPopup(key, feat, l) {
    const p = feat.properties || {};
    if (key === "basins") {
      const name = p.display_name || p.basin_name || p.basin_id || "Basin";
      const bid = p.basin_id;
      let dlHtml = "";
      const dl = activeDownloads[bid];
      if (dl) {
        const base = activeBase;
        const kbg = (dl.geojson_size / 1024).toFixed(1);
        const kbz = (dl.zip_size / 1024).toFixed(1);
        dlHtml = '<div class="dl-row"><strong>Download:</strong> ' +
                 '<a href="' + base + '../' + dl.geojson + '" download>GeoJSON <span class="muted">(' + kbg + ' KB)</span></a> &middot; ' +
                 '<a href="' + base + '../' + dl.shapefile_zip + '" download>Shapefile <span class="muted">(' + kbz + ' KB)</span></a>' +
                 '</div>';
      }
      l.bindPopup(
        "<strong>" + (bid || "Basin") + "</strong> - " + name +
        "<br/>Area: <strong>" + (p.area_km2 != null ? p.area_km2 + " km&sup2;" : "-") + "</strong>" +
        dlHtml,
        { maxWidth: 320 }
      );
    }
  }

  function addLayerToggle(key, label, checked) {
    const li = document.createElement("li");
    const id = "lyr-" + key;
    li.innerHTML = '<input id="' + id + '" type="checkbox" ' + (checked ? "checked" : "") + '><label for="' + id + '">' + label + "</label>";
    li.querySelector("input").addEventListener("change", (e) => {
      const layer = activeLayers[key];
      if (!layer) return;
      if (e.target.checked) layer.addTo(map); else map.removeLayer(layer);
    });
    document.getElementById("layer-list").appendChild(li);
  }

  function renderBasinList(meta) {
    const ul = document.getElementById("basin-list");
    ul.innerHTML = "";
    (meta.basins || []).forEach((b) => {
      const li = document.createElement("li");
      const name = b.display_name || b.group_key || b.basin_name || "";
      li.innerHTML = '<span class="b-chip">' + b.basin_id + '</span>' +
                     '<span><div>' + name + '</div>' +
                     '<div class="b-sub">' + (b.area_km2 != null ? b.area_km2 + " km&sup2;" : "") + '</div></span>';
      li.addEventListener("click", () => zoomToBasin(b.basin_id));
      ul.appendChild(li);
    });
  }

  function zoomToBasin(basinId) {
    if (!activeBasinLayer) return;
    activeBasinLayer.eachLayer((l) => {
      const p = l.feature && l.feature.properties;
      if (p && p.basin_id === basinId) {
        map.fitBounds(l.getBounds(), { padding: [40, 40] });
        l.openPopup && l.openPopup();
      }
    });
  }

  function renderLegend(meta) {
    const ul = document.getElementById("legend");
    const section = document.getElementById("legend-section");
    const legend = (meta.landcover && meta.landcover.legend) || meta.landcover_legend || [];
    if (!legend.length) return;
    legend.forEach((c) => {
      const li = document.createElement("li");
      li.innerHTML = '<span class="swatch" style="background:' + c.color + '"></span>' + c.label;
      ul.appendChild(li);
    });
    section.classList.remove("hidden");
  }

  buildSwitcher();
  const first = COUNTRIES.find((c) => c.available);
  if (first) selectCountry(first);
  else map.setView([0, 0], 2);
})();
