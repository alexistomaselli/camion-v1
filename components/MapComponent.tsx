
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
    } catch (e) {
      console.error("Error obteniendo ruta OSRM:", e);
    }
    return [[start.lat, start.lng], [end.lat, end.lng]];
  };

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapContainerRef.current) return;

    // Inicialización del mapa
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, { 
        zoomControl: false,
        attributionControl: false 
      }).setView([-34.60, -58.38], 12);
      
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
      }).addTo(mapRef.current);
      
      L.control.zoom({ position: 'topright' }).addTo(mapRef.current);

      // ResizeObserver para asegurar que Leaflet siempre ocupe el contenedor correctamente
      const resizeObserver = new ResizeObserver(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    const updateMapElements = async () => {
      // Limpieza profunda
      markersRef.current.forEach(m => m.remove());
      routesRef.current.forEach(r => r.remove());
      markersRef.current = [];
      routesRef.current = [];

      const bounds = L.latLngBounds([]);

      if (reference?.coordinates) {
        const hqIcon = L.divIcon({
          className: 'custom-marker-hq',
          html: `<div style="background:#0ea5e9;width:20px;height:20px;border-radius:50%;border:4px solid white;box-shadow:0 0 15px rgba(14,165,233,0.5)"></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        
        const hqMarker = L.marker([reference.coordinates.lat, reference.coordinates.lng], { icon: hqIcon })
          .addTo(mapRef.current)
          .bindPopup(`<b>BASE:</b><br>${reference.name}`);
        
        markersRef.current.push(hqMarker);
        bounds.extend([reference.coordinates.lat, reference.coordinates.lng]);

        let lastPos = reference.coordinates;
        for (let i = 0; i < destinations.length; i++) {
          const dest = destinations[i];
          if (dest.coordinates) {
            const destIcon = L.divIcon({
              className: 'custom-marker-dest',
              html: `<div style="background:#0f172a;color:white;width:24px;height:24px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;border:2px solid white;box-shadow:0 4px 6px rgba(0,0,0,0.1)">${i+1}</div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            });
            
            const m = L.marker([dest.coordinates.lat, dest.coordinates.lng], { icon: destIcon })
              .addTo(mapRef.current)
              .bindPopup(`<b>PARADA ${i+1}:</b><br>${dest.name}`);
            
            markersRef.current.push(m);
            bounds.extend([dest.coordinates.lat, dest.coordinates.lng]);

            const routePath = await fetchRoute(lastPos, dest.coordinates);
            const polyline = L.polyline(routePath, { 
              color: '#0ea5e9', 
              weight: 6, 
              opacity: 0.6,
              lineJoin: 'round',
              dashArray: '1, 12'
            }).addTo(mapRef.current);
            
            routesRef.current.push(polyline);
            lastPos = dest.coordinates;
          }
        }
      }

      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, { padding: [50, 50], animate: true });
      } else if (reference?.coordinates) {
        mapRef.current.setView([reference.coordinates.lat, reference.coordinates.lng], 16, { animate: true });
      }
      
      // Aseguramos que el mapa detecte su tamaño final después de que React actualice el DOM
      setTimeout(() => mapRef.current.invalidateSize(), 200);
    };

    updateMapElements();
  }, [reference, destinations]);

  return (
    <div className="w-full h-full relative overflow-hidden bg-slate-100">
      <div ref={mapContainerRef} className="w-full h-full z-10" />
      {!reference && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/10 backdrop-blur-[1px] pointer-events-none">
          <div className="bg-white/95 p-6 rounded-[2rem] shadow-2xl border border-white/50 flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
            </div>
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">
              Fija una Base Operativa para<br/>activar el seguimiento satelital
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
