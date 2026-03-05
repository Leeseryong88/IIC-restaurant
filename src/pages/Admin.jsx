import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, where, getDocs, doc, setDoc, updateDoc, deleteDoc, increment, onSnapshot, serverTimestamp } from "firebase/firestore";
import { Users, Clock, Settings, Trash2, Power, PowerOff, RefreshCw, ChevronLeft, Plus, Check, X, Edit2 } from "lucide-react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";

export default function Admin() {
  const [timeSlots, setTimeSlots] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('sv-SE'));
  const [customTimes, setCustomTimes] = useState("11:30, 12:00, 12:30");
  const [editingSlotId, setEditingSlotId] = useState(null);
  const [editValues, setEditValues] = useState({ capacity: 20, remaining: 20 });

  // 실시간 타임슬롯 및 예약 조회
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

    return () => { unsubSlots(); unsubRes(); };
  }, [selectedDate]);

  // 지정된 시간으로 예약 판 생성
  const initializeDailySlots = async () => {
    const times = customTimes.split(",").map(t => t.trim()).filter(t => t.length > 0);
    if (times.length === 0) {
      alert("생성할 시간을 입력해 주세요 (예: 11:30, 12:00)");
      return;
    }
    
    if (!confirm(`${selectedDate} 날짜에 [${times.join(", ")}] 시간대의 예약 판을 생성하시겠습니까?`)) return;
    
    setLoading(true);
    try {
      const promises = times.map(time => {
        const id = `${selectedDate}_${time.replace(":", "")}`;
        return setDoc(doc(db, "timeSlots", id), {
          id,
          date: selectedDate,
          time,
          capacity: 20,
          remaining: 20,
          status: "open"
        }, { merge: true }); // 이미 있으면 덮어쓰지 않고 병합 (정원 등 초기화 주의)
      });
      await Promise.all(promises);
      alert("예약 판이 생성되었습니다.");
    } catch (err) {
      console.error(err);
      alert("생성 중 오류 발생");
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-gray-400 hover:text-black transition-colors"><ChevronLeft /></Link>
          <h1 className="text-xl font-bold tracking-tight">IIC RESTAURANT ADMIN</h1>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border-none bg-gray-100 px-4 py-2 rounded-lg text-sm font-medium focus:ring-2 focus:ring-black/5"
          />
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="text"
            value={customTimes}
            onChange={(e) => setCustomTimes(e.target.value)}
            placeholder="시간 입력 (쉼표 구분)"
            className="bg-gray-100 px-4 py-2 rounded-lg text-sm focus:ring-2 focus:ring-black/5 border-none w-48"
          />
          <button 
            onClick={initializeDailySlots}
            disabled={loading}
            className="bg-brand-dark text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-black/90 transition-all"
          >
            <Plus size={16} />
            예약판 생성
          </button>
        </div>
      </header>

      <main className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto w-full">
        {/* Left: Time Slots Management */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <Settings size={20} className="text-gray-400" />
              시간대 관리
            </h2>
            <div className="space-y-4">
              {timeSlots.map(slot => (
                <div key={slot.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex flex-col gap-3 group">
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-bold">{slot.time}</div>
                    <div className="flex items-center gap-1">
                      {editingSlotId === slot.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => saveEdit(slot.id)} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check size={18}/></button>
                          <button onClick={() => setEditingSlotId(null)} className="p-1 text-red-600 hover:bg-red-50 rounded"><X size={18}/></button>
                        </div>
                      ) : (
                        <button onClick={() => startEditing(slot)} className="p-1 text-gray-400 hover:text-black hover:bg-white rounded transition-all opacity-0 group-hover:opacity-100"><Edit2 size={16}/></button>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white p-2 rounded-lg border border-gray-100">
                      <div className="text-[10px] text-gray-400 uppercase font-bold">총 정원</div>
                      {editingSlotId === slot.id ? (
                        <input 
                          type="number" 
                          value={editValues.capacity} 
                          onChange={(e) => setEditValues({...editValues, capacity: e.target.value})}
                          className="w-full text-sm font-bold border-none p-0 focus:ring-0"
                        />
                      ) : (
                        <div className="text-sm font-bold">{slot.capacity}석</div>
                      )}
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-gray-100">
                      <div className="text-[10px] text-gray-400 uppercase font-bold">잔여 좌석</div>
                      {editingSlotId === slot.id ? (
                        <input 
                          type="number" 
                          value={editValues.remaining} 
                          onChange={(e) => setEditValues({...editValues, remaining: e.target.value})}
                          className="w-full text-sm font-bold border-none p-0 focus:ring-0 text-blue-600"
                        />
                      ) : (
                        <div className="text-sm font-bold text-blue-600">{slot.remaining}석</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 mt-1">
                    <button 
                      onClick={() => toggleSlotStatus(slot.id, slot.status)}
                      className={clsx(
                        "text-xs px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-1.5",
                        slot.status === "open" ? "bg-green-50 text-green-600 hover:bg-green-100" : "bg-red-50 text-red-600 hover:bg-red-100"
                      )}
                    >
                      {slot.status === "open" ? <><Power size={12} /> 예약 중</> : <><PowerOff size={12} /> 예약 마감</>}
                    </button>
                    <button 
                      onClick={() => deleteSlot(slot.id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {timeSlots.length === 0 && <p className="text-center py-10 text-gray-400 text-sm">설정된 시간대가 없습니다.</p>}
            </div>
          </div>
        </div>

        {/* Right: Reservations Dashboard */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-full">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <Users size={20} className="text-gray-400" />
              실시간 예약 현황 ({reservations.length}명)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-400 uppercase border-b border-gray-50">
                  <tr>
                    <th className="py-4 px-2">시간</th>
                    <th className="py-4 px-2">연락처</th>
                    <th className="py-4 px-2">예약일시</th>
                    <th className="py-4 px-2 text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {reservations.map(res => (
                    <tr key={res.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-2 font-bold">{res.time}</td>
                      <td className="py-4 px-2 tracking-wider font-medium">{formatPhone(res.phone)}</td>
                      <td className="py-4 px-2 text-gray-400">{res.createdAt?.toDate().toLocaleString() || "-"}</td>
                      <td className="py-4 px-2 text-right">
                        <button 
                          onClick={() => deleteReservation(res.id, res.timeSlotId)}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {reservations.length === 0 && (
                    <tr>
                      <td colSpan="4" className="text-center py-20 text-gray-400">예약 내역이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
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
