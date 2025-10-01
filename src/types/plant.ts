export type LightLevel = 'low' | 'medium' | 'bright' | 'direct';
export type PlantState = 'ok' | 'thirsty' | 'overwatered' | 'repot-soon' | 'pest-risk';

export interface PlantRecord {
  id: number;
  userId: string;
  name: string;
  species?: string;
  location?: string;
  light?: LightLevel;
  notes?: string;
  photoUrl?: string;
  image_url?: string;

  water_interval_days?: number;

  last_watered_at?: string;
  next_water_due_at?: string;
  state?: PlantState;
  created_at?: string;
  updated_at?: string;
}

export interface PlantCareAnswer {
  answer: string;
  id: number;
  name: string;
  image_url?: string;
  imageUrl?: string;
  location?: string;
  question?: string;
}

export interface ApiOk<T> {
  ok: true;
  data: T;
}

export interface ApiErr {
  ok: false;
  error: string;
}

export type ApiResponse<T> = ApiOk<T> | ApiErr;
