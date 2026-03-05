import React, { useState, useEffect } from "react";
import { db, auth } from "../firebase";
import { updatePassword } from "firebase/auth";
import { collection, query, where, getDocs, doc, setDoc, updateDoc, deleteDoc, increment, onSnapshot, serverTimestamp, orderBy, writeBatch } from "firebase/firestore";
import { Users, Clock, Settings, Trash2, Power, PowerOff, RefreshCw, ChevronLeft, Plus, Check, X, Edit2, Lock, ShieldCheck, Search, Shield, Calendar as CalendarIcon, Hash, Layers, Sliders, PlayCircle } from "lucide-react";
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
  
  // 예약판 생성 관련 상태 (객체 배열 형식으로 관리: { time, capacity })
  const [customSlots, setCustomSlots] = useState(() => {
    const saved = localStorage.getItem("iic_admin_custom_slots_v3");
    return saved ? JSON.parse(saved) : [
      { time: "11:30", capacity: 20 },
      { time: "12:00", capacity: 20 },
      { time: "12:30", capacity: 20 }
    ];
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [targetDates, setTargetDates] = useState([new Date().toLocaleDateString('sv-SE')]); // 생성 대상 날짜들
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
  
  const [newPassword, setNewPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterTime, setFilterTime] = useState("all");

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

    // 시스템 설정 구독
    const unsubConfig = onSnapshot(doc(db, "settings", "config"), (docSnap) => {
      if (docSnap.exists()) {
        setSysConfig(docSnap.data());
      }
    });

    return () => { unsubSlots(); unsubRes(); unsubConfig(); };
  }, [selectedDate]);

  // 모든 예약판 목록 가져오기
  useEffect(() => {
    if (!showAllBoardsModal) return;

    const qAll = query(collection(db, "timeSlots"), orderBy("date", "desc"));
    const unsubAll = onSnapshot(qAll, (snap) => {
      const data = snap.docs.map(doc => doc.data());
      // 날짜별로 그룹화
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

  const filteredReservations = reservations.filter(res => {
    const matchesSearch = res.phone.includes(searchTerm.replace(/-/g, "")) || res.time.includes(searchTerm);
    const matchesTime = filterTime === "all" || res.time === filterTime;
    return matchesSearch && matchesTime;
  });

  const addSlotField = () => {
    setCustomSlots([...customSlots, { time: "13:00", capacity: 20 }]);
  };

  const removeSlotField = (index) => {
    const newSlots = customSlots.filter((_, i) => i !== index);
    setCustomSlots(newSlots);
  };

  const updateSlotValue = (index, field, value) => {
    const newSlots = [...customSlots];
    newSlots[index][field] = field === "capacity" ? Number(value) : value;
    setCustomSlots(newSlots);
  };

  const handleCreateBoard = async () => {
    const validSlots = customSlots.filter(s => s.time.trim().length > 0 && s.capacity > 0);
    const validDates = targetDates.filter(d => d.trim().length > 0);

    if (validSlots.length === 0) {
      alert("올바른 시간과 인원을 입력해 주세요.");
      return;
    }
    if (validDates.length === 0) {
      alert("날짜를 하나 이상 선택해 주세요.");
      return;
    }
    
    setLoading(true);
    try {
      // 기록 저장
      localStorage.setItem("iic_admin_custom_slots_v3", JSON.stringify(validSlots));
      
      const batch = writeBatch(db);
      
      validDates.forEach(date => {
        validSlots.forEach(slot => {
          const id = `${date}_${slot.time.replace(":", "")}`;
          batch.set(doc(db, "timeSlots", id), {
            id,
            date: date,
            time: slot.time,
            capacity: slot.capacity,
            remaining: slot.capacity,
            status: "open"
          }, { merge: true });
        });
      });

      await batch.commit();
      setShowCreateModal(false);
      alert(`${validDates.length}개 날짜의 예약판이 생성되었습니다.`);
    } catch (err) {
      console.error(err);
      alert("생성 중 오류 발생");
    } finally {
      setLoading(false);
    }
  };

  const deleteBoard = async (date) => {
    if (!confirm(`${date} 날짜의 모든 예약판과 예약 내역이 삭제됩니다. 계속하시겠습니까?`)) return;
    
    setLoading(true);
    try {
      // 1. 해당 날짜의 모든 타임슬롯 가져오기
      const qSlots = query(collection(db, "timeSlots"), where("date", "==", date));
      const slotSnap = await getDocs(qSlots);
      
      // 2. 해당 날짜의 모든 예약 가져오기
      const qRes = query(collection(db, "reservations"), where("date", "==", date));
      const resSnap = await getDocs(qRes);
      
      const batch = writeBatch(db);
      
      slotSnap.docs.forEach(d => batch.delete(d.ref));
      resSnap.docs.forEach(d => batch.delete(d.ref));
      
      await batch.commit();
      alert(`${date} 데이터가 삭제되었습니다.`);
    } catch (err) {
      console.error(err);
      alert("삭제 중 오류 발생");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      await setDoc(doc(db, "settings", "config"), sysConfig, { merge: true });
      setShowSettingsModal(false);
      alert("설정이 저장되었습니다.");
    } catch (err) {
      console.error(err);
      alert("설정 저장 중 오류 발생");
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (slot) => {
    setEditingSlotId(slot.id);
    setEditValues({ capacity: slot.capacity, remaining: slot.remaining });
  };

  const saveEdit = async (slotId) => {
    try {
      await updateDoc(doc(db, "timeSlots", slotId), {
        capacity: Number(editValues.capacity),
        remaining: Number(editValues.remaining)
      });
      setEditingSlotId(null);
    } catch (err) {
      alert("수정 중 오류 발생");
    }
  };

  const toggleSlotStatus = async (slotId, currentStatus) => {
    const newStatus = currentStatus === "open" ? "closed" : "open";
    await updateDoc(doc(db, "timeSlots", slotId), { status: newStatus });
  };

  const deleteSlot = async (slotId) => {
    if (confirm("해당 시간대를 삭제하시겠습니까?")) {
      await deleteDoc(doc(db, "timeSlots", slotId));
    }
  };

  const deleteReservation = async (resId, slotId) => {
    if (confirm("해당 예약을 취소(삭제)하시겠습니까?")) {
      await deleteDoc(doc(db, "reservations", resId));
      await updateDoc(doc(db, "timeSlots", slotId), { remaining: increment(1) });
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      alert("비밀번호는 최소 6자 이상이어야 합니다.");
      return;
    }
    if (!confirm("관리자 비밀번호를 변경하시겠습니까?")) return;
    setIsUpdatingPassword(true);
    try {
      const user = auth.currentUser;
      if (user) {
        await updatePassword(user, newPassword);
        alert("비밀번호가 성공적으로 변경되었습니다.");
        setNewPassword("");
        setShowSecurityModal(false);
      }
    } catch (err) {
      alert(err.code === "auth/requires-recent-login" ? "다시 로그인 후 시도해 주세요." : "오류가 발생했습니다.");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col font-sans text-[#1A1A1A] relative">
      {/* Create Board Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[40px] p-10 shadow-2xl animate-in zoom-in-95 duration-300 relative border border-gray-100">
            <button onClick={() => setShowCreateModal(false)} className="absolute top-8 right-8 text-gray-300 hover:text-black transition-colors"><X size={24} /></button>
            <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 bg-gray-50 rounded-[24px] flex items-center justify-center mb-4 text-black border border-gray-100 shadow-sm"><Plus size={32} /></div>
              <h3 className="text-2xl font-black tracking-tight uppercase">Create Board</h3>
              <p className="text-gray-400 text-sm mt-1">예약판을 생성할 날짜와 시간대를 설정하세요.</p>
            </div>
            
            <div className="space-y-8 max-h-[550px] overflow-y-auto px-2 scrollbar-hide">
              {/* Dates Selection */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Target Dates</label>
                  <button 
                    onClick={() => setTargetDates([...targetDates, new Date().toLocaleDateString('sv-SE')])}
                    className="text-[10px] font-black text-black hover:opacity-60 flex items-center gap-1"
                  >
                    <Plus size={12} /> 날짜 추가
                  </button>
                </div>
                <div className="space-y-2">
                  {targetDates.map((date, idx) => (
                    <div key={idx} className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-200">
                      <div className="flex-1 flex items-center bg-gray-50 border border-gray-100 rounded-2xl px-5 py-3 gap-3">
                        <CalendarIcon size={16} className="text-gray-400" />
                        <input 
                          type="date" 
                          value={date} 
                          onChange={(e) => {
                            const newDates = [...targetDates];
                            newDates[idx] = e.target.value;
                            setTargetDates(newDates);
                          }}
                          className="bg-transparent border-none text-sm font-bold focus:ring-0 p-0 w-full"
                        />
                      </div>
                      {targetDates.length > 1 && (
                        <button onClick={() => setTargetDates(targetDates.filter((_, i) => i !== idx))} className="p-3 text-gray-300 hover:text-red-500 transition-all">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Time Slots Config */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Time & Capacity</label>
                  <button onClick={addSlotField} className="text-[10px] font-black text-black hover:opacity-60 flex items-center gap-1">
                    <Plus size={12} /> 시간대 추가
                  </button>
                </div>
                <div className="space-y-3">
                  {customSlots.map((slot, index) => (
                    <div key={index} className="flex items-center gap-3 animate-in slide-in-from-left-2 duration-200">
                      <div className="flex-1 flex items-center bg-gray-50 border border-gray-100 rounded-2xl px-5 py-3 gap-3">
                        <Clock size={16} className="text-gray-400" />
                        <input 
                          type="text" 
                          value={slot.time} 
                          onChange={(e) => updateSlotValue(index, "time", e.target.value)}
                          placeholder="11:30"
                          className="bg-transparent border-none text-base font-bold focus:ring-0 p-0 w-full"
                        />
                      </div>
                      <div className="w-24 flex items-center bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 gap-2">
                        <Users size={14} className="text-gray-400" />
                        <input 
                          type="number" 
                          value={slot.capacity} 
                          onChange={(e) => updateSlotValue(index, "capacity", e.target.value)}
                          className="bg-transparent border-none text-base font-bold focus:ring-0 p-0 w-full text-center"
                        />
                      </div>
                      {customSlots.length > 1 && (
                        <button onClick={() => removeSlotField(index)} className="p-3 text-gray-300 hover:text-red-500 transition-all">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-gray-100 mt-6">
              <button 
                onClick={handleCreateBoard} 
                disabled={loading} 
                className="w-full bg-black text-white py-5 rounded-[20px] font-bold text-base hover:opacity-90 transition-all shadow-xl shadow-black/10 active:scale-[0.98] disabled:bg-gray-200"
              >
                {loading ? "Creating..." : `${targetDates.length}개 날짜 예약판 생성하기`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* All Boards Modal */}
      {showAllBoardsModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[40px] p-10 shadow-2xl animate-in zoom-in-95 duration-300 relative border border-gray-100">
            <button onClick={() => setShowAllBoardsModal(false)} className="absolute top-8 right-8 text-gray-300 hover:text-black transition-colors"><X size={24} /></button>
            <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 bg-gray-50 rounded-[24px] flex items-center justify-center mb-4 text-black border border-gray-100 shadow-sm"><Layers size={32} /></div>
              <h3 className="text-2xl font-black tracking-tight uppercase">All Reservation Boards</h3>
              <p className="text-gray-400 text-sm mt-1">생성된 모든 날짜별 예약판 목록</p>
            </div>
            
            <div className="space-y-4 max-h-[500px] overflow-y-auto px-2 scrollbar-hide">
              {allBoards.map((board, idx) => (
                <div key={board.date} className="bg-gray-50 border border-gray-100 rounded-3xl p-6 flex items-center justify-between hover:border-gray-200 transition-all group">
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Date</span>
                      <span className="text-lg font-black tracking-tight">{board.date}</span>
                    </div>
                    <div className="h-8 w-[1px] bg-gray-200" />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Slots</span>
                      <div className="flex gap-2">
                        {board.slots.map(s => (
                          <span key={s.id} className="text-[11px] font-bold bg-white px-2 py-1 rounded-lg border border-gray-100">{s.time}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        setSelectedDate(board.date);
                        setShowAllBoardsModal(false);
                      }}
                      className="px-4 py-2 bg-white text-black text-xs font-black rounded-xl border border-gray-100 hover:bg-black hover:text-white transition-all shadow-sm"
                    >
                      VIEW
                    </button>
                    <button 
                      onClick={() => deleteBoard(board.date)}
                      className="p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
              {allBoards.length === 0 && (
                <div className="py-20 flex flex-col items-center justify-center text-gray-300">
                  <Layers size={48} className="mb-4 opacity-20" />
                  <p className="font-bold">생성된 예약판이 없습니다.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* System Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl animate-in zoom-in-95 duration-300 relative border border-gray-100">
            <button onClick={() => setShowSettingsModal(false)} className="absolute top-8 right-8 text-gray-300 hover:text-black transition-colors"><X size={24} /></button>
            <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 bg-gray-50 rounded-[24px] flex items-center justify-center mb-4 text-black border border-gray-100 shadow-sm"><Sliders size={32} /></div>
              <h3 className="text-2xl font-black tracking-tight uppercase">Reservation Settings</h3>
              <p className="text-gray-400 text-sm mt-1">시스템 예약 가능 시간 설정</p>
            </div>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">식사 운영 시간 (표시용)</label>
                <div className="flex items-center bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 gap-3">
                  <Clock size={18} className="text-gray-400" />
                  <input 
                    type="text" 
                    value={sysConfig.operatingHours} 
                    onChange={(e) => setSysConfig({...sysConfig, operatingHours: e.target.value})}
                    placeholder="11:30 — 13:30"
                    className="bg-transparent border-none text-base font-bold focus:ring-0 p-0 w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">당일 예약 시작 시간</label>
                  <div className="flex items-center bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 gap-3">
                    <PlayCircle size={18} className="text-gray-400" />
                    <input 
                      type="text" 
                      value={sysConfig.reservationStart} 
                      onChange={(e) => setSysConfig({...sysConfig, reservationStart: e.target.value})}
                      placeholder="09:00"
                      className="bg-transparent border-none text-base font-bold focus:ring-0 p-0 w-full"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">당일 예약 마감 시간</label>
                  <div className="flex items-center bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 gap-3">
                    <PowerOff size={18} className="text-gray-400" />
                    <input 
                      type="text" 
                      value={sysConfig.reservationCutoff} 
                      onChange={(e) => setSysConfig({...sysConfig, reservationCutoff: e.target.value})}
                      placeholder="11:00"
                      className="bg-transparent border-none text-base font-bold focus:ring-0 p-0 w-full"
                    />
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 px-1 mt-1">* 설정된 시간 범위 내에서만 당일 예약이 가능합니다.</p>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <div className="flex flex-col">
                  <span className="text-sm font-black">예약 시스템 활성화</span>
                  <span className="text-[10px] text-gray-400">전체 예약 기능 On/Off</span>
                </div>
                <button 
                  onClick={() => setSysConfig({...sysConfig, isReservationEnabled: !sysConfig.isReservationEnabled})}
                  className={cn(
                    "w-14 h-8 rounded-full relative transition-all duration-300",
                    sysConfig.isReservationEnabled ? "bg-black" : "bg-gray-200"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-6 h-6 bg-white rounded-full transition-all duration-300 shadow-sm",
                    sysConfig.isReservationEnabled ? "left-7" : "left-1"
                  )} />
                </button>
              </div>
            </div>

            <div className="pt-8 border-t border-gray-100 mt-8">
              <button 
                onClick={handleSaveSettings} 
                disabled={loading} 
                className="w-full bg-black text-white py-5 rounded-[20px] font-bold text-base hover:opacity-90 transition-all shadow-xl shadow-black/10 active:scale-[0.98]"
              >
                {loading ? "Saving..." : "설정 저장하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security Modal */}
      {showSecurityModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl animate-in zoom-in-95 duration-300 relative border border-gray-100">
            <button onClick={() => setShowSecurityModal(false)} className="absolute top-8 right-8 text-gray-300 hover:text-black transition-colors"><X size={24} /></button>
            <div className="flex flex-col items-center mb-10">
              <div className="w-20 h-20 bg-gray-50 rounded-[30px] flex items-center justify-center mb-6 text-black border border-gray-100 shadow-sm"><ShieldCheck size={40} /></div>
              <h3 className="text-2xl font-black tracking-tight">Security</h3>
              <p className="text-gray-400 text-sm mt-2">관리자 비밀번호 변경</p>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] px-1">New Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••" className="w-full p-5 bg-gray-50 border border-gray-100 rounded-[20px] focus:outline-none focus:ring-4 focus:ring-black/5 focus:border-black/10 transition-all text-lg" />
              </div>
              <button type="submit" disabled={isUpdatingPassword} className="w-full bg-black text-white py-5 rounded-[20px] font-bold text-base hover:opacity-90 transition-all shadow-xl shadow-black/10 active:scale-[0.98] disabled:bg-gray-200">{isUpdatingPassword ? "Processing..." : "비밀번호 변경"}</button>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 px-10 py-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-4">
            <Link to="/" className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center hover:scale-105 transition-transform"><ChevronLeft size={20}/></Link>
            <h1 className="text-xl font-black tracking-tighter uppercase">IIC Admin</h1>
          </div>
          <div className="h-8 w-[1px] bg-gray-100 hidden md:block" />
          <div className="flex items-center bg-gray-50 rounded-2xl p-1 border border-gray-100 shadow-inner">
            <div className="flex items-center px-4 py-2 gap-2 text-gray-400">
              <CalendarIcon size={16} />
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent border-none text-sm font-bold text-black focus:ring-0 p-0" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              setTargetDates([selectedDate]);
              setShowCreateModal(true);
            }} 
            className="bg-black text-white px-6 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 hover:bg-zinc-800 transition-all shadow-lg shadow-black/5 active:scale-95"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">예약판 생성</span>
          </button>
          
          <button 
            onClick={() => setShowAllBoardsModal(true)} 
            className="w-12 h-12 flex items-center justify-center text-black hover:bg-gray-50 rounded-2xl transition-all border border-transparent hover:border-gray-100"
            title="모든 예약판 보기"
          >
            <Layers size={20} />
          </button>

          <button 
            onClick={() => setShowSettingsModal(true)} 
            className="w-12 h-12 flex items-center justify-center text-black hover:bg-gray-50 rounded-2xl transition-all border border-transparent hover:border-gray-100"
            title="시스템 설정"
          >
            <Sliders size={20} />
          </button>

          <button onClick={() => setShowSecurityModal(true)} className="w-12 h-12 flex items-center justify-center text-black hover:bg-gray-50 rounded-2xl transition-all border border-transparent hover:border-gray-100"><Lock size={20} /></button>
        </div>
      </header>

      <main className="p-10 grid grid-cols-1 xl:grid-cols-12 gap-10 max-w-[1600px] mx-auto w-full flex-1">
        {/* Left Column: Compact Time Slots */}
        <div className="xl:col-span-4 space-y-6">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-sm font-black flex items-center gap-2 uppercase tracking-tighter">
              <Clock className="text-black" size={18} />
              시간대 관리
            </h2>
            <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{timeSlots.length} Slots</span>
          </div>

          <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-50">
              {timeSlots.map(slot => (
                <div key={slot.id} className="p-4 hover:bg-gray-50/50 transition-all group">
                  {editingSlotId === slot.id ? (
                    <div className="space-y-3 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-black">{slot.time}</div>
                        <div className="flex gap-1">
                          <button onClick={() => saveEdit(slot.id)} className="p-1.5 bg-black text-white rounded-lg hover:opacity-80 transition-all"><Check size={14}/></button>
                          <button onClick={() => setEditingSlotId(null)} className="p-1.5 bg-white border border-gray-200 text-gray-400 rounded-lg hover:text-black transition-all"><X size={14}/></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white p-2 rounded-xl border border-gray-100">
                          <label className="text-[8px] font-black text-gray-400 uppercase block mb-1 tracking-widest">Cap</label>
                          <input type="number" value={editValues.capacity} onChange={(e) => setEditValues({...editValues, capacity: e.target.value})} className="w-full text-xs font-bold focus:outline-none" />
                        </div>
                        <div className="bg-white p-2 rounded-xl border border-gray-100">
                          <label className="text-[8px] font-black text-blue-400 uppercase block mb-1 tracking-widest">Rem</label>
                          <input type="number" value={editValues.remaining} onChange={(e) => setEditValues({...editValues, remaining: e.target.value})} className="w-full text-xs font-bold text-blue-600 focus:outline-none" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="text-base font-black tracking-tight w-12">{slot.time}</div>
                        <div className="flex items-center gap-3 bg-gray-50 px-3 py-1.5 rounded-2xl border border-gray-100">
                          <div className="flex flex-col items-center">
                            <span className="text-[8px] text-gray-400 font-bold uppercase leading-none mb-0.5 tracking-tighter">Cap</span>
                            <span className="text-xs font-black tracking-tighter">{slot.capacity}</span>
                          </div>
                          <div className="w-[1px] h-4 bg-gray-200" />
                          <div className="flex flex-col items-center">
                            <span className="text-[8px] text-blue-400 font-bold uppercase leading-none mb-0.5 tracking-tighter">Rem</span>
                            <span className="text-xs font-black text-blue-600 tracking-tighter">{slot.remaining}</span>
                          </div>
                        </div>
                        <div className={cn(
                          "px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider border",
                          slot.status === "open" ? "bg-green-50 text-green-600 border-green-100" : "bg-red-50 text-red-600 border-red-100"
                        )}>
                          {slot.status === "open" ? "Active" : "Closed"}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-1 group-hover:translate-x-0">
                        <button onClick={() => startEditing(slot)} className="p-1.5 hover:bg-white rounded-lg text-black border border-transparent hover:border-gray-100 shadow-none hover:shadow-sm transition-all"><Edit2 size={14}/></button>
                        <button onClick={() => toggleSlotStatus(slot.id, slot.status)} className="p-1.5 hover:bg-white rounded-lg text-black border border-transparent hover:border-gray-100 shadow-none hover:shadow-sm transition-all">
                          {slot.status === "open" ? <PowerOff size={14}/> : <Power size={14}/>}
                        </button>
                        <button onClick={() => deleteSlot(slot.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-500 transition-all"><Trash2 size={14}/></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {timeSlots.length === 0 && (
              <div className="p-12 flex flex-col items-center justify-center text-center border-t border-gray-50">
                <Clock className="text-gray-100 mb-2" size={32} />
                <p className="text-gray-400 text-xs font-bold tracking-widest uppercase">No Slots Found</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Reservations List */}
        <div className="xl:col-span-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
            <h2 className="text-sm font-black flex items-center gap-2 uppercase tracking-tighter">
              <Users className="text-black" size={18} />
              예약 현황
              <span className="bg-black text-white text-[10px] px-2 py-0.5 rounded-lg ml-1">{filteredReservations.length}</span>
            </h2>
            
            <div className="flex items-center gap-3">
              <div className="relative group flex-1 md:flex-none">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-black transition-colors" />
                <input type="text" placeholder="연락처 검색" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-12 pr-6 py-2.5 bg-white border border-gray-100 rounded-2xl text-xs font-bold focus:outline-none focus:ring-4 focus:ring-black/5 focus:border-black/5 transition-all w-full md:w-64 shadow-sm" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[40px] p-8 shadow-sm border border-gray-100 min-h-[600px] flex flex-col relative overflow-hidden">
            {/* Filter Tabs */}
            <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-4 scrollbar-hide">
              <button onClick={() => setFilterTime("all")} className={cn("px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap", filterTime === "all" ? "bg-black text-white shadow-xl shadow-black/10 scale-105" : "bg-gray-50 text-gray-400 hover:bg-gray-100")}>All</button>
              {timeSlots.map(slot => (
                <button key={slot.id} onClick={() => setFilterTime(slot.time)} className={cn("px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap", filterTime === slot.time ? "bg-black text-white shadow-xl shadow-black/10 scale-105" : "bg-gray-50 text-gray-400 hover:bg-gray-100")}>{slot.time}</button>
              ))}
            </div>

            <div className="flex-1 overflow-x-auto scrollbar-hide">
              <table className="w-full text-sm text-left border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-[10px] text-black font-black uppercase tracking-[0.2em]">
                    <th className="px-6 pb-2">Time</th>
                    <th className="px-6 pb-2">Contact</th>
                    <th className="px-6 pb-2 text-center">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReservations.map(res => (
                    <tr key={res.id} className="group transition-all">
                      <td className="px-6 py-4 bg-gray-50 group-hover:bg-zinc-100 rounded-l-2xl font-black text-sm transition-colors border-y border-l border-gray-50">{res.time}</td>
                      <td className="px-6 py-4 bg-gray-50 group-hover:bg-zinc-100 font-bold tracking-[0.1em] text-zinc-600 transition-colors border-y border-gray-50">{formatPhone(res.phone)}</td>
                      <td className="px-6 py-4 bg-gray-50 group-hover:bg-zinc-100 rounded-r-2xl text-center transition-colors border-y border-r border-gray-50">
                        <button onClick={() => deleteReservation(res.id, res.timeSlotId)} className="w-9 h-9 mx-auto flex items-center justify-center text-zinc-300 hover:text-red-500 hover:bg-white rounded-xl transition-all shadow-none hover:shadow-sm"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {filteredReservations.length === 0 && (
                <div className="flex flex-col items-center justify-center py-32 text-center">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-200"><Users size={24} /></div>
                  <p className="text-gray-400 text-xs font-bold tracking-widest uppercase">{searchTerm ? "No Matching Results" : "No Reservations Yet"}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );

  function formatPhone(cleaned) {
    let formatted = cleaned;
    if (cleaned.length > 3 && cleaned.length <= 7) {
      formatted = `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    } else if (cleaned.length > 7) {
      formatted = `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}`;
    }
    return formatted;
  }
}
