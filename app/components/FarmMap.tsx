"use client";

import { useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMapEvents,
} from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import {
  Check,
  Layers,
  Map as MapIcon,
  PencilLine,
  Satellite,
  X,
} from "lucide-react";
import "leaflet/dist/leaflet.css";

export type FarmMapField = {
  id: number;
  name: string;
  crop: string;
  area: string;
  coords?: [number, number][];
};

type FarmMapProps = {
  activeField: number;
  fields: FarmMapField[];
  onSelectField: (id: number) => void;
  onCreateField: (coords: [number, number][], areaFeddans: number) => void;
};

function MapClickHandler({
  drawing,
  onPoint,
}: {
  drawing: boolean;
  onPoint: (point: [number, number]) => void;
}) {
  useMapEvents({
    click(event) {
      if (drawing) {
        onPoint([event.latlng.lat, event.latlng.lng]);
      }
    },
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

export default function FarmMap({
  activeField,
  fields,
  onSelectField,
  onCreateField,
}: FarmMapProps) {
  const [baseLayer, setBaseLayer] = useState<"satellite" | "street">("satellite");
  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);

  const mappedFields = fields.filter(
    (field): field is FarmMapField & { coords: [number, number][] } =>
      Array.isArray(field.coords) && field.coords.length >= 3
  );

  const finishDrawing = () => {
    if (draftPoints.length < 3) return;
    const areaFeddans = calculateAreaInFeddans(draftPoints);
    onCreateField(draftPoints, areaFeddans);
    setDraftPoints([]);
    setDrawing(false);
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

        <MapClickHandler
          drawing={drawing}
          onPoint={(point) =>
            setDraftPoints((current) => [...current, point])
          }
        />

        {mappedFields.map((field) => (
          <Polygon
            key={field.id}
            positions={field.coords}
            pathOptions={{
              color: activeField === field.id ? "#f7fff0" : "#ffffff",
              weight: activeField === field.id ? 4 : 2,
              fillColor:
                activeField === field.id ? "#b6ca75" : "#88aa72",
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

      <div className="map-layer-switch" aria-label="نوع الخريطة">
        <button
          type="button"
          className={baseLayer === "satellite" ? "selected" : ""}
          onClick={() => setBaseLayer("satellite")}
          title="صور الأقمار الصناعية"
        >
          <Satellite size={15} />
          <span>قمر صناعي</span>
        </button>
        <button
          type="button"
          className={baseLayer === "street" ? "selected" : ""}
          onClick={() => setBaseLayer("street")}
          title="خريطة الشوارع"
        >
          <MapIcon size={15} />
          <span>شوارع</span>
        </button>
      </div>

      <div className="map-drawing-tools">
        {!drawing ? (
          <button
            type="button"
            className="draw-start"
            onClick={() => {
              setDraftPoints([]);
              setDrawing(true);
            }}
          >
            <PencilLine size={15} />
            <span>ارسم حدود أرض</span>
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
              <Check size={15} />
              حفظ الحدود
            </button>
            <button
              type="button"
              className="draw-cancel"
              onClick={cancelDrawing}
            >
              <X size={15} />
              إلغاء
            </button>
          </>
        )}
      </div>

      <div className="map-legend">
        <span><i className="legend-dot healthy" /> حقل محدد</span>
        <span><i className="legend-dot watch" /> حقل آخر</span>
      </div>
    </div>
  );
}
