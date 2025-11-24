import React, { useState, useEffect } from 'react';
import { 
  User, Stethoscope, Pill, Plus, Search, QrCode, 
  Printer, ArrowRight, CheckCircle, AlertCircle, FileText, HeartPulse, Activity,
  Download, Database, Sparkles, Volume2, StopCircle
} from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";
import { Layout } from './components/Layout';
import { QRCodeComponent } from './components/QRCodeComponent';
import { Role, Patient, Visit } from './types';
import { DIAGNOSES, MEDICATIONS, SPECIALIST_CLINICS } from './constants';
import * as db from './services/storage';

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

// Helper to generate safe IDs without relying on crypto.randomUUID
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

function App() {
  const [role, setRole] = useState<Role>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  
  // Doctor View State
  const [scanMode, setScanMode] = useState(false);
  const [currentPatient, setCurrentPatient] = useState<Patient | null>(null);
  const [diagnosis, setDiagnosis] = useState('');
  const [selectedMeds, setSelectedMeds] = useState<string[]>([]);
  const [referral, setReferral] = useState('');

  // AI State
  const [aiSummary, setAiSummary] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [audioSource, setAudioSource] = useState<AudioBufferSourceNode | null>(null);

  // Admin View State
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientId, setNewPatientId] = useState('');
  const [newPatientAge, setNewPatientAge] = useState('');
  const [printPatient, setPrintPatient] = useState<Patient | null>(null);

  // Load data on mount
  useEffect(() => {
    setPatients(db.getPatients());
    setVisits(db.getVisits());
  }, [role]);

  // Clean up audio on unmount or patient change
  useEffect(() => {
    return () => {
      if (audioSource) {
        audioSource.stop();
      }
      if (audioContext) {
        audioContext.close();
      }
    };
  }, [currentPatient, role]);

  const handleLogin = (selectedRole: Role) => {
    setRole(selectedRole);
    setScanMode(false);
    setCurrentPatient(null);
    setAiSummary('');
  };

  const handleLogout = () => {
    setRole(null);
    if (audioSource) audioSource.stop();
  };

  const handleExportData = () => {
    const data = {
      exportDate: new Date().toISOString(),
      patients: db.getPatients(),
      visits: db.getVisits()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Minya_Diabetes_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
      
      const promptText = `
        You are a senior medical consultant specializing in Diabetes (Endocrinology).
        Analyze the following patient case and provide a response in Arabic.
        
        Patient Data:
        - Name: ${currentPatient.name}
        - Age: ${currentPatient.age}
        - Current Diagnosis: ${diagnosis || 'Not selected yet'}
        - Prescribed Medications: ${selectedMeds.length > 0 ? selectedMeds.join(', ') : 'None'}
        - Referral: ${referral || 'None'}

        Please provide:
        1. A brief medical summary and opinion on the treatment plan.
        2. Three key lifestyle tips specific to this patient's age and diagnosis.
        3. Any potential drug interactions or precautions if multiple meds are selected.
        
        Keep the tone professional yet empathetic.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: promptText,
      });

      setAiSummary(response.text);
    } catch (error) {
      console.error("AI Error:", error);
      alert("حدث خطأ أثناء الاتصال بالذكاء الاصطناعي");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleTextToSpeech = async () => {
    if (!aiSummary || !process.env.API_KEY) return;
    
    // Stop previous audio if playing
    if (isPlayingAudio && audioSource) {
      audioSource.stop();
      setIsPlayingAudio(false);
      return;
    }

    try {
      setIsPlayingAudio(true);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // We want the model to read the summary
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
        
        const audioBuffer = await decodeAudioData(
          decode(base64Audio),
          ctx,
          24000,
          1,
        );
        
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
      console.error("TTS Error:", error);
      setIsPlayingAudio(false);
      alert("حدث خطأ أثناء تشغيل الصوت");
    }
  };

  // --- Admin Functions ---
  const handleAddPatient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientName || !newPatientId) return;

    const patient: Patient = {
      id: generateId(), // Unique ID for QR
      name: newPatientName,
      nationalId: newPatientId,
      age: Number(newPatientAge),
      gender: 'male', // Simplified for demo
      registrationDate: new Date().toISOString()
    };

    db.savePatient(patient);
    setPatients(prev => [...prev, patient]);
    setNewPatientName('');
    setNewPatientId('');
    setNewPatientAge('');
    setPrintPatient(patient); // Show print view immediately
    
    // Auto print trigger (simulated)
    setTimeout(() => {
      window.print();
    }, 500);
  };

  // --- Doctor Functions ---
  const simulateScan = (patientId: string) => {
    const patient = patients.find(p => p.id === patientId);
    if (patient) {
      setCurrentPatient(patient);
      setScanMode(false);
      // Reset form
      setDiagnosis('');
      setSelectedMeds([]);
      setReferral('');
      setAiSummary('');
    }
  };

  const handlePrescribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPatient || !diagnosis) return;

    const visit: Visit = {
      id: generateId(),
      patientId: currentPatient.id,
      date: new Date().toISOString().split('T')[0],
      diagnosis,
      medications: selectedMeds,
      referral: referral || undefined,
      doctorName: "Dr. Current User",
      status: 'prescribed'
    };

    db.saveVisit(visit);
    setVisits(prev => [...prev, visit]);
    alert('تم حفظ الكشف بنجاح');
    setCurrentPatient(null); // Return to dashboard
    setAiSummary('');
  };

  const toggleMedication = (med: string) => {
    if (selectedMeds.includes(med)) {
      setSelectedMeds(prev => prev.filter(m => m !== med));
    } else {
      setSelectedMeds(prev => [...prev, med]);
    }
  };

  // --- Pharmacist Functions ---
  const handleDispense = (visitId: string) => {
    db.updateVisitStatus(visitId, 'dispensed');
    setVisits(prev => prev.map(v => v.id === visitId ? { ...v, status: 'dispensed' } : v));
  };

  // --- RENDER VIEWS ---

  if (!role) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <div className="mx-auto bg-teal-100 w-20 h-20 rounded-full flex items-center justify-center mb-6 text-teal-600">
            <HeartPulse size={40} />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">عيادة السكر</h1>
          <p className="text-gray-500 mb-8">التأمين الصحي - فرع المنيا</p>
          
          <div className="space-y-4">
            <button onClick={() => handleLogin('doctor')} className="w-full flex items-center justify-between p-4 bg-white border-2 border-teal-500 rounded-xl hover:bg-teal-50 transition-colors group">
              <span className="font-bold text-lg text-teal-700">دخول طبيب</span>
              <Stethoscope className="text-teal-500 group-hover:scale-110 transition-transform" />
            </button>
            <button onClick={() => handleLogin('pharmacist')} className="w-full flex items-center justify-between p-4 bg-white border-2 border-blue-500 rounded-xl hover:bg-blue-50 transition-colors group">
              <span className="font-bold text-lg text-blue-700">دخول صيدلي</span>
              <Pill className="text-blue-500 group-hover:scale-110 transition-transform" />
            </button>
            <button onClick={() => handleLogin('admin')} className="w-full flex items-center justify-between p-4 bg-white border-2 border-purple-500 rounded-xl hover:bg-purple-50 transition-colors group">
              <span className="font-bold text-lg text-purple-700">دخول استقبال / تمريض</span>
              <User className="text-purple-500 group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- ADMIN DASHBOARD ---
  if (role === 'admin') {
    return (
      <>
        {/* Print Overlay - Only rendered when printPatient exists */}
        {printPatient && (
          <div className="print-only fixed inset-0 bg-white z-[9999] flex items-center justify-center">
            <div className="text-center p-10 border-4 border-black rounded-xl w-full max-w-2xl mx-auto">
              <h1 className="text-4xl font-bold mb-4">بطاقة مريض سكر</h1>
              <h2 className="text-2xl mb-8">فرع المنيا - التأمين الصحي</h2>
              <div className="flex justify-center mb-8">
                <div className="border-4 border-gray-800 p-4 rounded-xl">
                  <QRCodeComponent value={printPatient.id} size={256} />
                </div>
              </div>
              <p className="text-4xl font-bold mb-4">{printPatient.name}</p>
              <p className="text-2xl mb-4">رقم قومي: {printPatient.nationalId}</p>
              <p className="text-2xl">السن: {printPatient.age}</p>
              <p className="text-xl mt-8 text-gray-600 border-t pt-4">يرجى الاحتفاظ بهذا الكود للكشف والصرف</p>
            </div>
          </div>
        )}

        <Layout role="admin" onLogout={handleLogout} title="مكتب الاستقبال - تسجيل المرضى">
          {/* Export Button */}
          <div className="mb-6 flex justify-end no-print">
            <button 
              onClick={handleExportData}
              className="flex items-center gap-2 bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded-lg shadow-md transition-colors text-sm"
            >
              <Download size={16} />
              تصدير قاعدة البيانات (Backup)
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Registration Form */}
            <div className="bg-white p-6 rounded-xl shadow-md border-t-4 border-teal-600">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-800">
                <div className="bg-teal-100 p-2 rounded-lg">
                  <Plus size={24} className="text-teal-600" />
                </div>
                تسجيل مريض جديد
              </h3>
              <form onSubmit={handleAddPatient} className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">اسم المريض (رباعي)</label>
                  <input 
                    type="text" 
                    required
                    value={newPatientName}
                    onChange={(e) => setNewPatientName(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
                    placeholder="اكتب الاسم هنا..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">الرقم القومي</label>
                    <input 
                      type="text" 
                      required
                      value={newPatientId}
                      onChange={(e) => setNewPatientId(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                      placeholder="14 رقم"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">السن</label>
                    <input 
                      type="number" 
                      value={newPatientAge}
                      onChange={(e) => setNewPatientAge(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                      placeholder="سنة"
                    />
                  </div>
                </div>
                <button type="submit" className="w-full bg-teal-700 text-white py-4 rounded-xl hover:bg-teal-800 font-bold text-lg shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2">
                  <QrCode size={24} />
                  حفظ وطباعة الكارت (QR)
                </button>
              </form>
            </div>

            {/* Recent Patients List */}
            <div className="bg-white p-6 rounded-xl shadow-md border-t-4 border-gray-600">
              <h3 className="text-xl font-bold mb-6 text-gray-800 flex items-center justify-between">
                <span>المرضى المسجلين اليوم</span>
                <Database size={20} className="text-gray-400" />
              </h3>
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                {Array.isArray(patients) && patients.length === 0 ? (
                  <div className="text-center py-10 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                    <User size={48} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500 font-medium">لم يتم تسجيل مرضى اليوم</p>
                    <p className="text-xs text-gray-400 mt-1">ابدأ بتسجيل البيانات في النموذج المجاور</p>
                  </div>
                ) : (
                  Array.isArray(patients) && patients.slice().reverse().map(patient => (
                    <div key={patient.id} className="flex items-center justify-between p-4 bg-gray-50 hover:bg-teal-50 border border-gray-200 rounded-xl transition-colors group">
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-teal-700 font-bold shadow-sm">
                           {patient.name ? patient.name.charAt(0) : '?'}
                         </div>
                         <div>
                            <p className="font-bold text-gray-800">{patient.name}</p>
                            <p className="text-xs text-gray-500 font-mono">{patient.nationalId}</p>
                         </div>
                      </div>
                      <button 
                        onClick={() => { setPrintPatient(patient); setTimeout(() => window.print(), 100); }}
                        className="p-2 bg-white text-gray-600 hover:text-teal-700 hover:bg-teal-100 rounded-lg border border-gray-200 transition-all shadow-sm"
                        title="طباعة الكارت"
                      >
                        <Printer size={20} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </Layout>
      </>
    );
  }

  // --- DOCTOR DASHBOARD ---
  if (role === 'doctor') {
    if (scanMode) {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-95 z-50 flex flex-col items-center justify-center text-white p-4">
          <div className="max-w-md w-full bg-gray-900 rounded-2xl p-6 relative">
             <button 
              onClick={() => setScanMode(false)}
              className="absolute top-4 left-4 text-gray-400 hover:text-white"
            >
              إلغاء
            </button>
            <div className="text-center mb-6">
              <QrCode size={48} className="mx-auto mb-4 text-teal-400 animate-pulse" />
              <h2 className="text-xl font-bold">المسح الضوئي للكود</h2>
              <p className="text-gray-400 text-sm mt-2">قم بتوجيه الكاميرا نحو QR Code المريض</p>
            </div>

            {/* Camera Simulation View */}
            <div className="aspect-square bg-gray-800 rounded-lg mb-6 relative overflow-hidden flex items-center justify-center border-2 border-teal-500">
               <div className="absolute inset-0 border-t-4 border-l-4 border-teal-500 w-16 h-16 top-4 left-4"></div>
               <div className="absolute inset-0 border-t-4 border-r-4 border-teal-500 w-16 h-16 top-4 right-4"></div>
               <div className="absolute inset-0 border-b-4 border-l-4 border-teal-500 w-16 h-16 bottom-4 left-4"></div>
               <div className="absolute inset-0 border-b-4 border-r-4 border-teal-500 w-16 h-16 bottom-4 right-4"></div>
               <p className="text-gray-500 animate-bounce">جاري البحث...</p>
            </div>

            {/* Fallback List for Demo */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-bold text-gray-400 mb-2">اختر مريض (محاكاة المسح):</h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {patients.map(p => (
                  <button 
                    key={p.id}
                    onClick={() => simulateScan(p.id)}
                    className="w-full text-right p-2 bg-gray-700 hover:bg-teal-600 rounded flex justify-between items-center transition-colors"
                  >
                    <span>{p.name}</span>
                    <ArrowRight size={14} />
                  </button>
                ))}
                 {patients.length === 0 && <p className="text-xs text-red-400">لا يوجد مرضى مسجلين. الرجاء التسجيل من حساب الادمن.</p>}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (currentPatient) {
      return (
        <Layout role="doctor" onLogout={handleLogout} title="تشخيص وعلاج المريض">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Patient Info Card */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex flex-col items-center mb-6">
                   <div className="w-20 h-20 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center text-2xl font-bold mb-3">
                     {currentPatient.name ? currentPatient.name.charAt(0) : '?'}
                   </div>
                   <h2 className="text-xl font-bold text-center">{currentPatient.name}</h2>
                   <p className="text-gray-500">{currentPatient.nationalId}</p>
                </div>
                
                <div className="space-y-3 text-sm border-t pt-4">
                   <div className="flex justify-between">
                     <span className="text-gray-500">العمر:</span>
                     <span className="font-semibold">{currentPatient.age} سنة</span>
                   </div>
                   <div className="flex justify-between">
                     <span className="text-gray-500">اخر زيارة:</span>
                     <span className="font-semibold">اليوم</span>
                   </div>
                </div>

                <button 
                  onClick={() => setCurrentPatient(null)}
                  className="w-full mt-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
                >
                  إلغاء / مريض آخر
                </button>
              </div>

              {/* AI Assistant Card */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-5 rounded-xl border border-indigo-100 shadow-sm">
                <h3 className="font-bold text-indigo-900 mb-3 flex items-center gap-2">
                  <Sparkles size={18} className="text-indigo-600" />
                  مساعد الذكاء الاصطناعي
                </h3>
                <p className="text-xs text-indigo-700 mb-4 opacity-80">
                  احصل على ملخص للحالة ورأي طبي مقترح بناءً على التشخيص والعلاج.
                </p>
                
                {!aiSummary ? (
                   <button 
                    onClick={handleGenerateAISummary}
                    disabled={isAiLoading}
                    className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isAiLoading ? 'جاري التحليل...' : 'طلب استشارة AI'}
                  </button>
                ) : (
                  <div className="space-y-3 animate-in fade-in zoom-in duration-300">
                    <div className="bg-white/80 p-3 rounded-lg text-sm text-gray-800 max-h-60 overflow-y-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                      {aiSummary}
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={handleTextToSpeech}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-colors ${isPlayingAudio ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}
                      >
                        {isPlayingAudio ? <><StopCircle size={14}/> إيقاف</> : <><Volume2 size={14}/> استماع</>}
                      </button>
                       <button 
                        onClick={handleGenerateAISummary}
                        className="flex-1 bg-white border border-indigo-200 text-indigo-600 py-2 rounded-lg text-xs font-bold hover:bg-indigo-50"
                      >
                        تحديث
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Diagnosis Form */}
            <div className="lg:col-span-2 space-y-6">
              <form onSubmit={handlePrescribe} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                
                {/* 1. Diagnosis */}
                <div className="mb-6">
                  <label className="block font-bold text-gray-700 mb-2 flex items-center gap-2">
                    <Activity size={18} className="text-teal-600" />
                    التشخيص الطبي
                  </label>
                  <select 
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    className="w-full p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-teal-500 outline-none"
                    required
                  >
                    <option value="">-- اختر التشخيص --</option>
                    {DIAGNOSES.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Medications */}
                <div className="mb-6">
                   <label className="block font-bold text-gray-700 mb-2 flex items-center gap-2">
                    <Pill size={18} className="text-blue-600" />
                    العلاج (الأدوية)
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-gray-50 p-4 rounded-lg max-h-60 overflow-y-auto border">
                    {MEDICATIONS.map(med => (
                      <label key={med} className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${selectedMeds.includes(med) ? 'bg-blue-100 border-blue-200' : 'hover:bg-gray-100'}`}>
                        <input 
                          type="checkbox" 
                          checked={selectedMeds.includes(med)}
                          onChange={() => toggleMedication(med)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-sm font-medium">{med}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 3. Referrals */}
                <div className="mb-8">
                  <label className="block font-bold text-gray-700 mb-2 flex items-center gap-2">
                    <ArrowRight size={18} className="text-purple-600" />
                    تحويل لعيادة تخصصية (اختياري)
                  </label>
                   <select 
                    value={referral}
                    onChange={(e) => setReferral(e.target.value)}
                    className="w-full p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-purple-500 outline-none"
                  >
                    <option value="">لا يوجد تحويل</option>
                    {SPECIALIST_CLINICS.map(clinic => (
                      <option key={clinic} value={clinic}>{clinic}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-4">
                  <button type="submit" className="flex-1 bg-teal-600 text-white py-3 rounded-xl hover:bg-teal-700 font-bold shadow-lg shadow-teal-100 flex items-center justify-center gap-2">
                    <CheckCircle size={20} />
                    حفظ وإنهاء الكشف
                  </button>
                </div>

              </form>
            </div>
          </div>
        </Layout>
      );
    }

    // Default Doctor Dashboard (Scan Prompt)
    return (
      <Layout role="doctor" onLogout={handleLogout} title="عيادة السكر - الطبيب">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="bg-teal-50 p-8 rounded-full mb-6 animate-pulse">
            <QrCode size={64} className="text-teal-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-800 mb-4">جاهز لاستقبال المريض التالي؟</h2>
          <p className="text-gray-500 max-w-md mb-8">قم بمسح QR Code الخاص بالمريض للدخول إلى ملفه الطبي، كتابة التشخيص، وصرف العلاج.</p>
          <button 
            onClick={() => setScanMode(true)}
            className="bg-teal-600 text-white px-10 py-4 rounded-2xl text-xl font-bold hover:bg-teal-700 hover:scale-105 transition-all shadow-xl shadow-teal-200 flex items-center gap-3"
          >
            <Search size={24} />
            مسح كود المريض (Scan QR)
          </button>
        </div>
      </Layout>
    );
  }

  // --- PHARMACIST DASHBOARD ---
  if (role === 'pharmacist') {
    const todayVisits = visits.filter(v => v.date === new Date().toISOString().split('T')[0]).reverse();

    return (
      <Layout role="pharmacist" onLogout={handleLogout} title="صيدلية العيادة - صرف العلاج">
         <div className="space-y-4">
           {todayVisits.length === 0 && (
             <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
               <Pill size={48} className="mx-auto text-gray-300 mb-4" />
               <h3 className="text-xl text-gray-400">لا توجد وصفات طبية اليوم حتى الآن</h3>
             </div>
           )}

           {todayVisits.map(visit => {
             const patient = patients.find(p => p.id === visit.patientId);
             if (!patient) return null;
             const isDispensed = visit.status === 'dispensed';

             return (
               <div key={visit.id} className={`bg-white rounded-xl shadow-sm border p-6 transition-all ${isDispensed ? 'opacity-60 border-gray-200' : 'border-l-4 border-l-blue-500'}`}>
                 <div className="flex flex-col md:flex-row justify-between gap-4">
                   <div>
                     <div className="flex items-center gap-3 mb-2">
                       <h3 className="text-xl font-bold text-gray-800">{patient.name}</h3>
                       {isDispensed ? (
                         <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-bold flex items-center gap-1">
                           <CheckCircle size={12} /> تم الصرف
                         </span>
                       ) : (
                         <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-bold flex items-center gap-1">
                           <AlertCircle size={12} /> بانتظار التحضير
                         </span>
                       )}
                     </div>
                     <p className="text-gray-500 text-sm mb-4">التشخيص: {visit.diagnosis}</p>
                     
                     <div className="space-y-1">
                       {visit.medications.map((med, idx) => (
                         <div key={idx} className="flex items-center gap-2 text-gray-700 font-medium">
                           <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                           {med}
                         </div>
                       ))}
                       {visit.medications.length === 0 && <span className="text-gray-400 italic">لا يوجد أدوية</span>}
                     </div>
                   </div>

                   <div className="flex flex-col justify-between items-end gap-4">
                     <div className="text-left text-sm text-gray-400">
                       <p>{visit.date}</p>
                       <p>{visit.doctorName}</p>
                     </div>
                     {!isDispensed && (
                       <button 
                        onClick={() => handleDispense(visit.id)}
                        className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-bold flex items-center gap-2"
                       >
                         <CheckCircle size={18} />
                         تأكيد صرف العلاج
                       </button>
                     )}
                   </div>
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

export default App;