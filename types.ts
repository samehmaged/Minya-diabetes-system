export type Role = 'doctor' | 'pharmacist' | 'admin' | null;

export interface Patient {
  id: string;
  name: string;
  nationalId: string;
  age: number;
  gender: 'male' | 'female';
  registrationDate: string;
}

export interface Visit {
  id: string;
  patientId: string;
  date: string;
  diagnosis: string;
  medications: string[];
  referral?: string; // Clinic name
  doctorName: string;
  status: 'prescribed' | 'dispensed';
}

export interface ClinicStats {
  todayPatients: number;
  pendingPharmacy: number;
}