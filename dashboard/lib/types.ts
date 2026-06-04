export interface Pin {
  id: string;
  position: [number, number, number]; // normalized mesh coords
  flag: boolean;
  tds: number | null;
  label: string | null;
  explanation: string;
  macro: string;
  region: string;
}

export interface PinsDoc {
  session: string | null;
  pins: Pin[];
}

export interface DermaEvent {
  kind: string;
  ts: number;
  source: string;
  data: Record<string, unknown>;
}
