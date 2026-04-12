const BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';

export interface Vehicle {
  year: number;
  make: string;
  model: string;
  drivetrain: string;
  fuelType: string;
  url: string;
}

export interface VinInfo {
  ModelYear: string;
  Make: string;
  Model: string;
  DriveType: string;
  FuelTypePrimary: string;
  BodyClass: string;
}

export interface TowPic {
  label: string;
  images: string[];
}

export interface LockoutPicture {
  label: string;
  src: string;
}

export interface Lockout {
  difficultyLevel?: string;
  difficultyDesc?: string;
  pictures?: LockoutPicture[];
  warnings?: string;
  linkage?: string;
  openingInstructions?: string;
  cautions?: string;
}

export interface Procedure {
  title?: string;
  sections?: Record<string, string>;
  towPics?: TowPic[];
  lockout?: Lockout;
}

export async function decodeVin(vin: string): Promise<VinInfo> {
  const res = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`
  );
  if (!res.ok) throw new Error('VIN decode failed');
  const data = await res.json();
  return data.Results[0] as VinInfo;
}

export async function searchVehicles(
  year: number,
  make: string,
  model: string
): Promise<Vehicle[]> {
  const params = new URLSearchParams({ year: String(year), make, model });
  const res = await fetch(`${BASE}/api/search?${params}`);
  if (!res.ok) throw new Error('Vehicle search failed');
  return res.json();
}

export async function fetchProcedure(url: string): Promise<Procedure> {
  const res = await fetch(`${BASE}/api/procedure?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error('Procedure fetch failed');
  return res.json();
}
