
import React, { useState, useEffect } from 'react';
import { 
  User, Stethoscope, Pill, Plus, Search, QrCode, 
  Printer, ArrowRight, CheckCircle, Activity,
  Database, Sparkles, Trash2, Calculator, List, Syringe, HeartPulse, Wifi, WifiOff, LogIn, Lock, Users, UserPlus, X
} from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { GoogleGenAI, Modality } from "@google/genai";
import { Layout } from './components/Layout';
import { QRCodeComponent } from './components/QRCodeComponent';
import { Role, Patient, Visit, MedicationItem, AppUser } from './types';
import { DIAGNOSES, MEDICATIONS, SPECIALIST_CLINICS, INSULIN_MEDS } from './constants';
import * as db from './services/firebase';

// --- Audio Helper Functions for Gemini TTS ---
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// Helper to generate safe IDs
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]); // List of all staff
  const [isConnected, setIsConnected] = useState(false);
  
  // Login State
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Doctor View State
  const [scanMode, setScanMode] = useState(false);
  const [showSimulatedScanner, setShowSimulatedScanner] = useState(false);
  const [currentPatient, setCurrentPatient] = useState<Patient | null>(null);
  const [diagnosis, setDiagnosis] = useState('');
  const [referral, setReferral] = useState('');
  
  // Advanced Medication State
  const [medList, setMedList] = useState<MedicationItem[]>([]);
  const [currentMed, setCurrentMed] = useState({
    name: '',
    type: 'tablet' as 'tablet' | 'insulin' | 'other',
    units: 0,
    freqTimes: 1,
    durationDays: 30 // Default to month for chronic
  });

  // AI State
  const [aiSummary, setAiSummary] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [audioSource, setAudioSource] = useState<AudioBufferSourceNode | null>(null);

  // Admin View State
  const [activeTab, setActiveTab] = useState<'patients' | 'users'>('patients');
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientId, setNewPatientId] = useState('');
  const [newPatientAge, setNewPatientAge] = useState('');
  const [printPatient, setPrintPatient] = useState<Patient | null>(null);
  
  // Admin User Management State
  const [newUser, setNewUser] = useState({ name: '', username: '', password: '', role: 'doctor' as Role });

  // Load data via Firebase Realtime Listeners
  useEffect(() => {
    // Subscribe to patients
    const unsubscribePatients = db.subscribeToPatients((data) => {
      setPatients(data);
      setIsConnected(true);
    });

    // Subscribe to visits
    const unsubscribeVisits = db.subscribeToVisits((data) => {
      setVisits(data);
    });

    // Subscribe to users (staff)
    const unsubscribeUsers = db.subscribeToUsers((data) => {
      setAppUsers(data);
    });

    return () => {
      unsubscribePatients();
      unsubscribeVisits();
      unsubscribeUsers();
    };
  }, []);

  // Clean up audio
  useEffect(() => {
    return () => {
      if (audioSource) audioSource.stop();
      if (audioContext) audioContext.close();
    };
  }, [currentPatient, user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const loggedUser = await db.loginWithCredentials(loginUsername, loginPassword);
      if (loggedUser) {
        setUser(loggedUser);
      } else {
        setLoginError('اسم المستخدم أو كلمة المرور غير صحيحة');
      }
    } catch (err) {
      setLoginError('حدث خطأ أثناء تسجيل الدخول');
    }
  };

  const handleLogout = async () => {
    setUser(null);
    setLoginUsername('');
    setLoginPassword('');
    if (audioSource) audioSource.stop();
  };

  const handleExportArchive = () => {
    const BOM = "\uFEFF";
    let csvContent = BOM + "VisitID,Date,PatientName,NationalID,Age,Diagnosis,Med_Name,Med_Type,Dosage_Units,Frequency,Duration,Calculated_Qty,Doctor,Status,Referral\n";

    visits.forEach(visit => {
      const patient = patients.find(p => p.id === visit.patientId);
      if (!patient) return;

      const medsArray = Array.isArray(visit.medications) ? visit.medications : [];
      
      if (medsArray.length === 0) {
         const row = [
          visit.id,
          visit.date,
          `"${patient.name}"`,
          `'${patient.nationalId}`,
          patient.age,
          `"${visit.diagnosis}"`,
          "None", "-", "-", "-", "-", "-",
          visit.doctorName,
          visit.status,
          visit.referral || "None"
        ].join(",");
        csvContent += row + "\n";
      } else {
        medsArray.forEach((med: any) => {
          const isObj = typeof med === 'object';
          const row = [
            visit.id,
            visit.date,
            `"${patient.name}"`,
            `'${patient.nationalId}`,
            patient.age,
            `"${visit.diagnosis}"`,
            `"${isObj ? med.name : med}"`,
            `"${isObj ? (med.type || 'tablet') : 'tablet'}"`,
            `"${isObj ? (med.units || '-') : '-'}"`,
            `"${isObj ? med.frequency : '-'}"`,
            `"${isObj ? med.duration : '-'}"`,
            `"${isObj ? med.quantity : '-'}"`,
            visit.doctorName,
            visit.status,
            visit.referral || "None"
          ].join(",");
          csvContent += row + "\n";
        });
      }
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Minya_Clinic_FULL_ARCHIVE_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- AI Functions ---
  const handleGenerateAISummary = async () => {
    if (!currentPatient || !process.env.API_KEY) {
      if (!process.env.API_KEY) alert("API Key is missing!");
      return;
    }

    setIsAiLoading(true);
    setAiSummary('');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const medNames = medList.map(m => `${m.name} (${m.quantity})`).join(', ');

      const promptText = `
        Patient: ${currentPatient.name}, Age: ${currentPatient.age}.
        Diagnosis: ${diagnosis}.
        Medications: ${medNames}.
        
        Provide a very short medical summary in Arabic (max 100 words).
        Mention if the insulin dose seems appropriate for age.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: promptText,
      });

      setAiSummary(response.text);
    } catch (error) {
      console.error("AI Error:", error);
      alert("Error connecting to AI Assistant");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleTextToSpeech = async () => {
    if (!aiSummary || !process.env.API_KEY) return;
    
    if (isPlayingAudio && audioSource) {
      audioSource.stop();
      setIsPlayingAudio(false);
      return;
    }

    try {
      setIsPlayingAudio(true);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: aiSummary }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
        setAudioContext(ctx);
        const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => setIsPlayingAudio(false);
        source.start();
        setAudioSource(source);
      } else {
        setIsPlayingAudio(false);
      }
    } catch (error) {
      setIsPlayingAudio(false);
    }
  };

  // --- Admin Functions ---
  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientName || !newPatientId) return;

    const patient: Patient = {
      id: generateId(),
      name: newPatientName,
      nationalId: newPatientId,
      age: Number(newPatientAge),
      gender: 'male',
      registrationDate: new Date().toISOString()
    };

    await db.savePatient(patient);
    setNewPatientName('');
    setNewPatientId('');
    setNewPatientAge('');
    setPrintPatient(patient);
    setTimeout(() => window.print(), 500);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.username || !newUser.password || !newUser.name) return;
    
    const userToSave: AppUser = {
      id: generateId(),
      name: newUser.name,
      username: newUser.username,
      password: newUser.password,
      role: newUser.role
    };

    await db.addUser(userToSave);
    setNewUser({ name: '', username: '', password: '', role: 'doctor' });
    alert('تم إضافة الموظف بنجاح');
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا الموظف؟')) {
      await db.deleteUser(userId);
    }
  };

  // --- Doctor Functions ---
  const handleScan = (result: any) => {
    if (result) {
      const scannedId = result[0]?.rawValue;
      const patient = patients.find(p => p.id === scannedId);
      if (patient) {
        setCurrentPatient(patient);
        setScanMode(false);
        setShowSimulatedScanner(false);
        setDiagnosis('');
        setMedList([]);
      }
    }
  };

  const handleSimulateSelect = (patient: Patient) => {
    setCurrentPatient(patient);
    setShowSimulatedScanner(false);
    setDiagnosis('');
    setMedList([]);
  };

  const handleMedNameChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    const isInsulin = INSULIN_MEDS.includes(name);
    setCurrentMed({
      ...currentMed,
      name,
      type: isInsulin ? 'insulin' : 'tablet',
      units: isInsulin ? 20 : 0, // default units
      freqTimes: 1,
      durationDays: 30
    });
  };

  const handleAddMedication = () => {
    if (!currentMed.name) return;
    
    let quantityStr = "";
    
    if (currentMed.type === 'insulin') {
      const totalUnits = currentMed.units * currentMed.freqTimes * currentMed.durationDays;
      const pens = Math.ceil(totalUnits / 300);
      quantityStr = `${pens} Pens (${totalUnits} units)`;
    } else {
      const totalTabs = currentMed.freqTimes * currentMed.durationDays;
      quantityStr = `${totalTabs} Tablets`;
    }

    const newItem: MedicationItem = {
      name: currentMed.name,
      type: currentMed.type,
      dosage: currentMed.type === 'insulin' ? `${currentMed.units} Units` : 'Standard',
      units: currentMed.units,
      frequency: `${currentMed.freqTimes} مرات يومياً`,
      duration: `${currentMed.durationDays} يوم`,
      quantity: quantityStr
    };

    setMedList(prev => [...prev, newItem]);
    setCurrentMed({ 
      name: '', 
      type: 'tablet', 
      units: 0, 
      freqTimes: 1, 
      durationDays: 30 
    });
  };

  const handlePrescribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPatient || !diagnosis) return;

    const visit: Visit = {
      id: generateId(),
      patientId: currentPatient.id,
      date: new Date().toISOString().split('T')[0],
      diagnosis,
      medications: medList,
      // Fix: Use null instead of undefined for Firebase compatibility
      referral: referral || null,
      doctorName: user?.name || "Doctor",
      status: 'prescribed'
    };

    await db.saveVisit(visit);
    alert('تم حفظ الكشف بنجاح! سيظهر الآن عند الصيدلي');
    setCurrentPatient(null);
    setMedList([]);
  };

  // --- VIEW RENDERING ---

  // 1. Initial State: Login Screen
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full relative">
          <div className="absolute top-2 left-2 flex items-center gap-1 text-xs text-gray-400">
             {isConnected ? <Wifi size={14} className="text-green-500" /> : <WifiOff size={14} className="text-red-500" />}
             {isConnected ? 'متصل' : 'جاري الاتصال...'}
          </div>
          <div className="mx-auto bg-teal-100 w-20 h-20 rounded-full flex items-center justify-center mb-6 text-teal-600">
            <HeartPulse size={40} />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 text-center mb-2">عيادة السكر</h1>
          <p className="text-gray-500 text-center mb-8">التأمين الصحي - فرع المنيا</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">اسم المستخدم</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={loginUsername} 
                  onChange={e => setLoginUsername(e.target.value)}
                  className="w-full p-3 pr-10 border rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                  placeholder="username"
                  required
                />
                <User className="absolute right-3 top-3 text-gray-400" size={20} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">كلمة المرور</label>
              <div className="relative">
                <input 
                  type="password" 
                  value={loginPassword} 
                  onChange={e => setLoginPassword(e.target.value)}
                  className="w-full p-3 pr-10 border rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                  placeholder="password"
                  required
                />
                <Lock className="absolute right-3 top-3 text-gray-400" size={20} />
              </div>
            </div>
            
            {loginError && <p className="text-red-500 text-sm text-center">{loginError}</p>}
            
            <button 
              type="submit"
              className="w-full bg-teal-600 text-white py-3 rounded-xl font-bold hover:bg-teal-700 transition-colors shadow-md flex items-center justify-center gap-2"
            >
              <LogIn size={20} /> تسجيل الدخول
            </button>
          </form>

          <div className="mt-8 bg-yellow-50 p-4 rounded-lg border border-yellow-200 text-xs text-gray-600">
            <p className="font-bold mb-1">لأول مرة؟</p>
            <p>اسم المستخدم: <span className="font-mono bg-white px-1 rounded">admin</span></p>
            <p>كلمة المرور: <span className="font-mono bg-white px-1 rounded">admin</span></p>
          </div>
        </div>
      </div>
    );
  }

  // Admin View
  if (user.role === 'admin') {
    return (
      <>
        {printPatient && (
           <div className="print-only fixed inset-0 bg-white z-[9999] flex items-center justify-center">
             <div className="text-center p-10 border-4 border-black rounded-xl w-full max-w-2xl mx-auto">
               <h1 className="text-4xl font-bold mb-4">بطاقة مريض سكر</h1>
               <QRCodeComponent value={printPatient.id} size={256} />
               <p className="text-4xl font-bold mt-4">{printPatient.name}</p>
             </div>
           </div>
        )}
        <Layout role="admin" onLogout={handleLogout} title={`لوحة التحكم - ${user.name}`}>
          <div className="flex gap-4 mb-6 border-b">
             <button 
               onClick={() => setActiveTab('patients')}
               className={`pb-2 px-4 font-bold flex items-center gap-2 ${activeTab === 'patients' ? 'text-teal-600 border-b-2 border-teal-600' : 'text-gray-500'}`}
             >
               <UserPlus size={18} /> الاستقبال وتسجيل المرضى
             </button>
             <button 
               onClick={() => setActiveTab('users')}
               className={`pb-2 px-4 font-bold flex items-center gap-2 ${activeTab === 'users' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
             >
               <Users size={18} /> إدارة الموظفين
             </button>
          </div>

          {activeTab === 'patients' ? (
            <div>
               <div className="mb-6 flex justify-end">
                <button onClick={handleExportArchive} className="flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-lg text-sm">
                  <Database size={16} /> تحميل أرشيف الحالات (CSV)
                </button>
              </div>
              <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-xl shadow-md border-t-4 border-teal-600">
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Plus size={24} className="text-teal-600" /> تسجيل مريض جديد
                  </h3>
                  <form onSubmit={handleAddPatient} className="space-y-4">
                    <input type="text" required value={newPatientName} onChange={e => setNewPatientName(e.target.value)} className="w-full p-3 border rounded-lg" placeholder="اسم المريض" />
                    <div className="grid grid-cols-2 gap-4">
                      <input type="text" required value={newPatientId} onChange={e => setNewPatientId(e.target.value)} className="w-full p-3 border rounded-lg" placeholder="رقم قومي" />
                      <input type="number" value={newPatientAge} onChange={e => setNewPatientAge(e.target.value)} className="w-full p-3 border rounded-lg" placeholder="السن" />
                    </div>
                    <button type="submit" className="w-full bg-teal-700 text-white py-3 rounded-lg font-bold">حفظ وطباعة</button>
                  </form>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-md">
                  <h3 className="text-xl font-bold mb-4">المرضى المسجلين</h3>
                  <div className="space-y-2 max-h-[400px] overflow-auto">
                    {patients.slice().reverse().map(p => (
                      <div key={p.id} className="flex justify-between p-3 bg-gray-50 rounded">
                        <div>
                          <p className="font-bold">{p.name}</p>
                          <p className="text-xs text-gray-500">{p.nationalId}</p>
                        </div>
                        <button onClick={() => { setPrintPatient(p); setTimeout(() => window.print(), 100); }}>
                          <Printer size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-8">
               <div className="bg-white p-6 rounded-xl shadow-md border-t-4 border-blue-600">
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <UserPlus size={24} className="text-blue-600" /> إضافة موظف جديد
                  </h3>
                  <form onSubmit={handleCreateUser} className="space-y-4">
                    <input type="text" required value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full p-3 border rounded-lg" placeholder="الاسم الكامل" />
                    <input type="text" required value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} className="w-full p-3 border rounded-lg" placeholder="اسم المستخدم (للدخول)" />
                    <input type="text" required value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="w-full p-3 border rounded-lg" placeholder="كلمة المرور" />
                    <select value={newUser.role || 'doctor'} onChange={e => setNewUser({...newUser, role: e.target.value as Role})} className="w-full p-3 border rounded-lg">
                      <option value="doctor">طبيب</option>
                      <option value="pharmacist">صيدلي</option>
                      <option value="admin">إداري / تمريض</option>
                    </select>
                    <button type="submit" className="w-full bg-blue-700 text-white py-3 rounded-lg font-bold">إضافة الموظف</button>
                  </form>
               </div>
               <div className="bg-white p-6 rounded-xl shadow-md">
                  <h3 className="text-xl font-bold mb-4">قائمة الموظفين</h3>
                  <div className="space-y-2 max-h-[400px] overflow-auto">
                    {appUsers.length === 0 && <p className="text-gray-500 text-center py-4">لا يوجد موظفين مسجلين</p>}
                    {appUsers.map(u => (
                      <div key={u.id} className="flex justify-between items-center p-3 bg-gray-50 rounded border hover:bg-gray-100">
                        <div>
                          <p className="font-bold flex items-center gap-2">
                             {u.role === 'admin' && <User size={14} className="text-purple-500" />}
                             {u.role === 'doctor' && <Stethoscope size={14} className="text-teal-500" />}
                             {u.role === 'pharmacist' && <Pill size={14} className="text-blue-500" />}
                             {u.name}
                          </p>
                          <p className="text-xs text-gray-500">username: {u.username} | pass: {u.password}</p>
                        </div>
                        {u.username !== 'admin' && (
                          <button onClick={() => handleDeleteUser(u.id)} className="text-red-500 hover:bg-red-50 p-2 rounded">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
               </div>
            </div>
          )}
        </Layout>
      </>
    );
  }

  // Doctor View
  if (user.role === 'doctor') {
    if (scanMode) {
      return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center text-white">
          <button onClick={() => setScanMode(false)} className="absolute top-4 left-4 z-50 bg-red-600 px-4 py-2 rounded-full font-bold">إغلاق (X)</button>
          <div className="w-full max-w-md aspect-square relative border-4 border-teal-500 rounded-xl overflow-hidden">
             <Scanner onScan={handleScan} />
          </div>
        </div>
      );
    }
    if (showSimulatedScanner) {
      return (
        <Layout role="doctor" onLogout={handleLogout} title="محاكاة المسح">
          <div className="max-w-xl mx-auto bg-white p-6 rounded-xl shadow">
            <h3 className="font-bold mb-4">اختر مريضاً:</h3>
            <div className="space-y-2">
              {patients.map(p => (
                <button key={p.id} onClick={() => handleSimulateSelect(p)} className="w-full text-right p-3 hover:bg-teal-50 border rounded flex justify-between">
                  <span>{p.name}</span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
            <button onClick={() => setShowSimulatedScanner(false)} className="mt-4 text-red-500">إلغاء</button>
          </div>
        </Layout>
      );
    }
    if (currentPatient) {
      return (
        <Layout role="doctor" onLogout={handleLogout} title={`د. ${user.name}`}>
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-6 rounded-xl shadow border">
                <h2 className="text-xl font-bold text-center mb-2">{currentPatient.name}</h2>
                <p className="text-center text-gray-500 mb-4">{currentPatient.nationalId} | {currentPatient.age} سنة</p>
                <div className="bg-indigo-50 p-4 rounded-lg">
                  <h3 className="font-bold text-indigo-900 mb-2 flex items-center gap-2"><Sparkles size={16}/> AI Assistant</h3>
                  {!aiSummary ? (
                    <button onClick={handleGenerateAISummary} disabled={isAiLoading} className="w-full bg-indigo-600 text-white py-2 rounded text-sm">
                      {isAiLoading ? 'جاري التحليل...' : 'تحليل الحالة'}
                    </button>
                  ) : (
                    <div className="text-sm space-y-2">
                      <p>{aiSummary}</p>
                      <button onClick={handleTextToSpeech} className="text-indigo-700 font-bold text-xs">{isPlayingAudio ? 'إيقاف' : 'استماع'}</button>
                    </div>
                  )}
                </div>
                <button onClick={() => setCurrentPatient(null)} className="w-full mt-4 py-2 border rounded text-gray-600">إنهاء</button>
              </div>
            </div>

            <div className="lg:col-span-2">
              <form onSubmit={handlePrescribe} className="bg-white p-6 rounded-xl shadow border">
                <div className="mb-6">
                  <label className="block font-bold mb-2">التشخيص</label>
                  <select value={diagnosis} onChange={e => setDiagnosis(e.target.value)} className="w-full p-3 border rounded bg-gray-50" required>
                    <option value="">-- اختر --</option>
                    {DIAGNOSES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                <div className="mb-6 p-4 bg-gray-50 rounded-xl border">
                  <label className="block font-bold mb-4 flex items-center gap-2">
                    <Pill size={18} className="text-blue-600" /> وصف العلاج (Smart Dosage)
                  </label>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="md:col-span-2">
                      <label className="text-xs text-gray-500">الدواء</label>
                      <select value={currentMed.name} onChange={handleMedNameChange} className="w-full p-2 border rounded">
                        <option value="">-- اختر --</option>
                        {MEDICATIONS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>

                    {currentMed.type === 'insulin' ? (
                      <div className="bg-red-50 p-2 rounded border border-red-100 col-span-2 md:col-span-1">
                        <label className="text-xs text-red-600 font-bold block mb-1">جرعة الأنسولين (Units)</label>
                        <div className="flex items-center gap-2">
                           <Syringe size={16} className="text-red-500" />
                           <input type="number" value={currentMed.units} onChange={e => setCurrentMed({...currentMed, units: Number(e.target.value)})} className="w-full p-1 border rounded" />
                        </div>
                      </div>
                    ) : (
                      <div className="col-span-2 md:col-span-1">
                        <label className="text-xs text-gray-500 block mb-1">التكرار (مرات يومياً)</label>
                        <input type="number" value={currentMed.freqTimes} onChange={e => setCurrentMed({...currentMed, freqTimes: Number(e.target.value)})} className="w-full p-2 border rounded" />
                      </div>
                    )}
                    
                    <div className="col-span-2 md:col-span-1">
                      <label className="text-xs text-gray-500 block mb-1">المدة (أيام)</label>
                      <input type="number" value={currentMed.durationDays} onChange={e => setCurrentMed({...currentMed, durationDays: Number(e.target.value)})} className="w-full p-2 border rounded" />
                    </div>
                  </div>

                  <button type="button" onClick={handleAddMedication} className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700">
                    <Plus size={16} className="inline mr-1" /> إضافة
                  </button>

                  <div className="mt-4 space-y-2">
                    {medList.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border">
                        <div>
                          <p className="font-bold">{item.name}</p>
                          <p className="text-xs text-gray-500">
                            {item.type === 'insulin' ? `${item.units} Units` : item.frequency} | {item.quantity}
                          </p>
                        </div>
                        <button type="button" onClick={() => setMedList(prev => prev.filter((_, i) => i !== idx))} className="text-red-500">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block font-bold mb-2">تحويل إلى <span className="text-xs font-normal text-gray-500">(اختياري)</span></label>
                  <select value={referral} onChange={e => setReferral(e.target.value)} className="w-full p-3 border rounded bg-gray-50">
                    <option value="">لا يوجد تحويل</option>
                    {SPECIALIST_CLINICS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <button type="submit" className="w-full bg-teal-600 text-white py-3 rounded-xl font-bold">حفظ الكشف</button>
              </form>
            </div>
          </div>
        </Layout>
      );
    }
    return (
      <Layout role="doctor" onLogout={handleLogout} title={`بوابة الطبيب (${user.name})`}>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
          <div className="bg-teal-50 p-6 rounded-full"><QrCode size={64} className="text-teal-600"/></div>
          <div className="flex gap-4 w-full max-w-lg">
            <button onClick={() => setScanMode(true)} className="flex-1 bg-teal-600 text-white py-6 rounded-xl font-bold shadow hover:bg-teal-700">كاميرا QR</button>
            <button onClick={() => setShowSimulatedScanner(true)} className="flex-1 bg-white text-teal-700 border-2 border-teal-600 py-6 rounded-xl font-bold hover:bg-teal-50">اختيار يدوي</button>
          </div>
        </div>
      </Layout>
    );
  }

  // Pharmacist View
  if (user.role === 'pharmacist') {
    const todayVisits = visits.filter(v => v.date === new Date().toISOString().split('T')[0]).reverse();
    return (
      <Layout role="pharmacist" onLogout={handleLogout} title={`الصيدلية (${user.name})`}>
        <div className="space-y-4">
          {todayVisits.length === 0 && <p className="text-center text-gray-500 py-10">لا توجد وصفات طبية اليوم</p>}
          {todayVisits.map(visit => {
            const patient = patients.find(p => p.id === visit.patientId);
            if (!patient) return null;
            return (
              <div key={visit.id} className={`bg-white rounded-xl shadow p-6 border-l-4 ${visit.status === 'dispensed' ? 'border-gray-300 opacity-60' : 'border-blue-500'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg">{patient.name}</h3>
                    <div className="flex items-center gap-2 mb-2">
                       <span className="text-xs bg-gray-100 px-2 py-1 rounded">د. {visit.doctorName}</span>
                    </div>
                    <p className="text-gray-500 text-sm mb-3">التشخيص: {visit.diagnosis}</p>
                    <div className="space-y-2">
                       {visit.medications.map((med, idx) => (
                         <div key={idx} className="flex items-center gap-2 text-sm bg-gray-50 p-2 rounded">
                           <Pill size={14} className="text-blue-500" />
                           <span className="font-bold">{med.name}</span>
                           <span className="text-gray-400">|</span>
                           <span className="text-blue-700 font-bold">{med.quantity}</span>
                           {med.type === 'insulin' && <span className="text-xs text-red-500">({med.units} Units)</span>}
                         </div>
                       ))}
                    </div>
                  </div>
                  {visit.status !== 'dispensed' && (
                    <button onClick={() => { db.updateVisitStatus(visit.id, 'dispensed'); }} className="bg-blue-600 text-white px-4 py-2 rounded font-bold text-sm">
                      صرف
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Layout>
    );
  }

  return null;
}