import React, { useState, useEffect, useMemo } from "react";
import { db, auth } from "../firebase";
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { collection, query, where, getDocs, doc, setDoc, updateDoc, deleteDoc, increment, onSnapshot, serverTimestamp, orderBy, writeBatch, runTransaction } from "firebase/firestore";
import { Users, Clock, Settings, Trash2, Power, PowerOff, RefreshCw, ChevronLeft, Plus, Check, X, Edit2, Lock, ShieldCheck, Search, Shield, Calendar as CalendarIcon, Hash, Layers, Sliders, PlayCircle, BarChart3, PieChart, Activity, TrendingUp, Timer } from "lucide-react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function Admin() {
  const [timeSlots, setTimeSlots] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('sv-SE'));
  
  // 실시간 카운트다운 관련 상태
  const [now, setNow] = useState(new Date());

  // 예약판 생성 관련 상태
  const [customSlots, setCustomSlots] = useState(() => {
    const saved = localStorage.getItem("iic_admin_custom_slots_v3");
    return saved ? JSON.parse(saved) : [
      { time: "11:30", capacity: 20 },
      { time: "12:00", capacity: 20 },
      { time: "12:30", capacity: 20 }
    ];
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createRange, setCreateRange] = useState({
    start: new Date().toLocaleDateString('sv-SE'),
    end: new Date().toLocaleDateString('sv-SE'),
    excludeWeekends: true,
  });
  const [showAllBoardsModal, setShowAllBoardsModal] = useState(false);
  const [allBoards, setAllBoards] = useState([]);

  // 시스템 설정 관련 상태
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [sysConfig, setSysConfig] = useState({
    operatingHours: "11:30 — 13:30",
    reservationStart: "09:00",
    reservationCutoff: "11:00",
    isReservationEnabled: true
  });

  const [editingSlotId, setEditingSlotId] = useState(null);
  const [editValues, setEditValues] = useState({ capacity: 20, remaining: 20 });
  
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterTime, setFilterTime] = useState("all");

  const syncAllSlots = async () => {
    if (!confirm("모든 타임슬롯의 잔여석을 실제 예약 내역과 동기화하시겠습니까?")) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      timeSlots.forEach(slot => {
        const actualBooked = reservations.filter(r => r.timeSlotId === slot.id).length;
        const correctRemaining = Math.max(0, slot.capacity - actualBooked);
        batch.update(doc(db, "timeSlots", slot.id), { remaining: correctRemaining });
      });
      await batch.commit();
      alert("모든 타임슬롯의 잔여석이 실제 예약 내역과 동기화되었습니다.");
    } catch (err) {
      console.error(err);
      alert("동기화 중 오류 발생");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const qSlots = query(collection(db, "timeSlots"), where("date", "==", selectedDate));
    const unsubSlots = onSnapshot(qSlots, (snap) => {
      const slots = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      slots.sort((a, b) => a.time.localeCompare(b.time));
      setTimeSlots(slots);
    });

    const qRes = query(collection(db, "reservations"), where("date", "==", selectedDate));
    const unsubRes = onSnapshot(qRes, (snap) => {
      setReservations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubConfig = onSnapshot(doc(db, "settings", "config"), (docSnap) => {
      if (docSnap.exists()) {
        setSysConfig(docSnap.data());
      }
    });

    return () => { unsubSlots(); unsubRes(); unsubConfig(); };
  }, [selectedDate]);

  useEffect(() => {
    if (!showAllBoardsModal) return;
    const qAll = query(collection(db, "timeSlots"), orderBy("date", "desc"));
    const unsubAll = onSnapshot(qAll, (snap) => {
      const data = snap.docs.map(doc => doc.data());
      const grouped = data.reduce((acc, slot) => {
        if (!acc[slot.date]) acc[slot.date] = [];
        acc[slot.date].push(slot);
        return acc;
      }, {});
      const boardList = Object.entries(grouped).map(([date, slots]) => ({
        date,
        slots: slots.sort((a, b) => a.time.localeCompare(b.time))
      }));
      setAllBoards(boardList);
    });
    return () => unsubAll();
  }, [showAllBoardsModal]);

  // 예약 시스템 실시간 카운트다운 계산
  const countdown = useMemo(() => {
    if (!sysConfig.isReservationEnabled) return { label: "Disabled", percent: 0, text: "--:--" };
    
    const [startH, startM] = (sysConfig.reservationStart || "09:00").split(":").map(Number);
    const [cutoffH, cutoffM] = (sysConfig.reservationCutoff || "11:00").split(":").map(Number);
    
    const startDate = new Date(now);
    startDate.setHours(startH, startM, 0, 0);
    
    const cutoffDate = new Date(now);
    cutoffDate.setHours(cutoffH, cutoffM, 0, 0);
    
    if (now < startDate) {
      const diff = startDate - now;
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      return { 
        label: "Starts In", 
        percent: 0, 
        text: `${hours}시간 ${mins}분 ${secs}초`,
        status: "waiting"
      };
    } else if (now < cutoffDate) {
      const total = cutoffDate - startDate;
      const current = cutoffDate - now;
      const percent = Math.max(0, Math.min(100, (current / total) * 100));
      const hours = Math.floor(current / 3600000);
      const mins = Math.floor((current % 3600000) / 60000);
      const secs = Math.floor((current % 60000) / 1000);
      return { 
        label: "Time Left", 
        percent: 100 - percent, 
        text: `${hours}시간 ${mins}분 ${secs}초`,
        status: "active"
      };
    } else {
      return { label: "Finished", percent: 100, text: "Closed", status: "finished" };
    }
  }, [now, sysConfig]);

  // 대시보드 통계 계산
  const stats = useMemo(() => {
    const totalCap = timeSlots.reduce((acc, s) => acc + (Number(s.capacity) || 0), 0);
    const totalBooked = reservations.length;
    
    // 각 슬롯별 잔여석의 합계 (마이너스 방지 포함)
    const totalRem = timeSlots.reduce((acc, slot) => {
      const booked = reservations.filter(r => r.timeSlotId === slot.id).length;
      return acc + Math.max(0, (Number(slot.capacity) || 0) - booked);
    }, 0);
    
    const fillRate = totalCap > 0 ? Math.round((totalBooked / totalCap) * 100) : 0;
    return { totalCap, totalRem, totalBooked, fillRate };
  }, [timeSlots, reservations]);

  const filteredReservations = reservations.filter(res => {
    const matchesSearch = res.phone.includes(searchTerm.replace(/-/g, "")) || res.time.includes(searchTerm);
    const matchesTime = filterTime === "all" || res.time === filterTime;
    return matchesSearch && matchesTime;
  });

  const addSlotField = () => setCustomSlots([...customSlots, { time: "13:00", capacity: 20 }]);
  const removeSlotField = (index) => setCustomSlots(customSlots.filter((_, i) => i !== index));
  const updateSlotValue = (index, field, value) => {
    const newSlots = [...customSlots];
    newSlots[index][field] = field === "capacity" ? Number(value) : value;
    setCustomSlots(newSlots);
  };

  const handleCreateBoard = async () => {
    const validSlots = customSlots.filter(s => s.time.trim().length > 0 && s.capacity > 0);
    if (validSlots.length === 0) return alert("올바른 시간과 인원을 입력해 주세요.");
    const start = new Date(createRange.start);
    const end = new Date(createRange.end);
    if (start > end) return alert("시작 날짜가 종료 날짜보다 늦을 수 없습니다.");

    const dates = [];
    let current = new Date(start);
    const holidays2026 = ["2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-01", "2026-03-02", "2026-05-05", "2026-05-24", "2026-05-25", "2026-06-06", "2026-08-15", "2026-08-17", "2026-09-24", "2026-09-25", "2026-09-26", "2026-10-03", "2026-10-05", "2026-10-09", "2026-12-25"];

    while (current <= end) {
      const dateStr = current.toLocaleDateString('sv-SE');
      const day = current.getDay();
      if (!(createRange.excludeWeekends && (day === 0 || day === 6 || holidays2026.includes(dateStr)))) {
        dates.push(dateStr);
      }
      current.setDate(current.getDate() + 1);
    }

    if (dates.length === 0) return alert("생성할 수 있는 날짜가 없습니다.");
    setLoading(true);
    try {
      localStorage.setItem("iic_admin_custom_slots_v3", JSON.stringify(validSlots));
      const batch = writeBatch(db);
      dates.forEach(date => {
        validSlots.forEach(slot => {
          const id = `${date}_${slot.time.replace(":", "")}`;
          batch.set(doc(db, "timeSlots", id), { id, date, time: slot.time, capacity: slot.capacity, remaining: slot.capacity, status: "open" }, { merge: true });
        });
      });
      await batch.commit();
      setShowCreateModal(false);
      alert(`${dates.length}개 날짜의 예약판이 생성되었습니다.`);
    } catch (err) { alert("생성 중 오류 발생"); } finally { setLoading(false); }
  };

  const deleteBoard = async (date) => {
    if (!confirm(`${date} 날짜의 모든 데이터를 삭제하시겠습니까?`)) return;
    setLoading(true);
    try {
      const qSlots = query(collection(db, "timeSlots"), where("date", "==", date));
      const qRes = query(collection(db, "reservations"), where("date", "==", date));
      const [slotSnap, resSnap] = await Promise.all([getDocs(qSlots), getDocs(qRes)]);
      const batch = writeBatch(db);
      slotSnap.docs.forEach(d => batch.delete(d.ref));
      resSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      alert(`${date} 데이터가 삭제되었습니다.`);
    } catch (err) { alert("삭제 중 오류 발생"); } finally { setLoading(false); }
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      await setDoc(doc(db, "settings", "config"), sysConfig, { merge: true });
      setShowSettingsModal(false);
      alert("설정이 저장되었습니다.");
    } catch (err) { alert("설정 저장 중 오류 발생"); } finally { setLoading(false); }
  };

  const saveEdit = async (slotId) => {
    try {
      const slotRef = doc(db, "timeSlots", slotId);
      const resQuery = query(collection(db, "reservations"), where("timeSlotId", "==", slotId));
      const resSnap = await getDocs(resQuery);
      const bookedCount = resSnap.size;
      const newCapacity = Number(editValues.capacity);
      
      await updateDoc(slotRef, { 
        capacity: newCapacity, 
        remaining: newCapacity - bookedCount 
      });
      setEditingSlotId(null);
    } catch (err) { 
      console.error(err);
      alert("수정 중 오류 발생"); 
    }
  };

  const toggleSlotStatus = async (slotId, currentStatus) => {
    await updateDoc(doc(db, "timeSlots", slotId), { status: currentStatus === "open" ? "closed" : "open" });
  };

  const deleteSlot = async (slotId) => {
    if (confirm("해당 시간대를 삭제하시겠습니까?")) await deleteDoc(doc(db, "timeSlots", slotId));
  };

  const deleteReservation = async (resId, slotId) => {
    if (confirm("해당 예약을 취소하시겠습니까?")) {
      try {
        const resRef = doc(db, "reservations", resId);
        const slotRef = doc(db, "timeSlots", slotId);

        await runTransaction(db, async (transaction) => {
          const resSnap = await transaction.get(resRef);
          if (!resSnap.exists()) return;

          const slotSnap = await transaction.get(slotRef);
          if (!slotSnap.exists()) {
            transaction.delete(resRef);
            return;
          }

          const slotData = slotSnap.data();

          transaction.delete(resRef);
          transaction.update(slotRef, {
            remaining: slotData.remaining + 1
          });
        });
      } catch (err) {
        console.error("취소 실패:", err);
        alert("취소 중 오류가 발생했습니다.");
      }
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword) return alert("현재 비밀번호를 입력해 주세요.");
    if (!newPassword || newPassword.length < 6) return alert("새 비밀번호는 최소 6자 이상이어야 합니다.");
    if (newPassword !== confirmPassword) return alert("새 비밀번호가 일치하지 않습니다.");
    if (!confirm("관리자 비밀번호를 변경하시겠습니까?")) return;
    
    setIsUpdatingPassword(true);
    try {
      const user = auth.currentUser;
      if (user && user.email) {
        // 현재 비밀번호로 재인증
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        
        // 비밀번호 변경
        await updatePassword(user, newPassword);
        
        alert("비밀번호가 성공적으로 변경되었습니다.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setShowSecurityModal(false);
      }
    } catch (err) { 
      console.error(err);
      if (err.code === "auth/wrong-password") {
        alert("현재 비밀번호가 일치하지 않습니다.");
      } else {
        alert("오류가 발생했습니다: " + err.message);
      }
    } finally { 
      setIsUpdatingPassword(false); 
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] flex flex-col font-sans text-[#1A1A1A] relative">
      {/* Modals */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-lg rounded-[40px] p-10 shadow-2xl relative border border-gray-100">
            <button onClick={() => setShowCreateModal(false)} className="absolute top-8 right-8 text-gray-300 hover:text-black transition-colors"><X size={24} /></button>
            <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 bg-gray-50 rounded-[24px] flex items-center justify-center mb-4 text-black border border-gray-100 shadow-sm"><Plus size={32} /></div>
              <h3 className="text-2xl font-black tracking-tight uppercase">Create Board</h3>
              <p className="text-gray-400 text-sm mt-1">예약판을 생성할 날짜와 시간대를 설정하세요.</p>
            </div>
            <div className="space-y-8 max-h-[550px] overflow-y-auto px-2 scrollbar-hide">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Select Date Range</label>
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" value={createRange.start} onChange={(e) => setCreateRange({ ...createRange, start: e.target.value })} className="p-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold w-full focus:outline-none focus:ring-2 focus:ring-black/5" />
                  <input type="date" value={createRange.end} onChange={(e) => setCreateRange({ ...createRange, end: e.target.value })} className="p-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold w-full focus:outline-none focus:ring-2 focus:ring-black/5" />
                </div>
                <button onClick={() => setCreateRange({ ...createRange, excludeWeekends: !createRange.excludeWeekends })} className="flex items-center gap-2 px-1 group">
                  <div className={cn("w-5 h-5 rounded-md border flex items-center justify-center transition-all", createRange.excludeWeekends ? "bg-black border-black text-white" : "bg-white border-gray-200 text-transparent")}><Check size={12} strokeWidth={4} /></div>
                  <span className="text-xs font-bold text-gray-500 group-hover:text-black">주말 및 공휴일 제외 (2026 기준)</span>
                </button>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Time & Capacity</label>
                  <button onClick={addSlotField} className="text-[10px] font-black text-black flex items-center gap-1 hover:opacity-60 transition-opacity"><Plus size={12} /> 추가</button>
                </div>
                {customSlots.map((slot, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <input type="time" value={slot.time} onChange={(e) => updateSlotValue(index, "time", e.target.value)} className="flex-1 p-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-black/5" />
                    <input type="number" value={slot.capacity} onChange={(e) => updateSlotValue(index, "capacity", e.target.value)} className="w-20 p-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-black/5" />
                    <button onClick={() => removeSlotField(index)} className="p-3 text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-8 border-t border-gray-100 mt-6">
              <button onClick={handleCreateBoard} disabled={loading} className="w-full bg-black text-white py-5 rounded-[20px] font-bold text-base shadow-xl disabled:bg-gray-200 transition-all active:scale-[0.98]">{loading ? "Creating..." : "예약판 생성하기"}</button>
            </div>
          </div>
        </div>
      )}

      {showAllBoardsModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-2xl rounded-[40px] p-10 shadow-2xl border border-gray-100 relative">
            <button onClick={() => setShowAllBoardsModal(false)} className="absolute top-8 right-8 text-gray-300 hover:text-black transition-colors"><X size={24} /></button>
            <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 bg-gray-50 rounded-[24px] flex items-center justify-center mb-4 text-black border border-gray-100 shadow-sm"><Layers size={32} /></div>
              <h3 className="text-2xl font-black tracking-tight uppercase">All Boards</h3>
            </div>
            <div className="space-y-4 max-h-[500px] overflow-y-auto px-2 scrollbar-hide">
              {allBoards.map((board) => (
                <div key={board.date} className="bg-gray-50 border border-gray-100 rounded-3xl p-6 flex items-center justify-between group hover:border-gray-200 transition-all">
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Date</span><span className="text-lg font-black">{board.date}</span></div>
                    <div className="flex flex-wrap gap-2">{board.slots.map(s => <span key={s.id} className="text-[11px] font-bold bg-white px-2 py-1 rounded-lg border border-gray-100">{s.time}</span>)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setSelectedDate(board.date); setShowAllBoardsModal(false); }} className="px-4 py-2 bg-white text-black text-xs font-black rounded-xl border border-gray-100 shadow-sm hover:bg-black hover:text-white transition-all">VIEW</button>
                    <button onClick={() => deleteBoard(board.date)} className="p-3 text-gray-300 hover:text-red-500 rounded-xl transition-colors"><Trash2 size={18} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl relative border border-gray-100">
            <button onClick={() => setShowSettingsModal(false)} className="absolute top-8 right-8 text-gray-300 hover:text-black transition-colors"><X size={24} /></button>
            <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 bg-gray-50 rounded-[24px] flex items-center justify-center mb-4 text-black border border-gray-100 shadow-sm"><Sliders size={32} /></div>
              <h3 className="text-2xl font-black tracking-tight uppercase">Settings</h3>
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">식사 운영 시간</label>
                <input type="text" value={sysConfig.operatingHours} onChange={(e) => setSysConfig({...sysConfig, operatingHours: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-base font-bold focus:outline-none focus:ring-2 focus:ring-black/5" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">시작 시간</label>
                  <input type="time" value={sysConfig.reservationStart} onChange={(e) => setSysConfig({...sysConfig, reservationStart: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-base font-bold focus:outline-none focus:ring-2 focus:ring-black/5" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">마감 시간</label>
                  <input type="time" value={sysConfig.reservationCutoff} onChange={(e) => setSysConfig({...sysConfig, reservationCutoff: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-base font-bold focus:outline-none focus:ring-2 focus:ring-black/5" />
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <span className="text-sm font-black">예약 시스템 활성화</span>
                <button onClick={() => setSysConfig({...sysConfig, isReservationEnabled: !sysConfig.isReservationEnabled})} className={cn("w-14 h-8 rounded-full relative transition-all duration-300", sysConfig.isReservationEnabled ? "bg-black" : "bg-gray-200")}>
                  <div className={cn("absolute top-1 w-6 h-6 bg-white rounded-full transition-all duration-300 shadow-sm", sysConfig.isReservationEnabled ? "left-7" : "left-1")} />
                </button>
              </div>
            </div>
            <div className="pt-8 border-t border-gray-100 mt-8">
              <button onClick={handleSaveSettings} disabled={loading} className="w-full bg-black text-white py-5 rounded-[20px] font-bold shadow-xl active:scale-[0.98] transition-all">저장하기</button>
            </div>
          </div>
        </div>
      )}

      {showSecurityModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl relative border border-gray-100">
            <button onClick={() => setShowSecurityModal(false)} className="absolute top-8 right-8 text-gray-300 hover:text-black transition-colors"><X size={24} /></button>
            <div className="flex flex-col items-center mb-10">
              <div className="w-20 h-20 bg-gray-50 rounded-[30px] flex items-center justify-center mb-6 text-black border border-gray-100 shadow-sm"><ShieldCheck size={40} /></div>
              <h3 className="text-2xl font-black tracking-tight">Security</h3>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] px-1">Current Password</label>
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••" className="w-full p-5 bg-gray-50 border border-gray-100 rounded-[20px] text-lg focus:outline-none focus:ring-2 focus:ring-black/5" />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] px-1">New Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••" className="w-full p-5 bg-gray-50 border border-gray-100 rounded-[20px] text-lg focus:outline-none focus:ring-2 focus:ring-black/5" />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] px-1">Confirm New Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••" className="w-full p-5 bg-gray-50 border border-gray-100 rounded-[20px] text-lg focus:outline-none focus:ring-2 focus:ring-black/5" />
              </div>
              <button type="submit" disabled={isUpdatingPassword} className="w-full bg-black text-white py-5 rounded-[20px] font-bold shadow-xl active:scale-[0.98] transition-all">{isUpdatingPassword ? "Processing..." : "비밀번호 변경"}</button>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white/90 backdrop-blur-xl border-b border-gray-200 px-8 py-5 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4">
            <Link to="/" className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center hover:scale-105 transition-transform"><ChevronLeft size={20}/></Link>
            <h1 className="text-xl font-black tracking-tighter uppercase">IIC Dashboard</h1>
          </div>
          <div className="h-8 w-[1px] bg-gray-200 hidden md:block" />
          <div className="flex items-center bg-gray-100 rounded-2xl px-4 py-2 gap-2">
            <CalendarIcon size={16} className="text-gray-400" />
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent border-none text-sm font-bold text-black focus:ring-0 p-0 cursor-pointer" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={syncAllSlots} disabled={loading} className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-xl transition-all border border-gray-200" title="데이터 동기화 (잔여석 재계산)"><RefreshCw size={18} className={loading ? "animate-spin" : ""} /></button>
          <button onClick={() => setShowCreateModal(true)} className="bg-black text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-zinc-800 transition-all shadow-lg shadow-black/5 active:scale-[0.95]"><Plus size={18} /><span>생성</span></button>
          <button onClick={() => setShowAllBoardsModal(true)} className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-xl transition-all border border-gray-200" title="모든 예약판"><Layers size={18} /></button>
          <button onClick={() => setShowSecurityModal(true)} className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-xl transition-all border border-gray-200" title="보안"><Lock size={18} /></button>
        </div>
      </header>

      <main className="p-8 max-w-[1600px] mx-auto w-full flex-1 space-y-8 animate-in fade-in duration-700">
        {/* Statistics Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: System Status with Countdown Animation */}
          <div 
            onClick={() => setShowSettingsModal(true)}
            className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100 flex flex-col justify-between relative overflow-hidden group cursor-pointer hover:border-gray-200 transition-all"
          >
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-900 border border-zinc-100"><Activity size={24} /></div>
              <div className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all duration-500", 
                sysConfig.isReservationEnabled ? (countdown.status === "active" ? "bg-green-50 text-green-600 border-green-100" : "bg-amber-50 text-amber-600 border-amber-100") : "bg-red-50 text-red-600 border-red-100"
              )}>
                {sysConfig.isReservationEnabled ? (countdown.status === "active" ? "Live" : countdown.status === "waiting" ? "Pending" : "Closed") : "Stopped"}
              </div>
            </div>
            <div className="relative z-10">
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1 flex justify-between">
                <span>Reservation Status</span>
                <span className="text-zinc-900">{countdown.label}</span>
              </p>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xl font-black tracking-tight">{countdown.text}</h3>
                <div className="flex-1 h-2 bg-gray-50 rounded-full overflow-hidden border border-gray-100 relative">
                  <div 
                    className={cn(
                      "h-full transition-all duration-1000 ease-linear rounded-full",
                      countdown.status === "active" ? "bg-green-500" : "bg-gray-300"
                    )} 
                    style={{ width: `${countdown.percent}%` }} 
                  />
                </div>
              </div>
            </div>
            {/* Background pulsing animation if active */}
            {sysConfig.isReservationEnabled && countdown.status === "active" && (
              <div className="absolute inset-0 bg-green-500/5 animate-pulse pointer-events-none" />
            )}
          </div>

          {/* Card 2: Total Booked */}
          <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 border border-blue-100"><Users size={24} /></div>
              <div className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Today's Goal</div>
            </div>
            <div>
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Booked</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-3xl font-black tracking-tighter">{stats.totalBooked}</h3>
                <span className="text-gray-300 font-bold text-sm">/ {stats.totalCap} 명</span>
              </div>
            </div>
          </div>

          {/* Card 3: Remaining Seats */}
          <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 border border-amber-100"><PieChart size={24} /></div>
              <div className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Available</div>
            </div>
            <div>
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">Remaining Seats</p>
              <h3 className="text-3xl font-black tracking-tighter">{stats.totalRem} <span className="text-sm text-gray-300 uppercase">Seats</span></h3>
            </div>
          </div>

          {/* Card 4: Fill Rate */}
          <div className="bg-black rounded-[32px] p-6 shadow-2xl shadow-black/20 flex flex-col justify-between text-white relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white"><TrendingUp size={24} /></div>
              <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">Fill Rate</div>
            </div>
            <div className="relative z-10">
              <p className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-1">Reservation Progress</p>
              <div className="flex items-center gap-4">
                <h3 className="text-4xl font-black tracking-tighter">{stats.fillRate}%</h3>
                <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden border border-white/5">
                  <div className="h-full bg-white transition-all duration-1000 ease-out" style={{ width: `${stats.fillRate}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content Row with Matched Heights */}
        <div className="flex flex-col xl:flex-row gap-8 items-stretch">
          {/* Left: Slot Management */}
          <div className="xl:w-[42%] flex flex-col space-y-6">
            <div className="flex items-center justify-between px-2 h-8">
              <h2 className="text-sm font-black flex items-center gap-2 uppercase tracking-widest text-gray-500"><Clock size={18} /> Time Slot Progress</h2>
              <span className="text-[10px] font-black bg-white px-2 py-1 rounded-lg border border-gray-200 text-gray-400 uppercase">{timeSlots.length} Slots</span>
            </div>

            <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-2 flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                <div className="divide-y divide-gray-50">
                  {timeSlots.map(slot => {
                    // 실제 예약 리스트에서 해당 타임슬롯의 예약 수를 직접 카운트 (DB 필드에 의존하지 않음)
                    const actualBooked = reservations.filter(r => r.timeSlotId === slot.id).length;
                    const displayRemaining = Math.max(0, slot.capacity - actualBooked);
                    const rate = slot.capacity > 0 ? Math.min(100, Math.round((actualBooked / slot.capacity) * 100)) : 0;
                    return (
                      <div key={slot.id} className="p-6 hover:bg-gray-50/80 transition-all group rounded-[32px]">
                        {editingSlotId === slot.id ? (
                          <div className="space-y-4">
                            <div className="flex justify-between items-center"><span className="text-lg font-black">{slot.time}</span><div className="flex gap-2"><button onClick={() => saveEdit(slot.id)} className="p-2 bg-black text-white rounded-xl hover:opacity-80 transition-opacity"><Check size={16}/></button><button onClick={() => setEditingSlotId(null)} className="p-2 bg-white border border-gray-200 text-gray-400 rounded-xl hover:text-black transition-colors"><X size={16}/></button></div></div>
                            <div className="grid grid-cols-1 gap-4">
                              <div className="bg-white p-3 rounded-2xl border border-gray-100"><label className="text-[10px] font-black text-gray-400 block mb-1 uppercase tracking-widest">Capacity (정원)</label><input type="number" value={editValues.capacity} onChange={(e) => setEditValues({...editValues, capacity: e.target.value})} className="w-full text-base font-black outline-none" /></div>
                            </div>
                            <p className="text-[10px] text-gray-400 px-2">* 잔여석은 예약된 인원을 제외하고 자동으로 재계산됩니다.</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="text-2xl font-black tracking-tighter">{slot.time}</div>
                                <div className={cn("px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-colors duration-300", slot.status === "open" ? "bg-green-50 text-green-600 border-green-100" : "bg-red-50 text-red-600 border-red-100")}>{slot.status === "open" ? "Active" : "Closed"}</div>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                                <button onClick={() => startEditing(slot)} className="p-2.5 hover:bg-white rounded-xl text-black border border-transparent hover:border-gray-100 shadow-none hover:shadow-sm transition-all"><Edit2 size={16}/></button>
                                <button onClick={() => toggleSlotStatus(slot.id, slot.status)} className="p-2.5 hover:bg-white rounded-xl text-black border border-transparent hover:border-gray-100 shadow-none hover:shadow-sm transition-all">{slot.status === "open" ? <PowerOff size={16}/> : <Power size={16}/>}</button>
                                <button onClick={() => deleteSlot(slot.id)} className="p-2.5 hover:bg-red-50 rounded-xl text-gray-300 hover:text-red-500 transition-all"><Trash2 size={16}/></button>
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              <div className="flex justify-between items-end">
                                <div className="flex gap-4">
                                  <div className="flex flex-col"><span className="text-[9px] text-gray-400 font-black uppercase tracking-widest">Booked</span><span className="text-sm font-black text-zinc-900">{actualBooked}</span></div>
                                  <div className="flex flex-col"><span className="text-[9px] text-blue-400 font-black uppercase tracking-widest">Rem</span><span className="text-sm font-black text-blue-600">{displayRemaining}</span></div>
                                </div>
                                <div className="text-right flex items-center gap-2">
                                  <span className="text-sm font-black tracking-tight">{rate}%</span>
                                </div>
                              </div>
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden border border-gray-200/50">
                                <div className={cn("h-full transition-all duration-1000 ease-out rounded-full", rate >= 90 ? "bg-red-500" : rate >= 70 ? "bg-amber-500" : "bg-black")} style={{ width: `${rate}%` }} />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {timeSlots.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center py-20"><Clock className="text-gray-200 mb-4" size={48} /><p className="text-gray-400 font-black uppercase tracking-widest text-sm">No Time Slots</p></div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Reservation List */}
          <div className="xl:w-[58%] flex flex-col space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2 h-auto md:h-8">
              <h2 className="text-sm font-black flex items-center gap-2 uppercase tracking-widest text-gray-500"><Users size={18} /> Guest List</h2>
              <div className="relative group">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-black transition-colors" />
                <input type="text" placeholder="연락처 검색" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-12 pr-6 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs font-bold focus:outline-none focus:ring-4 focus:ring-black/5 transition-all w-full md:w-64 shadow-sm" />
              </div>
            </div>

            <div className="bg-white rounded-[40px] p-8 shadow-sm border border-gray-100 flex-1 flex flex-col relative overflow-hidden">
              <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-4 scrollbar-hide">
                <button onClick={() => setFilterTime("all")} className={cn("px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap", filterTime === "all" ? "bg-black text-white shadow-xl shadow-black/10 scale-105" : "bg-gray-100 text-gray-400 hover:bg-gray-200")}>All</button>
                {timeSlots.map(slot => (
                  <button key={slot.id} onClick={() => setFilterTime(slot.time)} className={cn("px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap", filterTime === slot.time ? "bg-black text-white shadow-xl shadow-black/10 scale-105" : "bg-gray-100 text-gray-400 hover:bg-gray-200")}>{slot.time}</button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-hide">
                <table className="w-full text-sm text-left border-separate border-spacing-y-3">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]"><th className="px-6 pb-4">Guest Time</th><th className="px-6 pb-4">Contact Info</th><th className="px-6 pb-4 text-center">Action</th></tr>
                  </thead>
                  <tbody>
                    {filteredReservations.map(res => (
                      <tr key={res.id} className="group transition-all">
                        <td className="px-6 py-5 bg-[#F8F9FA] group-hover:bg-[#F1F3F5] rounded-l-[24px] font-black text-base border-y border-l border-transparent group-hover:border-gray-100 transition-all">{res.time}</td>
                        <td className="px-6 py-5 bg-[#F8F9FA] group-hover:bg-[#F1F3F5] font-bold tracking-[0.1em] text-zinc-600 border-y border-transparent group-hover:border-gray-100 transition-all">{formatPhone(res.phone)}</td>
                        <td className="px-6 py-5 bg-[#F8F9FA] group-hover:bg-[#F1F3F5] rounded-r-[24px] text-center border-y border-r border-transparent group-hover:border-gray-100 transition-all">
                          <button onClick={() => deleteReservation(res.id, res.timeSlotId)} className="w-10 h-10 mx-auto flex items-center justify-center text-zinc-300 hover:text-red-500 hover:bg-white rounded-xl transition-all shadow-none hover:shadow-sm"><Trash2 size={18} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredReservations.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-center"><div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-200"><Users size={24} /></div><p className="text-gray-400 text-xs font-bold tracking-widest uppercase">{searchTerm ? "No Results" : "Empty List"}</p></div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );

  function formatPhone(cleaned) {
    if (cleaned.length > 7) return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}`;
    if (cleaned.length > 3) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    return cleaned;
  }

  function startEditing(slot) {
    setEditingSlotId(slot.id);
    setEditValues({ capacity: slot.capacity });
  }
}
