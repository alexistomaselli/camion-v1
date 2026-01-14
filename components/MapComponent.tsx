
import React, { useEffect, useRef } from 'react';
import { LocationDetails } from '../types';

interface MapComponentProps {
  reference: LocationDetails | null;
  destinations: LocationDetails[];
}

export const MapComponent: React.FC<MapComponentProps> = ({ reference, destinations }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const routesRef = useRef<any[]>([]);

  const fetchRoute = async (start: { lat: number; lng: number }, end: { lat: number; lng: number }) => {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.code === 'Ok' && data.routes.length > 0) {
        return data.routes[0].geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
      }
    } catch (e) {}
    return [[start.lat, start.lng], [end.lat, end.lng]];
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, { zoomControl: false }).setView([-34.60, -58.38], 12);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO' }).addTo(mapRef.current);
    }

    const updateMap = async () => {
      markersRef.current.forEach(m => m.remove());
      routesRef.current.forEach(r => r.remove());
      markersRef.current = [];
      routesRef.current = [];

      const bounds = L.latLngBounds([]);

      if (reference?.coordinates) {
        const hqIcon = L.divIcon({
          className: 'hq-marker',
          html: `<div style="background:#0891b2;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 15px rgba(8,145,178,0.5)"></div>`,
          iconSize: [16, 16]
        });
        const m = L.marker([reference.coordinates.lat, reference.coordinates.lng], { icon: hqIcon }).addTo(mapRef.current);
        markersRef.current.push(m);
        bounds.extend([reference.coordinates.lat, reference.coordinates.lng]);

        let currentPos = reference.coordinates;
        for (let i = 0; i < destinations.length; i++) {
          const dest = destinations[i];
          if (dest.coordinates) {
            const destIcon = L.divIcon({
              className: 'dest-marker',
              html: `<div style="background:#1e293b;padding:2px 8px;border-radius:6px;color:white;font-size:10px;font-weight:900;border:1px solid white">${i+1}</div>`,
              iconSize: [24, 20]
            });
            const dm = L.marker([dest.coordinates.lat, dest.coordinates.lng], { icon: destIcon }).addTo(mapRef.current);
            markersRef.current.push(dm);
            bounds.extend([dest.coordinates.lat, dest.coordinates.lng]);

            const path = await fetchRoute(currentPos, dest.coordinates);
            const line = L.polyline(path, { color: '#0891b2', weight: 5, opacity: 0.5, dashArray: '5, 10' }).addTo(mapRef.current);
            routesRef.current.push(line);
            currentPos = dest.coordinates;
          }
        }
      }
      if (bounds.isValid()) mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    };

    updateMap();
  }, [reference, destinations]);

  return <div ref={mapContainerRef} className="w-full h-[500px]" />;
};
