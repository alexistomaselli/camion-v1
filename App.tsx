
import React, { useState, useEffect } from 'react';
import { LocationDetails, GroundingSource, CargoType } from './types';
import { getOrderDetails, optimizeDeliveryRoute } from './services/geminiService';
import { PlaceCard } from './components/PlaceCard';
import { MapComponent } from './components/MapComponent';
import { AutocompleteInput } from './components/AutocompleteInput';

const STORAGE_KEYS = {
  HQ: 'aqua_hq_loc_v2',
  ORDERS: 'aqua_orders_list_v2',
  CARGO: 'aqua_cargo_type_v2'
};

const App: React.FC = () => {
  // Estado inicial completamente vacío
  const [hqInput, setHqInput] = useState('');
  const [hqLocation, setHqLocation] = useState<LocationDetails | null>(null);
  const [orders, setOrders] = useState<LocationDetails[]>([]);
  const [cargoType, setCargoType] = useState<CargoType>('homogénea');
  const [newOrderInput, setNewOrderInput] = useState('');
  const [optimizedRouteText, setOptimizedRouteText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [sources, setSources] = useState<GroundingSource[]>([]);

  const getRouteStats = async (start: {lat: number, lng: number}, end: {lat: number, lng: number}) => {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=false`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.code === 'Ok' && data.routes.length > 0) {
        const dist = (data.routes[0].distance / 1000).toFixed(1);
        const dur = Math.round(data.routes[0].duration / 60);
        return { distance: `${dist} km`, time: dur >= 60 ? `${Math.floor(dur/60)}h ${dur%60}min` : `${dur} min` };
      }
    } catch (e) { console.error(e); }
    return { distance: "---", time: "---" };
  };

  const reorderOrders = async (base: LocationDetails, currentOrders: LocationDetails[]) => {
    if (!base.coordinates || currentOrders.length === 0) return currentOrders;
    
    let unvisited = [...currentOrders];
    let optimized: LocationDetails[] = [];
    let currentPos = base.coordinates;

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let minDist = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        if (!unvisited[i].coordinates) continue;
        const d = Math.sqrt(Math.pow(currentPos.lat - unvisited[i].coordinates!.lat, 2) + Math.pow(currentPos.lng - unvisited[i].coordinates!.lng, 2));
        if (d < minDist) {
          minDist = d;
          nearestIdx = i;
        }
      }

      const nextOrder = unvisited.splice(nearestIdx, 1)[0];
      const stats = nextOrder.coordinates ? await getRouteStats(currentPos, nextOrder.coordinates) : { distance: "---", time: "---" };
      optimized.push({ ...nextOrder, distanceFromRef: stats.distance, travelTime: stats.time });
      if (nextOrder.coordinates) currentPos = nextOrder.coordinates;
    }
    return optimized;
  };

  useEffect(() => {
    const savedHq = localStorage.getItem(STORAGE_KEYS.HQ);
    const savedOrders = localStorage.getItem(STORAGE_KEYS.ORDERS);
    const savedCargo = localStorage.getItem(STORAGE_KEYS.CARGO);
    if (savedHq) {
      const parsedHq = JSON.parse(savedHq);
      setHqLocation(parsedHq);
      setHqInput(parsedHq.name);
    }
    if (savedOrders) setOrders(JSON.parse(savedOrders));
    if (savedCargo) setCargoType(savedCargo as CargoType);
  }, []);

  const handleSetHQ = async (addressOverride?: string) => {
    const targetAddress = addressOverride || hqInput;
    if (!targetAddress || targetAddress.trim().length < 5) {
      alert("Por favor ingresa una dirección de base válida (ej: Alberdi 152, Tandil)");
      return;
    }
    setIsLoading(true);
    try {
      const { details } = await getOrderDetails(targetAddress, targetAddress);
      if (!details.coordinates) {
        throw new Error("No se pudieron extraer las coordenadas de la respuesta.");
      }
      
      setHqLocation(details);
      setHqInput(details.name);
      localStorage.setItem(STORAGE_KEYS.HQ, JSON.stringify(details));
      
      if (orders.length > 0) {
        const reordered = await reorderOrders(details, orders);
        setOrders(reordered);
      }
    } catch (error) {
      console.error(error);
      alert("Error crítico: No se obtuvo la ubicación geográfica. Intenta ser más específico con la dirección.");
    } finally { setIsLoading(false); }
  };

  const handleAddOrder = async (addressOverride?: string) => {
    const targetAddress = addressOverride || newOrderInput;
    if (!targetAddress || !hqLocation) {
      if (!hqLocation) alert("Primero debes establecer una Base Operativa.");
      return;
    }
    setIsLoading(true);
    setNewOrderInput(''); 
    try {
      const { details } = await getOrderDetails(targetAddress, hqLocation.name);
      const newOrdersList = [...orders, details];
      const optimized = await reorderOrders(hqLocation, newOrdersList);
      setOrders(optimized);
      localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(optimized));
    } catch (error) {
      alert("Error al procesar el punto de entrega.");
    } finally { setIsLoading(false); }
  };

  useEffect(() => {
    const updateRouteDescription = async () => {
      if (!hqLocation || orders.length === 0) {
        setOptimizedRouteText('');
        return;
      }
      setIsOptimizing(true);
      try {
        const { routeDescription, sources: s } = await optimizeDeliveryRoute(hqLocation.name, orders, cargoType);
        setOptimizedRouteText(routeDescription);
        setSources(s);
      } finally {
        setIsOptimizing(false);
      }
    };
    const debounce = setTimeout(updateRouteDescription, 1500);
    return () => clearTimeout(debounce);
  }, [orders, hqLocation, cargoType]);

  const toggleCargoType = () => {
    const next = cargoType === 'homogénea' ? 'específica' : 'homogénea';
    setCargoType(next);
    localStorage.setItem(STORAGE_KEYS.CARGO, next);
  };

  return (
    <div className="min-h-screen bg-slate-50 selection:bg-sky-100 pb-20 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        <header className="mb-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-slate-900 p-3.5 rounded-[1.5rem] shadow-2xl shadow-slate-200">
              <svg className="w-7 h-7 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tighter text-slate-900">AquaFlow <span className="text-sky-600">Dispatch</span></h1>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 leading-none mt-1">SISTEMA DE GESTIÓN LOGÍSTICA INTELIGENTE</p>
            </div>
          </div>
          <button 
            onClick={() => { localStorage.clear(); window.location.reload(); }}
            className="text-[10px] font-bold text-slate-400 hover:text-red-600 transition-all border border-slate-200 px-4 py-2 rounded-xl hover:bg-red-50"
          >
            REINICIAR MEMORIA
          </button>
        </header>

        <main className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          <aside className="xl:col-span-4 space-y-6">
            <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200/60">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base de Operaciones</h2>
                {!hqLocation && <span className="animate-pulse bg-amber-50 text-amber-600 px-2 py-1 rounded-lg text-[9px] font-black border border-amber-100">PENDIENTE</span>}
              </div>
              <div className="flex gap-2">
                <AutocompleteInput
                  value={hqInput}
                  onChange={setHqInput}
                  onSelect={(val) => { setHqInput(val); handleSetHQ(val); }}
                  placeholder="Ej: San Martín 450, Tandil..."
                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-sky-500 transition-all"
                />
                <button 
                  onClick={() => handleSetHQ()} 
                  disabled={isLoading} 
                  className={`bg-slate-900 text-white px-5 rounded-2xl transition-all shadow-lg ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-sky-600 active:scale-95'}`}
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                  )}
                </button>
              </div>
              {hqLocation && (
                <div className="mt-4 p-5 bg-slate-900 rounded-[1.5rem] animate-in slide-in-from-top-4 duration-300">
                   <div className="flex items-center gap-2 mb-2">
                     <span className="w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_12px_rgba(34,197,94,0.8)]"></span>
                     <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Punto de Referencia Activo</span>
                   </div>
                   <p className="text-xs font-bold text-white leading-relaxed">{hqLocation.name}</p>
                </div>
              )}
            </section>

            <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200/60">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Perfil Operativo</h2>
              <div 
                onClick={toggleCargoType}
                className="relative bg-slate-100 p-1.5 rounded-2xl cursor-pointer flex items-center transition-all border border-slate-200"
              >
                <div className={`absolute w-[calc(50%-6px)] h-[calc(100%-12px)] bg-white rounded-xl shadow-md border border-slate-100 transition-all duration-300 ${cargoType === 'específica' ? 'translate-x-full' : 'translate-x-0'}`}></div>
                <div className={`relative z-10 w-1/2 py-2 text-center text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${cargoType === 'homogénea' ? 'text-slate-900' : 'text-slate-400'}`}>Bidones</div>
                <div className={`relative z-10 w-1/2 py-2 text-center text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${cargoType === 'específica' ? 'text-slate-900' : 'text-slate-400'}`}>Paquetes</div>
              </div>
            </section>

            <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200/60">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex justify-between items-center">
                <span>Itinerario ({orders.length})</span>
                {orders.length > 0 && <span className="bg-sky-100 text-sky-700 px-2.5 py-1 rounded-lg text-[9px] font-black tracking-tighter uppercase">Ruta Activa</span>}
              </h2>
              <div className="flex gap-2 mb-6">
                <AutocompleteInput
                  value={newOrderInput}
                  context={hqLocation?.name}
                  onChange={setNewOrderInput}
                  onSelect={(val) => handleAddOrder(val)}
                  placeholder="Añadir parada..."
                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:border-sky-500 transition-all"
                />
                <button onClick={() => handleAddOrder()} disabled={isLoading || !hqLocation} className="bg-sky-600 text-white px-5 rounded-2xl shadow-lg shadow-sky-100 hover:bg-sky-700 transition-all flex-shrink-0 active:scale-95 disabled:opacity-20"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/></svg></button>
              </div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {orders.length === 0 ? (
                  <div className="py-16 text-center border-2 border-dashed border-slate-100 rounded-[2rem] opacity-30">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bandeja de paradas vacía</p>
                  </div>
                ) : (
                  orders.map((order, i) => (
                    <div key={i} className="animate-in slide-in-from-left duration-200" style={{animationDelay: `${i*50}ms`}}>
                      <div className="flex items-center gap-2 mb-1.5 ml-1">
                         <span className="w-1.5 h-1.5 bg-sky-500 rounded-full"></span>
                         <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nivel de Parada #{i+1}</span>
                      </div>
                      <PlaceCard place={order} onRemove={(name) => setOrders(orders.filter(o => o.name !== name))} />
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>

          <div className="xl:col-span-8 space-y-6">
            <div className="rounded-[3rem] overflow-hidden shadow-2xl border-[6px] border-white h-[480px] relative bg-slate-200 ring-1 ring-slate-200">
              <MapComponent reference={hqLocation} destinations={orders} />
              {(isLoading || isOptimizing) && (
                <div className="absolute top-6 right-6 bg-white/95 backdrop-blur-md px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 z-[1001] border border-slate-100 animate-in zoom-in duration-200">
                  <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Actualizando Geo-Datos</span>
                </div>
              )}
            </div>

            <section className="bg-slate-900 rounded-[3rem] shadow-2xl overflow-hidden min-h-[450px] border border-slate-800 ring-1 ring-white/5">
              <div className="px-10 py-7 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 backdrop-blur-sm sticky top-0 z-20">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 bg-sky-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(14,165,233,0.5)]"></div>
                  <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Hoja de Despacho Verificada</h2>
                </div>
                <div className="text-[9px] font-black text-slate-500 border border-slate-700 px-4 py-1.5 rounded-full uppercase tracking-widest">
                  {cargoType} MODE
                </div>
              </div>
              
              <div className="p-10">
                {isOptimizing ? (
                  <div className="flex flex-col items-center justify-center py-24 gap-6 opacity-40">
                    <div className="w-40 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div className="w-1/2 h-full bg-sky-500 animate-[loading_2s_infinite]"></div>
                    </div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">IA Analizando Factores de Ruta...</p>
                  </div>
                ) : optimizedRouteText ? (
                  <div className="font-mono text-[13px] text-sky-50/90 space-y-7 leading-relaxed">
                    {optimizedRouteText.split('\n').map((line, i) => {
                      const trimmed = line.trim();
                      if (!trimmed) return <div key={i} className="h-4"></div>;
                      const isTitle = trimmed.match(/^[0-9]\./) || trimmed.match(/^[A-Z\s]{4,}:$/) || trimmed.includes('CARGA') || trimmed.includes('LIFO') || trimmed.includes('LOGÍSTICA') || trimmed.includes('RUTA');
                      return (
                        <p key={i} className={`${isTitle ? 'text-sky-400 font-black border-b border-slate-800 pb-3 mb-5 tracking-wider uppercase' : 'text-slate-300 pl-5 border-l-2 border-slate-800 py-1 opacity-90'}`}>
                          {trimmed.replace(/\*\*/g, '')}
                        </p>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-40 text-center opacity-10">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.6em]">Consola de despacho en espera</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
      
      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        body { -webkit-font-smoothing: antialiased; }
      `}</style>
    </div>
  );
};

export default App;
