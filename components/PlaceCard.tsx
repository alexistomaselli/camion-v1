
import React from 'react';
import { LocationDetails } from '../types';

interface PlaceCardProps {
  place: LocationDetails;
  onRemove: (name: string) => void;
  isReference?: boolean;
}

export const PlaceCard: React.FC<PlaceCardProps> = ({ place, onRemove, isReference = false }) => {
  return (
    <div className={`group relative p-4 rounded-2xl border transition-all duration-300 break-words ${
      isReference 
        ? 'bg-slate-900 border-slate-800 text-white shadow-lg' 
        : 'bg-white border-slate-200 hover:border-cyan-400 hover:shadow-md'
    }`}>
      <div className="flex justify-between items-start gap-2 mb-1">
        <div className="min-w-0 flex-1">
          <h3 className={`font-black text-xs truncate leading-tight uppercase tracking-tight ${isReference ? 'text-cyan-400' : 'text-slate-900'}`}>
            {place.name}
          </h3>
          
          {!isReference && (
            <div className="flex items-center gap-2 mt-2">
              <div className="flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-1 rounded-lg border border-slate-200">
                <svg className="w-3 h-3 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                <span className="text-[10px] font-black">{place.distanceFromRef || "---"}</span>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-1 rounded-lg border border-slate-200">
                <svg className="w-3 h-3 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-[10px] font-black">{place.travelTime || "---"}</span>
              </div>
            </div>
          )}
        </div>
        
        {!isReference && (
          <button 
            onClick={() => onRemove(place.name)}
            className="flex-shrink-0 p-1 text-slate-300 hover:text-red-500 transition-colors"
            title="Quitar pedido"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
      
      {place.mapsUri && (
        <a 
          href={place.mapsUri} 
          target="_blank" 
          rel="noopener noreferrer"
          className={`mt-3 inline-flex items-center text-[9px] font-bold uppercase tracking-widest ${
            isReference ? 'text-cyan-400' : 'text-slate-400 hover:text-cyan-600'
          }`}
        >
          Ver mapa →
        </a>
      )}
    </div>
  );
};
