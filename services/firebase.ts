
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, push, onValue, update, remove, get, child } from 'firebase/database';
import { Patient, Visit, AppUser } from '../types';

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

// Initialize Firebase
let db: any;

try {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (error) {
  console.error("Firebase initialization error.", error);
}

// --- Custom Authentication Operations (Database Based) ---

export const loginWithCredentials = async (username: string, password: string): Promise<AppUser | null> => {
  if (!db) return null;
  
  const dbRef = ref(db);
  const snapshot = await get(child(dbRef, `users`));
  
  // First, try to find the user in the database
  if (snapshot.exists()) {
    const users = snapshot.val();
    const userList = Object.values(users) as AppUser[];
    const foundUser = userList.find(u => u.username === username && u.password === password);
    if (foundUser) {
      return foundUser;
    }
  }
  
  // FAILSAFE: If user not found in DB, OR DB is empty,
  // ALWAYS allow the default admin credentials.
  if (username === 'admin' && password === 'admin') {
     return { id: 'temp-admin', name: 'System Admin', username: 'admin', password: 'admin', role: 'admin' };
  }

  return null;
};

// --- User Management Operations ---

export const subscribeToUsers = (callback: (users: AppUser[]) => void) => {
  if (!db) return () => {};
  const usersRef = ref(db, 'users');
  const unsubscribe = onValue(usersRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      callback(Object.values(data) as AppUser[]);
    } else {
      callback([]);
    }
  });
  return unsubscribe;
};

export const addUser = async (user: AppUser) => {
  if (!db) return;
  const userRef = ref(db, `users/${user.id}`);
  await set(userRef, user);
};

export const deleteUser = async (userId: string) => {
  if (!db) return;
  const userRef = ref(db, `users/${userId}`);
  await remove(userRef);
};


// --- Patients Operations ---

export const subscribeToPatients = (callback: (patients: Patient[]) => void) => {
  if (!db) return () => {};
  const patientsRef = ref(db, 'patients');
  
  const unsubscribe = onValue(patientsRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const patientList = Object.values(data) as Patient[];
      callback(patientList);
    } else {
      callback([]);
    }
  });

  return unsubscribe;
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
