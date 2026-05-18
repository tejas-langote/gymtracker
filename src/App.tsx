/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  serverTimestamp,
  doc,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronDown, 
  ChevronUp, 
  LogOut, 
  Check, 
  Maximize2, 
  History as HistoryIcon, 
  Dumbbell, 
  Moon,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Flame,
  CheckSquare
} from 'lucide-react';
import { auth, db, googleProvider, signInWithPopup, getRedirectResult } from './lib/firebase';

// --- CONSTANTS & TYPES ---

const WORKOUTS: Record<number, any> = {
  1: {
    name: "Chest & Shoulder", icon: "🏋️",
    exercises: [
      { name:"Flat Bench Press",       sets:3, reps:"10–15", t:112,  tip:"Lie flat, grip slightly wider than shoulders. Breathe in as bar lowers to chest, breathe out on push. Keep feet flat, back neutral." },
      { name:"Incline Dumbbell Press", sets:2, reps:"10–12", t:186,  tip:"Set bench to 30–45°. Press dumbbells up and slightly inward. Control the descent. Don't let elbows flare too wide." },
      { name:"Pec Deck Fly",           sets:2, reps:"10–15", t:266,  tip:"Sit upright, slight bend in elbows. Squeeze chest as arms come together. Maintain tension — don't let weight fully unload at back." },
      { name:"Bent Arm DB Pullover",   sets:2, reps:"10–12", t:374,  tip:"Lie across bench, lower dumbbell behind head in arc. Feel stretch in chest and lats. Breathe in on way down, out on way up." },
      { name:"Front Military Press",   sets:3, reps:"10–12", t:473,  tip:"Press bar straight up from shoulder level. Brace core. Don't arch back. Lower bar to upper chest with control." },
      { name:"DB Side Lateral Raise",  sets:2, reps:"10–12", t:565,  tip:"Slight bend in elbows. Raise arms to shoulder height only. Lead with elbows, not wrists. Controlled descent." },
      { name:"Barbell Upright Row",    sets:3, reps:"10–15", t:628,  tip:"Grip shoulder-width. Pull bar up close to body leading with elbows. Stop at chin level. Avoid excessive shrugging." }
    ]
  },
  2: {
    name: "Arms & Abs", icon: "💪",
    exercises: [
      { name:"Barbell Curl",           sets:3, reps:"10–12",  t:718,  tip:"Keep elbows pinned to sides. Don't swing body. Fully extend at bottom, squeeze bicep at top." },
      { name:"Alternate DB Curl",      sets:2, reps:"12/arm", t:787,  tip:"Curl one arm at a time. Rotate wrist outward as you lift. Keep shoulder still. Full range of motion." },
      { name:"V-Bar Push Down",        sets:3, reps:"10–12",  t:867,  tip:"Keep elbows tucked to sides — they don't move. Push bar down until arms fully extended. Squeeze triceps. Slow return." },
      { name:"Barbell French Press",   sets:2, reps:"12",     t:943,  tip:"Lower bar behind head bending only at elbows. Keep upper arms vertical and still. Extend fully on push." },
      { name:"Barbell Wrist Curl",     sets:3, reps:"15",     t:1043, tip:"Forearms resting on thighs, palms up. Let wrists drop fully, then curl up. Slow and controlled." },
      { name:"Leg Raises",             sets:2, reps:"20/leg", t:1128, tip:"Lie flat. Raise legs straight. Lower slowly — don't let feet touch floor. Control the negative." },
      { name:"Knee High Crunches",     sets:2, reps:"12–15",  t:1185, tip:"Bring knees to chest while lifting shoulders. Exhale as you crunch. Don't pull on your neck." }
    ]
  },
  3: {
    name: "Back & Legs", icon: "🦵",
    exercises: [
      { name:"Lat Pulldown",           sets:3, reps:"10–12",  t:1251, tip:"Wide overhand grip. Lean back slightly. Pull bar to upper chest squeezing shoulder blades. Control the return." },
      { name:"Mid Row",                sets:2, reps:"10–12",  t:1326, tip:"Sit upright, pull handle to abdomen. Squeeze mid-back at full contraction. Don't rock back. Slow return." },
      { name:"Barbell Shrugs",         sets:2, reps:"12",     t:1429, tip:"Shrug shoulders straight up — don't roll them. Hold 1 second at top. Lower fully." },
      { name:"Squats",                 sets:3, reps:"12–15",  t:1509, tip:"Feet shoulder-width, toes slightly out. Push knees over toes, chest up, back neutral. Go to parallel. Drive through heels." },
      { name:"Leg Press",              sets:2, reps:"12–15",  t:1625, tip:"Feet mid-to-upper on platform. Lower to 90° at knees. Don't lock knees at top. Keep back pressed into seat." },
      { name:"Lying Leg Curl",         sets:2, reps:"12",     t:1738, tip:"Curl legs to full flexion. Don't lift hips. Squeeze hamstrings at top. Slow controlled descent." },
      { name:"Standing Calf Raises",   sets:3, reps:"15–20",  t:1808, tip:"Full range of motion — all the way up and down. Hold at top. Don't bounce. Slow and deliberate." }
    ]
  }
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_TO_WORKOUT: Record<string, number | null> = {
  "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 1, "Fri": 2, "Sat": 3, "Sun": null
};

const WARM_UP_STEPS = [
  "Treadmill (500 metres)",
  "Shoulder rotation — 10× clockwise & anticlockwise",
  "Hand rotation",
  "Wrist rotation",
  "Toe touch — 10 times",
  "Ankle rotation",
  "Hip rotation",
  "Jumps — 25 + 25",
  "Neck rotation",
  "High knee rises"
];

enum OperationType { CREATE = 'create', UPDATE = 'update', DELETE = 'delete', LIST = 'list', GET = 'get', WRITE = 'write' }
interface FirestoreErrorInfo { error: string; operationType: OperationType; path: string | null; authInfo: any }

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- COMPONENTS ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<'workout' | 'history' | 'rest'>('workout');
  const [currentWeek, setCurrentWeek] = useState(1);
  const [selectedDay, setSelectedDay] = useState(DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    // Handle any pending redirect (from older redirect-based flow)
    getRedirectResult(auth).catch(console.error);

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const settingsDoc = await getDoc(doc(db, `users/${u.uid}/profile/settings`));
          if (settingsDoc.exists()) {
            setCurrentWeek(settingsDoc.data().currentWeek);
          } else {
            await setDoc(doc(db, `users/${u.uid}/profile/settings`), { currentWeek: 1 });
          }
        } catch (e) {
          console.error("Failed to load settings", e);
        }
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2200);
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      if (e?.code !== 'auth/popup-closed-by-user') {
        console.error("Login error", e);
        showToast("Login failed", "error");
      }
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-bg flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-muted border-t-green rounded-full animate-spin" />
        <h1 className="text-2xl font-display font-extrabold tracking-tight">
          Gym<span className="text-green">Tracker</span>
        </h1>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-card border border-border p-8 rounded-[24px] text-center shadow-2xl">
          <h1 className="text-4xl font-display font-extrabold mb-2 tracking-tight">
            Gym<span className="text-green">Tracker</span>
          </h1>
          <p className="text-muted mb-10 text-sm">Track every rep. Own every session.</p>
          
          <button 
            onClick={handleLogin}
            className="w-full h-[52px] bg-white text-black font-semibold rounded-[14px] flex items-center justify-center gap-3 hover:bg-gray-100 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
          
          <p className="mt-6 text-muted2 text-xs">Your data syncs across all your devices</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[480px] mx-auto min-h-screen border-x border-border shadow-2xl relative pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-bg/80 backdrop-blur-md border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-display font-extrabold items-center">
          Gym<span className="text-green">Tracker</span>
        </h1>
        <div className="flex items-center gap-3">
          <div className="bg-card2 border border-border px-3 py-1 rounded-full text-xs font-semibold text-green">
            {selectedDay === DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1] ? "Today" : selectedDay}
          </div>
          <img 
            src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
            alt="Profile" 
            className="w-8 h-8 rounded-full border border-border"
          />
          <button onClick={handleLogout} className="text-muted hover:text-white transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="px-6 mt-6">
        <div className="bg-card2 p-1 rounded-2xl border border-border flex gap-1">
          <button 
            onClick={() => setCurrentTab('workout')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${currentTab === 'workout' ? 'bg-green text-black' : 'text-muted hover:text-white'}`}
          >
            <Dumbbell size={18} /> Workout
          </button>
          <button 
            onClick={() => setCurrentTab('history')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${currentTab === 'history' ? 'bg-green text-black' : 'text-muted hover:text-white'}`}
          >
            <HistoryIcon size={18} /> History
          </button>
          <button 
            onClick={() => {
              const isSun = new Date().getDay() === 0;
              if (isSun) setCurrentTab('rest');
              else setCurrentTab('rest'); // Prompt shows this tab for Sunday
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${currentTab === 'rest' ? 'bg-green text-black' : 'text-muted hover:text-white'}`}
          >
            <Moon size={18} /> Rest
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="px-6 py-6 overflow-x-hidden">
        <AnimatePresence mode="wait">
          {currentTab === 'workout' && (
            <motion.div key="workout" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <WorkoutView 
                user={user} 
                week={currentWeek} 
                setWeek={async (w) => {
                  const newWeek = Math.max(1, Math.min(4, w));
                  setCurrentWeek(newWeek);
                  await setDoc(doc(db, `users/${user.uid}/profile/settings`), { currentWeek: newWeek });
                }} 
                day={selectedDay} 
                setDay={setSelectedDay}
                showToast={showToast}
              />
            </motion.div>
          )}
          {currentTab === 'history' && (
            <motion.div key="history" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <HistoryView user={user} />
            </motion.div>
          )}
          {currentTab === 'rest' && (
            <motion.div key="rest" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="py-20 text-center">
              <div className="text-7xl mb-8">🌙</div>
              <h2 className="text-3xl font-display font-extrabold text-green mb-4">Rest Day</h2>
              <p className="text-muted leading-relaxed max-w-xs mx-auto text-lg">
                Recover, hydrate, and sleep well. Your muscles are growing today.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }} 
            animate={{ y: 0, opacity: 1 }} 
            exit={{ y: 100, opacity: 0 }}
            className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full font-bold shadow-2xl flex items-center gap-2 whitespace-nowrap ${toast.type === 'success' ? 'bg-green text-black' : 'bg-red-500 text-white'}`}
          >
            {toast.type === 'success' ? <Check size={18} /> : null}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- SUB-VIEWS ---

function WorkoutView({ user, week, setWeek, day, setDay, showToast }: any) {
  const workoutId = DAY_TO_WORKOUT[day];
  const workoutData = workoutId ? WORKOUTS[workoutId] : null;

  const [expandedExercises, setExpandedExercises] = useState<Record<string, boolean>>({});
  const [warmupExpanded, setWarmupExpanded] = useState(false);
  const [warmupChecked, setWarmupChecked] = useState<Record<number, boolean>>({});
  const [exerciseData, setExerciseData] = useState<Record<string, { weight: string; reps: string; done: boolean }[]>>({});
  const [prefillData, setPrefillData] = useState<Record<string, { weight: string; reps: string }[]>>({});
  const [saving, setSaving] = useState(false);

  // Initialize exercise data structure when the day/workout changes
  useEffect(() => {
    if (workoutData) {
      const initial: any = {};
      workoutData.exercises.forEach((ex: any) => {
        initial[ex.name] = Array.from({ length: ex.sets }, () => ({ weight: '', reps: '', done: false }));
      });
      setExerciseData(initial);
      loadPrefill(workoutData.name, exData => setPrefillData(exData));
    }
  }, [day, user.uid]);

  const loadPrefill = async (workoutName: string, callback: (data: any) => void) => {
    try {
      const q = query(
        collection(db, `users/${user.uid}/workouts`),
        where('workoutName', '==', workoutName),
        orderBy('timestamp', 'desc'),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const lastWorkout = snap.docs[0].data();
        const prefill: any = {};
        lastWorkout.exercises.forEach((ex: any) => {
          prefill[ex.name] = ex.sets.map((s: any) => ({ weight: s.weight, reps: s.reps }));
        });
        callback(prefill);
      }
    } catch (e) {
      console.error("Prefill fetch failed", e);
    }
  };

  const handleSave = async () => {
    if (!workoutData) return;
    setSaving(true);
    try {
      const workoutToSave = {
        timestamp: serverTimestamp(),
        week,
        day,
        workoutName: workoutData.name,
        exercises: Object.entries(exerciseData).map(([name, sets]) => ({
          name,
          sets
        }))
      };
      await addDoc(collection(db, `users/${user.uid}/workouts`), workoutToSave);
      showToast("Workout saved!");
    } catch (e) {
      console.error(e);
      showToast("Save failed. Check connection.", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleWarmupStep = (idx: number) => {
    setWarmupChecked(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const totalSets = workoutData ? workoutData.exercises.reduce((acc: number, ex: any) => acc + ex.sets, 0) : 0;
  const completedSets = Object.values(exerciseData).flat().filter((s: any) => s.done).length;
  const progressPercent = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Week & Day Selectors */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setWeek(week - 1)} className="w-[52px] h-[48px] bg-card2 border border-border rounded-xl flex items-center justify-center text-muted hover:text-white"><ChevronLeft /></button>
          <h2 className="text-xl font-display font-bold">Week {week}</h2>
          <button onClick={() => setWeek(week + 1)} className="w-[52px] h-[48px] bg-card2 border border-border rounded-xl flex items-center justify-center text-muted hover:text-white"><ChevronRight /></button>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {DAYS.map((d) => {
            const isRest = d === "Sun";
            const isActive = day === d;
            return (
              <button 
                key={d}
                onClick={() => !isRest && setDay(d)}
                className={`flex flex-col items-center justify-center gap-1 py-3 rounded-2xl border transition-all ${
                  isActive ? 'bg-green border-green text-black font-bold' : 
                  isRest ? 'bg-bg border-border text-muted opacity-40 cursor-not-allowed' : 
                  'bg-card2 border-border text-muted hover:text-white'
                }`}
              >
                <span className="text-[10px] uppercase font-bold">{d.slice(0, 1)}</span>
                {isRest ? <span className="text-[10px]">Rest</span> : null}
              </button>
            );
          })}
        </div>
      </section>

      {day === "Sun" ? (
        <div className="py-20 text-center">
          <div className="text-7xl mb-8">🌙</div>
          <h2 className="text-3xl font-display font-extrabold text-green mb-4">Rest Day</h2>
          <p className="text-muted leading-relaxed max-w-xs mx-auto text-lg">
            Recover, hydrate, and sleep well. Your muscles are growing today.
          </p>
        </div>
      ) : (
        <>
          {/* Warm Up Card */}
          <div className="bg-card border border-border rounded-[24px] overflow-hidden">
            <button 
              onClick={() => setWarmupExpanded(!warmupExpanded)}
              className="w-full px-6 py-5 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🔥</span>
                <span className="font-display font-bold text-lg">Warm Up</span>
              </div>
              {warmupExpanded ? <ChevronUp className="text-muted" /> : <ChevronDown className="text-muted" />}
            </button>
            {warmupExpanded && (
              <div className="px-6 pb-6 space-y-1">
                {WARM_UP_STEPS.map((step, idx) => (
                  <label key={idx} className="flex items-center justify-between h-11 px-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group">
                    <span className={`text-sm transition-all ${warmupChecked[idx] ? 'text-green/50 line-through' : 'text-text'}`}>
                      {step}
                    </span>
                    <input 
                      type="checkbox" 
                      onChange={() => toggleWarmupStep(idx)}
                      checked={!!warmupChecked[idx]}
                      className="sr-only"
                    />
                    <div className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all ${warmupChecked[idx] ? 'bg-green border-green text-black' : 'border-muted group-hover:border-muted2'}`}>
                      {warmupChecked[idx] && <Check size={14} strokeWidth={4} />}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Info Banner */}
          <div className="bg-green/10 border border-green/20 p-4 rounded-[18px] flex gap-3 items-start">
            <span className="text-green mt-0.5">⚡</span>
            <p className="text-green/90 text-sm font-medium leading-relaxed">
              Always warm up first and do a dead hang stretch after your workout.
            </p>
          </div>

          {/* Progress Section */}
          <div className="space-y-3">
            <div className="flex justify-between items-end">
              <div className="font-display font-bold text-sm">
                {completedSets} <span className="text-muted font-normal">of</span> {totalSets} <span className="text-muted font-normal">sets</span>
              </div>
              <div className="font-display font-extrabold text-green text-xl">{progressPercent}%</div>
            </div>
            <div className="h-3 bg-card rounded-full border border-border overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-green to-green-dim"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Exercise List */}
          <div className="space-y-4">
            {workoutData.exercises.map((ex: any, exIdx: number) => {
              const isExpanded = !!expandedExercises[ex.name];
              const currentSets = exerciseData[ex.name] || [];
              const prefill = prefillData[ex.name] || [];

              return (
                <div key={exIdx} className="bg-card border border-border rounded-[24px] overflow-hidden">
                  <header 
                    onClick={() => setExpandedExercises(prev => ({ ...prev, [ex.name]: !prev[ex.name] }))}
                    className="px-6 py-5 flex items-center justify-between cursor-pointer group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-2xl">{workoutData.icon}</div>
                      <div>
                        <h3 className="font-display font-bold text-lg group-hover:text-green transition-colors">{ex.name}</h3>
                        <p className="text-muted text-sm">{ex.sets} sets · {ex.reps} reps</p>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="text-muted" /> : <ChevronDown className="text-muted" />}
                  </header>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                        <div className="px-6 pb-6 space-y-6">
                          <div className="bg-card2 p-4 rounded-2xl text-sm text-muted leading-relaxed flex gap-3">
                            <span className="text-green text-lg">💡</span> 
                            {ex.tip}
                          </div>

                          <a 
                            href={`https://www.youtube.com/watch?v=5xxJP1WNNZ0&t=${ex.t}s`}
                            target="_blank"
                            rel="referrer"
                            className="w-full h-12 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl flex items-center justify-center gap-2 font-bold text-sm hover:bg-red-500/20 transition-all"
                          >
                            ▶️ Watch Exercise Demo
                          </a>

                          <div className="space-y-3">
                            <div className="flex items-center gap-3 text-[10px] uppercase font-bold text-muted2 tracking-widest px-2">
                              <div className="w-8">Set</div>
                              <div className="flex-1 text-center">Weight</div>
                              <div className="flex-1 text-center">Reps</div>
                              <div className="w-11 text-center">Done</div>
                            </div>

                            {currentSets.map((set, sIdx) => {
                              const pf = prefill[sIdx];
                              return (
                                <div key={sIdx} className="flex items-center gap-3">
                                  <div className="w-8 text-xs font-bold text-muted py-2">S{sIdx+1}</div>
                                  <input 
                                    type="number"
                                    inputMode="decimal"
                                    placeholder={pf?.weight || 'kg'}
                                    value={set.weight}
                                    onChange={(e) => {
                                      setExerciseData(prev => {
                                        const newData = { ...prev };
                                        const newExSets = [...newData[ex.name]];
                                        newExSets[sIdx] = { ...newExSets[sIdx], weight: e.target.value };
                                        newData[ex.name] = newExSets;
                                        return newData;
                                      });
                                    }}
                                    className="flex-1 bg-card2 border border-border h-11 rounded-xl text-center text-sm font-semibold focus:border-green outline-none transition-colors min-w-0"
                                  />
                                  <input 
                                    type="number"
                                    inputMode="numeric"
                                    placeholder={pf?.reps || 'reps'}
                                    value={set.reps}
                                    onChange={(e) => {
                                      setExerciseData(prev => {
                                        const newData = { ...prev };
                                        const newExSets = [...newData[ex.name]];
                                        newExSets[sIdx] = { ...newExSets[sIdx], reps: e.target.value };
                                        newData[ex.name] = newExSets;
                                        return newData;
                                      });
                                    }}
                                    className="flex-1 bg-card2 border border-border h-11 rounded-xl text-center text-sm font-semibold focus:border-green outline-none transition-colors min-w-0"
                                  />
                                  <button 
                                    onClick={() => {
                                      setExerciseData(prev => {
                                        const newData = { ...prev };
                                        const newExSets = [...newData[ex.name]];
                                        newExSets[sIdx] = { ...newExSets[sIdx], done: !newExSets[sIdx].done };
                                        newData[ex.name] = newExSets;
                                        return newData;
                                      });
                                    }}
                                    className={`h-11 w-11 shrink-0 rounded-xl flex items-center justify-center border transition-all ${set.done ? 'bg-green border-green text-black' : 'border-muted text-muted hover:border-muted2 hover:bg-white/5'}`}
                                  >
                                    <Check size={18} strokeWidth={3} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          <button 
            onClick={handleSave}
            disabled={saving}
            className={`w-full h-14 bg-green hover:bg-green-dim text-black font-display font-extrabold text-lg rounded-[14px] shadow-[0_8px_30px_rgb(31,206,138,0.3)] transition-all flex items-center justify-center gap-3 ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {saving ? <div className="w-6 h-6 border-2 border-black/20 border-t-black rounded-full animate-spin" /> : '💾 Save Workout'}
          </button>
        </>
      )}
    </div>
  );
}

function HistoryView({ user }: any) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const q = query(
          collection(db, `users/${user.uid}/workouts`),
          orderBy('timestamp', 'desc'),
          limit(50)
        );
        const snap = await getDocs(q);
        setHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (e) {
        console.error("History fetch failed", e);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [user.uid]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-card border border-border rounded-[24px] animate-pulse" />
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="py-32 text-center text-muted">
        <div className="text-5xl mb-6">📋</div>
        <p className="text-lg">No workouts saved yet.</p>
        <p className="text-sm">Complete a session and hit Save!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {history.map((h) => (
        <div key={h.id} className="bg-card border border-border p-6 rounded-[24px] space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] uppercase font-bold text-muted tracking-widest mb-1">
                Week {h.week} · {h.day} · {h.timestamp?.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
              <h3 className="font-display font-extrabold text-lg text-green">{h.workoutName}</h3>
            </div>
          </div>
          <div className="space-y-2 border-t border-border pt-4">
            {h.exercises.map((ex: any, idx: number) => {
              const compCount = ex.sets.filter((s: any) => s.done).length;
              return (
                <div key={idx} className="text-sm">
                  <span className="font-bold text-text">{ex.name}:</span>{' '}
                  <span className="text-green font-bold">{compCount}/{ex.sets.length}</span>{' '}
                  <span className="text-muted text-xs">
                    ({ex.sets.map((s: any) => `${s.weight || '0'}×${s.reps || '0'}`).join(', ')})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
