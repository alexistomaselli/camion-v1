
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
      contents: `Lista 5 direcciones reales para: "${query}"${contextStr}. Solo las direcciones postales.`,
      config: {
        tools: [{ googleMaps: {} }],
        systemInstruction: "Eres un buscador de direcciones preciso."
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
      contents: `Detalles logísticos y COORDENADAS para: "${address}". Base: "${hqLocation}". Formato COORDS: [lat, lng]`,
      config: {
        tools: [{ googleMaps: {} }],
        systemInstruction: "Analista logístico. Siempre incluye COORDS: [lat, lng]."
      },
    });

    const text = response.text || "";
    const coordsMatch = text.match(/COORDS:\s*\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]/i);
    let coordinates;
    if (coordsMatch) {
      coordinates = { lat: parseFloat(coordsMatch[1]), lng: parseFloat(coordsMatch[2]) };
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

  // Construimos una descripción técnica detallada para la IA basada en datos de OSRM
  const routeData = orders.map((o, i) => 
    `PARADA ${i+1}: ${o.name} (A ${o.distanceFromRef} y ${o.travelTime} desde el punto anterior)`
  ).join('\n');

  const contextPrompt = cargoType === 'homogénea' 
    ? "CARGA DE BIDONES (Agua/Soda): Producto idéntico. Priorizar velocidad de parada."
    : "CARGA DE PAQUETES: Items individuales. El orden de carga en el camión debe ser el inverso al de entrega (LIFO).";

  const prompt = `Actúa como Jefe de Logística. Genera la HOJA DE DESPACHO basada en estos DATOS REALES DE RUTA:
  BASE: "${hqName}"
  TIPO DE CARGA: ${contextPrompt}
  
  SECUENCIA CALCULADA POR GPS:
  ${routeData}

  INSTRUCCIONES:
  1. No inventes distancias, usa las proporcionadas.
  2. Usa Google Search para buscar "tráfico en Tandil" o incidentes en las calles mencionadas.
  3. Formato:
     - RESUMEN DE RUTA (Tiempos totales)
     - ORDEN DE ESTIBA (Instrucciones de carga en el vehículo)
     - ALERTAS DE CALLE (Basado en búsqueda real)`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "Eres un despachador logístico. No saludas. Vas directo a la información técnica."
      },
    });

    const text = response.text || "Error al procesar hoja de despacho.";
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources: GroundingSource[] = groundingChunks
      .filter(chunk => chunk.web)
      .map(chunk => ({ title: chunk.web?.title, uri: chunk.web?.uri }));

    return { routeDescription: text, sources };
  } catch (error) {
    return { routeDescription: "⚠️ Error en centro de mando.", sources: [] };
  }
};
