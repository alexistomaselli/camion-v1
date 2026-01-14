
import React, { useState, useEffect } from 'react';
import { LocationDetails, GroundingSource, CargoType } from './types';
import { getOrderDetails, optimizeDeliveryRoute } from './services/geminiService';
import { PlaceCard } from './components/PlaceCard';
import { MapComponent } from './components/MapComponent';
import { AutocompleteInput } from './components/AutocompleteInput';

const STORAGE_KEYS = {
  HQ: 'aqua_hq_loc',
  ORDERS: 'aqua_orders_list',
  CARGO: 'aqua_cargo_type'
};

const App: React.FC = () => {
  const [hqInput, setHqInput] = useState('Alberdi 152, Tandil, Buenos Aires');
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
    if (!targetAddress) return;
    setIsLoading(true);
    try {
      const { details } = await getOrderDetails(targetAddress, targetAddress);
      setHqLocation(details);
      setHqInput(details.name);
      localStorage.setItem(STORAGE_KEYS.HQ, JSON.stringify(details));
      if (orders.length > 0) {
        const reordered = await reorderOrders(details, orders);
        setOrders(reordered);
      }
    } catch (error) {
      alert("Error al ubicar la base.");
    } finally { setIsLoading(false); }
  };

  const handleAddOrder = async (addressOverride?: string) => {
    const targetAddress = addressOverride || newOrderInput;
    if (!targetAddress || !hqLocation) return;
    setIsLoading(true);
    setNewOrderInput(''); 
    try {
      const { details } = await getOrderDetails(targetAddress, hqLocation.name);
      const newOrdersList = [...orders, details];
      const optimized = await reorderOrders(hqLocation, newOrdersList);
      setOrders(optimized);
      localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(optimized));
    } catch (error) {
      alert("Error al procesar pedido.");
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
        // AQUÍ PASAMOS LA LISTA COMPLETA DE ÓRDENES (CON KM Y TIEMPO OSRM) A LA IA
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
    <div className="min-h-screen bg-slate-50 selection:bg-cyan-100 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        <header className="mb-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-slate-900 p-3 rounded-2xl shadow-xl shadow-slate-200">
              <svg className="w-8 h-8 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tighter">AquaFlow <span className="text-cyan-600">Dispatch</span></h1>
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] leading-none mt-1">LOGÍSTICA URBANA DE ALTO RENDIMIENTO</p>
            </div>
          </div>
          <button 
            onClick={() => { localStorage.clear(); window.location.reload(); }}
            className="text-[10px] font-black text-slate-400 hover:text-red-500 transition-all border border-slate-200 px-3 py-1.5 rounded-lg"
          >
            SISTEMA REBOOT
          </button>
        </header>

        <main className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          <aside className="xl:col-span-4 space-y-6">
            <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Base Operativa</h2>
              <div className="flex gap-2">
                <AutocompleteInput
                  value={hqInput}
                  onChange={setHqInput}
                  onSelect={(val) => { setHqInput(val); handleSetHQ(val); }}
                  placeholder="Calle y altura, Ciudad..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none"
                />
                <button onClick={() => handleSetHQ()} disabled={isLoading} className="bg-slate-900 text-white px-5 rounded-2xl transition-all hover:bg-cyan-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/></svg>
                </button>
              </div>
              {hqLocation && (
                <div className="mt-4 p-4 bg-slate-900 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-300">
                   <div className="flex items-center gap-2 mb-2">
                     <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                     <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base fijada en mapa</span>
                   </div>
                   <p className="text-xs font-bold text-white leading-relaxed">{hqLocation.name}</p>
                </div>
              )}
            </section>

            <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Configuración de Carga</h2>
              <div 
                onClick={toggleCargoType}
                className="relative bg-slate-100 p-1 rounded-2xl cursor-pointer flex items-center transition-all border border-slate-200"
              >
                <div className={`absolute w-1/2 h-[calc(100%-8px)] bg-white rounded-xl shadow-sm border border-slate-100 transition-all duration-300 ${cargoType === 'específica' ? 'translate-x-full' : 'translate-x-0'}`}></div>
                <div className={`relative z-10 w-1/2 py-2 text-center text-[10px] font-black uppercase tracking-widest transition-colors ${cargoType === 'homogénea' ? 'text-slate-900' : 'text-slate-400'}`}>Bidones</div>
                <div className={`relative z-10 w-1/2 py-2 text-center text-[10px] font-black uppercase tracking-widest transition-colors ${cargoType === 'específica' ? 'text-slate-900' : 'text-slate-400'}`}>Paquetes</div>
              </div>
            </section>

            <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex justify-between items-center">
                <span>Entregas ({orders.length})</span>
                {orders.length > 0 && <span className="bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-lg text-[9px] font-black tracking-tighter uppercase">Ruta Activa</span>}
              </h2>
              <div className="flex gap-2 mb-6">
                <AutocompleteInput
                  value={newOrderInput}
                  context={hqLocation?.name}
                  onChange={setNewOrderInput}
                  onSelect={(val) => handleAddOrder(val)}
                  placeholder="Destino..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium outline-none"
                />
                <button onClick={() => handleAddOrder()} disabled={isLoading || !hqLocation} className="bg-cyan-600 text-white px-5 rounded-2xl shadow-lg shadow-cyan-100 flex-shrink-0"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg></button>
              </div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {orders.length === 0 ? (
                  <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-[2rem] opacity-40">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Añade puntos de entrega</p>
                  </div>
                ) : (
                  orders.map((order, i) => (
                    <div key={i} className="animate-in slide-in-from-left duration-200" style={{animationDelay: `${i*50}ms`}}>
                      <div className="flex items-center gap-2 mb-1 ml-1">
                         <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full"></span>
                         <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Parada #{i+1}</span>
                      </div>
                      <PlaceCard place={order} onRemove={(name) => setOrders(orders.filter(o => o.name !== name))} />
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>

          <div className="xl:col-span-8 space-y-6">
            <div className="rounded-[2.5rem] overflow-hidden shadow-xl border-4 border-white h-[450px] relative">
              <MapComponent reference={hqLocation} destinations={orders} />
              {(isLoading || isOptimizing) && (
                <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-xl shadow-lg flex items-center gap-3 z-[1001] border border-slate-100">
                  <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">IA Sincronizando...</span>
                </div>
              )}
            </div>

            <section className="bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden min-h-[400px] border border-slate-800">
              <div className="px-8 py-6 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></div>
                  <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Hoja de Despacho (Verificada)</h2>
                </div>
                <div className="text-[9px] font-black text-slate-500 border border-slate-700 px-3 py-1 rounded-full uppercase tracking-widest">
                  Perfil: {cargoType}
                </div>
              </div>
              
              <div className="p-8">
                {isOptimizing ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
                    <div className="w-32 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div className="w-1/2 h-full bg-cyan-500 animate-[loading_1.5s_infinite]"></div>
                    </div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">IA Validando Hoja Técnica...</p>
                  </div>
                ) : optimizedRouteText ? (
                  <div className="font-mono text-[13px] text-cyan-50 space-y-6">
                    {optimizedRouteText.split('\n').map((line, i) => {
                      const trimmed = line.trim();
                      if (!trimmed) return <div key={i} className="h-4"></div>;
                      const isTitle = trimmed.match(/^[0-9]\./) || trimmed.match(/^[A-Z\s]{4,}:$/) || trimmed.includes('CARGA') || trimmed.includes('LIFO') || trimmed.includes('LOGÍSTICA') || trimmed.includes('HOJA');
                      return (
                        <p key={i} className={`${isTitle ? 'text-cyan-400 font-black border-b border-slate-800 pb-2 mb-4 tracking-wider uppercase' : 'text-slate-300 pl-4 border-l-2 border-slate-800 py-1'}`}>
                          {trimmed.replace(/\*\*/g, '')}
                        </p>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-32 text-center opacity-20">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em]">Esperando datos operativos</p>
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
          100% { transform: translateX(200%); }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
