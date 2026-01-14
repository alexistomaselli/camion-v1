
export type CargoType = 'homogénea' | 'específica';

export interface LocationDetails {
  name: string;
  description: string;
  customerName?: string;
  distanceFromRef?: string;
  travelTime?: string;
  mapsUri?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface GroundingSource {
  title?: string;
  uri?: string;
}

export interface AppState {
  hqLocation: LocationDetails | null;
  orders: LocationDetails[];
  optimizedRoute: string;
  isLoading: boolean;
  sources: GroundingSource[];
  cargoType: CargoType;
}
