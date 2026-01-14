
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { LocationDetails, GroundingSource, CargoType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Obtiene sugerencias de direcciones basadas en una entrada parcial.
 */
export const getAddressSuggestions = async (query: string, context?: string): Promise<string[]> => {
  if (query.length < 3) return [];
  const contextStr = context ? ` en o cerca de ${context}` : "";
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Lista exactamente 5 direcciones postales reales que existan para la búsqueda: "${query}"${contextStr}. Solo devuelve las direcciones, una por línea.`,
      config: {
        tools: [{ googleMaps: {} }],
        systemInstruction: "Eres un motor de búsqueda de direcciones postales precisas."
      },
    });
    const text = response.text || "";
    return text.split('\n')
      .map(line => line.replace(/^[\d\s.\-*•]+/, '').trim())
      .filter(line => line.length > 5)
      .slice(0, 5);
  } catch (error) {
    return [];
  }
};

/**
 * Obtiene los detalles y coordenadas de una ubicación.
 */
export const getOrderDetails = async (
  address: string, 
  hqLocation: string
): Promise<{ details: LocationDetails; sources: GroundingSource[] }> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Proporciona las COORDENADAS GEOGRÁFICAS EXACTAS para la dirección: "${address}". 
      Responde siguiendo estrictamente este formato al final de tu respuesta:
      COORDS: [latitud, longitud]
      Ejemplo: COORDS: [-37.3214, -59.1345]`,
      config: {
        tools: [{ googleMaps: {} }],
        systemInstruction: "Eres un experto en geolocalización logística. Tu prioridad absoluta es encontrar la latitud y longitud exacta."
      },
    });

    const text = response.text || "";
    // Regex mejorada para capturar coordenadas con o sin corchetes, espacios y signos
    const coordsMatch = text.match(/COORDS:\s*\[?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]?/i);
    
    let coordinates;
    if (coordsMatch) {
      coordinates = { 
        lat: parseFloat(coordsMatch[1]), 
        lng: parseFloat(coordsMatch[2]) 
      };
    }

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources: GroundingSource[] = groundingChunks
      .filter(chunk => chunk.maps)
      .map(chunk => ({ title: chunk.maps?.title, uri: chunk.maps?.uri }));

    return {
      details: {
        name: address,
        description: text.split(/COORDS:/i)[0].trim(),
        mapsUri: sources[0]?.uri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
        coordinates
      },
      sources
    };
  } catch (error) {
    console.error("Error en getOrderDetails:", error);
    throw error;
  }
};

/**
 * Genera un plan de ruta utilizando los datos de OSRM y el conocimiento de la IA.
 */
export const optimizeDeliveryRoute = async (
  hqName: string,
  orders: LocationDetails[],
  cargoType: CargoType = 'homogénea'
): Promise<{ routeDescription: string; sources: GroundingSource[] }> => {
  if (orders.length === 0) return { routeDescription: "", sources: [] };

  const routeData = orders.map((o, i) => 
    `PARADA ${i+1}: ${o.name} (Distancia: ${o.distanceFromRef}, Tiempo estimado: ${o.travelTime})`
  ).join('\n');

  const contextPrompt = cargoType === 'homogénea' 
    ? "LOGÍSTICA DE BIDONES: Todos los productos son iguales. El tiempo de descarga es constante."
    : "LOGÍSTICA DE PAQUETES: Productos distintos. Cargar el camión en orden LIFO (Last In, First Out).";

  const prompt = `Genera una HOJA DE RUTA profesional para un conductor de reparto.
  BASE DE SALIDA: "${hqName}"
  CONFIGURACIÓN: ${contextPrompt}
  
  ITINERARIO CALCULADO:
  ${routeData}

  REQUISITOS DEL INFORME:
  - Estilo telegráfico y técnico.
  - Usa datos de Google Search para avisar sobre el tráfico actual en la zona de Tandil/Buenos Aires si es relevante.
  - Incluye una sección de 'CONSEJOS DE CARGA' basada en el tipo de producto.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "Eres un despachador de logística senior. Tu lenguaje es directo, profesional y enfocado a la eficiencia."
      },
    });

    const text = response.text || "No se pudo generar la hoja de despacho.";
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources: GroundingSource[] = groundingChunks
      .filter(chunk => chunk.web)
      .map(chunk => ({ title: chunk.web?.title, uri: chunk.web?.uri }));

    return { routeDescription: text, sources };
  } catch (error) {
    return { routeDescription: "⚠️ Error en la conexión con el centro de mando logístico.", sources: [] };
  }
};
