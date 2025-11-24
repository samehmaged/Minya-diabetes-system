import { Patient, Visit } from '../types';

const PATIENTS_KEY = 'minya_diabetes_patients';
const VISITS_KEY = 'minya_diabetes_visits';

export const getPatients = (): Patient[] => {
  try {
    const data = localStorage.getItem(PATIENTS_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    // Safety check: Ensure result is an array
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Error parsing patients data, resetting storage", error);
    return [];
  }
};

export const savePatient = (patient: Patient) => {
  const patients = getPatients();
  patients.push(patient);
  localStorage.setItem(PATIENTS_KEY, JSON.stringify(patients));
};

export const getVisits = (): Visit[] => {
  try {
    const data = localStorage.getItem(VISITS_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    // Safety check: Ensure result is an array
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Error parsing visits data, resetting storage", error);
    return [];
  }
};

export const saveVisit = (visit: Visit) => {
  const visits = getVisits();
  visits.push(visit);
  localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
};

export const updateVisitStatus = (visitId: string, status: 'dispensed') => {
  const visits = getVisits();
  const index = visits.findIndex(v => v.id === visitId);
  if (index !== -1) {
    visits[index].status = status;
    localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
  }
};

export const getTodayVisits = (): Visit[] => {
  const today = new Date().toISOString().split('T')[0];
  return getVisits().filter(v => v.date === today);
};

export const getPatientHistory = (patientId: string): Visit[] => {
  return getVisits().filter(v => v.patientId === patientId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};