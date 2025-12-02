import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, push, onValue, update } from 'firebase/database';
import { getAnalytics } from "firebase/analytics";
import { Patient, Visit } from '../types';

// Configuration directly from the user
const firebaseConfig = {
  apiKey: "AIzaSyADZCmr_gzZcsKCsCCTgGQWuLZhBZKN_yM",
  authDomain: "minya-diabetes-system.firebaseapp.com",
  databaseURL: "https://minya-diabetes-system-default-rtdb.firebaseio.com",
  projectId: "minya-diabetes-system",
  storageBucket: "minya-diabetes-system.firebasestorage.app",
  messagingSenderId: "64553881904",
  appId: "1:64553881904:web:64df297e8199e8dbcd78f5",
  measurementId: "G-0SKVKEZM85"
};

// Initialize Firebase safely
let db: any;
try {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  // Initialize Analytics (optional, but good practice since config provided it)
  if (typeof window !== 'undefined') {
    getAnalytics(app);
  }
} catch (error) {
  console.error("Firebase initialization error.", error);
}

// --- Patients Operations ---

export const subscribeToPatients = (callback: (patients: Patient[]) => void) => {
  if (!db) return () => {};
  const patientsRef = ref(db, 'patients');
  
  const unsubscribe = onValue(patientsRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      // Convert object {id1: {...}, id2: {...}} to Array [{...}, {...}]
      const patientList = Object.values(data) as Patient[];
      callback(patientList);
    } else {
      callback([]);
    }
  });

  return unsubscribe; // Return function to stop listening
};

export const savePatient = async (patient: Patient) => {
  if (!db) return;
  const patientRef = ref(db, `patients/${patient.id}`);
  await set(patientRef, patient);
};

// --- Visits Operations ---

export const subscribeToVisits = (callback: (visits: Visit[]) => void) => {
  if (!db) return () => {};
  const visitsRef = ref(db, 'visits');

  const unsubscribe = onValue(visitsRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const visitList = Object.values(data) as Visit[];
      callback(visitList);
    } else {
      callback([]);
    }
  });

  return unsubscribe;
};

export const saveVisit = async (visit: Visit) => {
  if (!db) return;
  const visitRef = ref(db, `visits/${visit.id}`);
  await set(visitRef, visit);
};

export const updateVisitStatus = async (visitId: string, status: 'dispensed') => {
  if (!db) return;
  const visitRef = ref(db, `visits/${visitId}`);
  await update(visitRef, { status });
};