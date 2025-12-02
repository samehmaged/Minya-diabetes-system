
export type Role = 'doctor' | 'pharmacist' | 'admin' | null;

export interface Patient {
  id: string;
  name: string;
  nationalId: string;
  age: number;
  gender: 'male' | 'female';
  registrationDate: string;
}

export interface MedicationItem {
  name: string;
  type: 'tablet' | 'insulin' | 'other';
  dosage: string;    // Strength e.g. 500mg
  units?: number;    // Specific for Insulin (e.g., 20 units)
  frequency: string; // e.g., "3 times daily"
  duration: string;  // e.g., "1 week"
  quantity: string;  // Formatted string (e.g., "2 Pens" or "21 Tabs")
  notes?: string;
}

export interface Visit {
  id: string;
  patientId: string;
  date: string;
  diagnosis: string;
  medications: MedicationItem[];
  referral?: string;
  doctorName: string;
  status: 'prescribed' | 'dispensed';
}

export interface ClinicStats {
  todayPatients: number;
  pendingPharmacy: number;
}
