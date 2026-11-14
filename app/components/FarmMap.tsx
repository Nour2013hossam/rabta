"use client";

import { useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
} from "react-leaflet";
import type { Map as LeafletMap, LatLngExpression } from "leaflet";
import { Check, LoaderCircle, Map as MapIcon, PencilLine, Satellite, Search, X } from "lucide-react";
import "leaflet/dist/leaflet.css";

export type FarmMapField = {
  id: number;
  name: string;
  crop: string;
  area: string;
  coords?: [number, number][];
};

type DetectedField = {
  osmId: number;
  name: string;
  crop: string;
  coords: [number, number][];
  areaFeddans: number;
};

type FarmMapProps = {
  activeField: number;
  fields: FarmMapField[];
  onSelectField: (id: number) => void;
  onCreateField: (
    coords: [number, number][],
    areaFeddans: number,
    name: string,
    crop: string
  ) => void;
  onNotify: (message: string) => void;
};

function MapBridge({ mapRef }: { mapRef: React.MutableRefObject<LeafletMap | null> }) {
  const map = useMap();

  useState(() => {
    mapRef.current = map;
    return null;
  });

  return null;
}

function MapClickHandler({
  drawing,
  onPoint,
}: {
  drawing: boolean;
  onPoint: (point: [number, number]) => void;
}) {
  const map = useMap();
  map.on("click", (event) => {
    if (drawing) {
      onPoint([event.latlng.lat, event.latlng.lng]);
    }
  });

  return null;
}

function calculateAreaInFeddans(coords: [number, number][]) {
  const earthRadius = 6378137;
  const radians = Math.PI / 180;
  let area = 0;

  for (let index = 0; index < coords.length; index += 1) {
    const current = coords[index];
    const next = coords[(index + 1) % coords.length];

    area +=
      (next[1] - current[1]) *
      radians *
      (2 +
        Math.sin(current[0] * radians) +
        Math.sin(next[0] * radians));
  }

  const squareMeters = Math.abs((area * earthRadius * earthRadius) / 2);
  return squareMeters / 4200.833;
}

function cropLabel(tags: Record<string, string>) {
  if (tags.crop) return tags.crop.replaceAll("_", " ");
  if (tags.landuse === "orchard") return "بستان";
  if (tags.landuse === "vineyard") return "كروم";
  if (tags.landuse === "greenhouse") return "صوبة زراعية";
  return "أرض زراعية";
}

function readableName(tags: Record<string, string>, id: number) {
  return tags.name || tags["name:ar"] || `أرض زراعية من OSM #${id}`;
}

export default function FarmMap({
  activeField,
  fields,
  onSelectField,
  onCreateField,
  onNotify,
}: FarmMapProps) {
  const mapRef = useRef<LeafletMap | null>(null);
  const [baseLayer, setBaseLayer] = useState<"satellite" | "street">("satellite");
  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectedFields, setDetectedFields] = useState<DetectedField[]>([]);
  const [selectedDetectedId, setSelectedDetectedId] = useState<number | null>(null);

  const mappedFields = fields.filter(
    (field): field is FarmMapField & { coords: [number, number][] } =>
      Array.isArray(field.coords) && field.coords.length >= 3
  );
  const selectedDetected = detectedFields.find(
    (field) => field.osmId === selectedDetectedId
  );

  const startDiscovery = async () => {
    const map = mapRef.current;
    if (!map) {
      onNotify("الخريطة لم تجهز بعد. حاول مرة أخرى.");
      return;
    }

    if (map.getZoom() < 13) {
      onNotify("قرّب الخريطة لمستوى 13 أو أكثر حتى يكون البحث دقيقًا.");
      return;
    }

    const bounds = map.getBounds();
    const south = bounds.getSouth().toFixed(6);
    const west = bounds.getWest().toFixed(6);
    const north = bounds.getNorth().toFixed(6);
    const east = bounds.getEast().toFixed(6);

    const query = `[out:json][timeout:25];way["landuse"~"^(farmland|orchard|vineyard|greenhouse)$"](${south},${west},${north},${east});out tags geom 80;`;

    setDetecting(true);
    setDetectedFields([]);
    setSelectedDetectedId(null);

    const endpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.private.coffee/api/interpreter",
    ];

    let lastError = "تعذر الوصول إلى خدمة بيانات الخرائط.";

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: new URLSearchParams({ data: query }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = (await response.json()) as {
          elements?: Array<{
            type: string;
            id: number;
            tags?: Record<string, string>;
            geometry?: Array<{ lat: number; lon: number }>;
          }>;
        };

        const candidates: DetectedField[] = (result.elements ?? [])
          .filter(
            (element) =>
              element.type === "way" &&
              Array.isArray(element.geometry) &&
              element.geometry.length >= 4
          )
          .map((element) => {
            const coords = element.geometry!.map(
              (point) => [point.lat, point.lon] as [number, number]
            );
            return {
              osmId: element.id,
              name: readableName(element.tags ?? {}, element.id),
              crop: cropLabel(element.tags ?? {}),
              coords,
              areaFeddans: calculateAreaInFeddans(coords),
            };
          })
          .filter((field) => Number.isFinite(field.areaFeddans) && field.areaFeddans > 0);

        setDetectedFields(candidates);
        if (candidates.length > 0) {
          setSelectedDetectedId(candidates[0].osmId);
          onNotify(`وجدنا ${candidates.length} حدود زراعية مسجلة في OpenStreetMap. راجعها قبل الحفظ.`);
        } else {
          onNotify("لم نجد حدودًا زراعية مسجلة في هذه المنطقة. جرّب تحريك الخريطة أو تكبيرها.");
        }
        setDetecting(false);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
      }
    }

    setDetecting(false);
    onNotify(`تعذر إكمال البحث عن الحقول: ${lastError}. حاول لاحقًا.`);
  };

  const finishDrawing = () => {
    if (draftPoints.length < 3) return;
    const areaFeddans = calculateAreaInFeddans(draftPoints);
    onCreateField(draftPoints, areaFeddans, `قطعة مرسومة ${fields.length + 1}`, "غير محدد");
    setDraftPoints([]);
    setDrawing(false);
  };

  const importDetectedField = () => {
    if (!selectedDetected) return;
    onCreateField(
      selectedDetected.coords,
      selectedDetected.areaFeddans,
      selectedDetected.name,
      selectedDetected.crop
    );
    setDetectedFields((current) =>
      current.filter((field) => field.osmId !== selectedDetected.osmId)
    );
    setSelectedDetectedId(null);
  };

  const cancelDrawing = () => {
    setDraftPoints([]);
    setDrawing(false);
  };

  const mapCenter: LatLngExpression = [30.789, 31.009];

  return (
    <div className="map-frame">
      <MapContainer
        center={mapCenter}
        zoom={14}
        zoomControl={false}
        doubleClickZoom={false}
        scrollWheelZoom
        className="farm-map"
      >
        <ZoomControl position="bottomleft" />
        <MapBridge mapRef={mapRef} />
        <MapClickHandler
          drawing={drawing}
          onPoint={(point) =>
            setDraftPoints((current) => [...current, point])
          }
        />

        {baseLayer === "satellite" ? (
          <TileLayer
            key="satellite"
            attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a> — Source: Esri, Maxar, Earthstar Geographics'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        ) : (
          <TileLayer
            key="street"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        )}

        {mappedFields.map((field) => (
          <Polygon
            key={field.id}
            positions={field.coords}
            pathOptions={{
              color: activeField === field.id ? "#f7fff0" : "#ffffff",
              weight: activeField === field.id ? 4 : 2,
              fillColor: activeField === field.id ? "#b6ca75" : "#88aa72",
              fillOpacity: activeField === field.id ? 0.4 : 0.2,
            }}
            eventHandlers={{
              click: () => {
                if (!drawing) onSelectField(field.id);
              },
            }}
          >
            <Tooltip direction="center" permanent={activeField === field.id}>
              <span>{field.name}</span>
            </Tooltip>
          </Polygon>
        ))}

        {detectedFields.map((field) => (
          <Polygon
            key={field.osmId}
            positions={field.coords}
            pathOptions={{
              color: selectedDetectedId === field.osmId ? "#ff9b42" : "#f3c078",
              weight: selectedDetectedId === field.osmId ? 4 : 2,
              dashArray: "6 5",
              fillColor: "#f3a64a",
              fillOpacity: selectedDetectedId === field.osmId ? 0.28 : 0.12,
            }}
            eventHandlers={{
              click: () => setSelectedDetectedId(field.osmId),
            }}
          >
            <Tooltip direction="center">
              <span>{field.name}</span>
            </Tooltip>
          </Polygon>
        ))}

        {draftPoints.length >= 2 && (
          <Polyline
            positions={draftPoints}
            pathOptions={{ color: "#f5a14b", weight: 3, dashArray: "7 7" }}
          />
        )}
        {draftPoints.length >= 3 && (
          <Polygon
            positions={draftPoints}
            pathOptions={{
              color: "#f5a14b",
              weight: 2,
              fillColor: "#f5a14b",
              fillOpacity: 0.18,
            }}
          />
        )}
        {draftPoints.map((point, index) => (
          <CircleMarker
            key={index}
            center={point}
            radius={5}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: "#e58a32",
              fillOpacity: 1,
            }}
          />
        ))}
      </MapContainer>

      <div className="map-search-chip">
        <Search size={14} />
        <span>حرّك الخريطة إلى أرضك أولًا</span>
      </div>

      <div className="map-layer-switch" aria-label="نوع الخريطة">
        <button
          type="button"
          className={baseLayer === "satellite" ? "selected" : ""}
          onClick={() => setBaseLayer("satellite")}
          title="صور الأقمار الصناعية"
        >
          <Satellite size={15} /><span>قمر صناعي</span>
        </button>
        <button
          type="button"
          className={baseLayer === "street" ? "selected" : ""}
          onClick={() => setBaseLayer("street")}
          title="خريطة الشوارع"
        >
          <MapIcon size={15} /><span>شوارع</span>
        </button>
      </div>

      <div className="map-discovery-tools">
        <button
          type="button"
          className="discover-button"
          onClick={startDiscovery}
          disabled={detecting}
        >
          {detecting ? <LoaderCircle size={15} className="spin" /> : <Satellite size={15} />}
          {detecting ? "جاري البحث..." : "اكتشف حقول المنطقة"}
        </button>
      </div>

      {detectedFields.length > 0 && (
        <div className="map-detection-panel">
          <div className="detection-title">
            <div>
              <b>حدود زراعية مرشحة</b>
              <small>{detectedFields.length} نتيجة من OpenStreetMap</small>
            </div>
            <button
              type="button"
              className="detection-close"
              onClick={() => {
                setDetectedFields([]);
                setSelectedDetectedId(null);
              }}
              aria-label="إغلاق نتائج الاكتشاف"
            >
              <X size={15} />
            </button>
          </div>
          <select
            value={selectedDetectedId ?? ""}
            onChange={(event) => setSelectedDetectedId(Number(event.target.value))}
          >
            {detectedFields.map((field) => (
              <option key={field.osmId} value={field.osmId}>
                {field.name} · {field.areaFeddans.toFixed(2)} فدان تقريبًا
              </option>
            ))}
          </select>
          {selectedDetected && (
            <div className="detection-meta">
              <span>{selectedDetected.crop}</span>
              <span>{selectedDetected.areaFeddans.toFixed(2)} فدان تقريبًا</span>
            </div>
          )}
          <button
            type="button"
            className="detection-save"
            disabled={!selectedDetected}
            onClick={importDetectedField}
          >
            <Check size={15} /> إضافة الحقل المحدد
          </button>
          <small className="detection-disclaimer">
            اقتراح مبني على حدود مرسومة في OpenStreetMap، وليس تحليلًا آليًا لصورة القمر الصناعي.
          </small>
        </div>
      )}

      <div className="map-drawing-tools">
        {!drawing ? (
          <button
            type="button"
            className="draw-start"
            onClick={() => {
              setDetectedFields([]);
              setDraftPoints([]);
              setDrawing(true);
            }}
          >
            <PencilLine size={15} /><span>ارسم حدود أرض</span>
          </button>
        ) : (
          <>
            <div className="drawing-hint">
              اضغط على الخريطة لإضافة نقاط الحدود ({draftPoints.length})
            </div>
            <button
              type="button"
              className="draw-save"
              disabled={draftPoints.length < 3}
              onClick={finishDrawing}
            >
              <Check size={15} /> حفظ الحدود
            </button>
            <button
              type="button"
              className="draw-cancel"
              onClick={cancelDrawing}
            >
              <X size={15} /> إلغاء
            </button>
          </>
        )}
      </div>

      <div className="map-legend">
        <span><i className="legend-dot healthy" /> حقل محفوظ</span>
        <span><i className="legend-dot watch" /> حدود مرشحة</span>
      </div>
    </div>
  );
}
