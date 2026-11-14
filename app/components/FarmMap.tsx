"use client";

import { useMemo } from "react";
import { Circle, MapContainer, Polygon, TileLayer, Tooltip, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";

type FarmMapProps = {
  activeField: number;
  onSelectField: (id: number) => void;
};

const fields = [
  { id: 1, name: "قطعة الطماطم", crop: "طماطم", center: [30.786, 30.997] as [number, number], coords: [[30.790,30.987],[30.793,31.002],[30.782,31.008],[30.778,30.992]] as [number,number][], color: "#b6ca75", area: "12.4 فدان" },
  { id: 2, name: "قطعة القمح", crop: "قمح", center: [30.799, 31.014] as [number, number], coords: [[30.806,31.006],[30.809,31.021],[30.797,31.026],[30.793,31.011]] as [number,number][], color: "#d9a85d", area: "8.2 فدان" },
  { id: 3, name: "قطعة الذرة", crop: "ذرة", center: [30.777, 31.019] as [number, number], coords: [[30.784,31.012],[30.788,31.027],[30.775,31.033],[30.770,31.017]] as [number,number][], color: "#8dbb9b", area: "6.7 فدان" },
];

export default function FarmMap({ activeField, onSelectField }: FarmMapProps) {
  const selected = useMemo(() => fields.find((field) => field.id === activeField) ?? fields[0], [activeField]);

  return (
    <div className="map-frame">
      <MapContainer center={[30.789, 31.009]} zoom={14} zoomControl={false} scrollWheelZoom className="farm-map">
        <ZoomControl position="bottomleft" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {fields.map((field) => (
          <Polygon
            key={field.id}
            positions={field.coords}
            pathOptions={{
              color: activeField === field.id ? "#f7fff0" : field.color,
              weight: activeField === field.id ? 3 : 2,
              fillColor: field.color,
              fillOpacity: activeField === field.id ? 0.48 : 0.24,
            }}
            eventHandlers={{ click: () => onSelectField(field.id) }}
          >
            <Tooltip direction="center" permanent={activeField === field.id}>
              <span>{field.name}</span>
            </Tooltip>
          </Polygon>
        ))}
        <Circle center={selected.center} radius={24} pathOptions={{ color: "#ffffff", fillColor: "#1c8060", fillOpacity: 1, weight: 3 }}>
          <Tooltip direction="top" permanent>{selected.crop} · {selected.area}</Tooltip>
        </Circle>
      </MapContainer>
      <div className="map-legend">
        <span><i className="legend-dot healthy" /> حالة جيدة</span>
        <span><i className="legend-dot watch" /> تحتاج متابعة</span>
      </div>
    </div>
  );
}
