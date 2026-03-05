import React, { useState, useEffect } from "react";
import { db, auth } from "../firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { collection, query, where, getDocs, doc, setDoc, updateDoc, deleteDoc, increment, onSnapshot, serverTimestamp, runTransaction } from "firebase/firestore";
import { Clock, Phone, ChevronRight, X, CheckCircle2, AlertCircle, UserCog, PowerOff, PlayCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import GeometricBackground from "../components/GeometricBackground";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function Home() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("reserve"); // reserve, check
  const [timeSlots, setTimeSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', title: string, message: string }
  const [searchResult, setSearchResult] = useState(null); // found reservation data
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");

  // 시스템 설정 상태
  const [sysConfig, setSysConfig] = useState({
    operatingHours: "11:30 — 13:30",
    reservationStart: "09:00",
    reservationCutoff: "11:00",
    isReservationEnabled: true
  });

  // 실시간 타임슬롯 및 설정 조회
  useEffect(() => {
    const todayStr = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD 형식
    const q = query(
      collection(db, "timeSlots"), 
      where("status", "==", "open"),
      where("date", "==", todayStr)
    );
    const unsubscribeSlots = onSnapshot(q, (snapshot) => {
      const slots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      slots.sort((a, b) => a.time.localeCompare(b.time));
      setTimeSlots(slots);
    });

    const unsubscribeConfig = onSnapshot(doc(db, "settings", "config"), (docSnap) => {
      if (docSnap.exists()) {
        setSysConfig(docSnap.data());
      }
    });

    return () => {
      unsubscribeSlots();
      unsubscribeConfig();
    };
  }, []);

  // 예약 가능 여부 확인
  const getReservationStatus = () => {
    if (!sysConfig.isReservationEnabled) return { available: false, reason: "SYSTEM_DISABLED" };
    
    const now = new Date();
    
    // 시작 시간 체크
    if (sysConfig.reservationStart) {
      const [startHour, startMin] = sysConfig.reservationStart.split(":").map(Number);
      const startDate = new Date();
      startDate.setHours(startHour, startMin, 0, 0);
      if (now < startDate) return { available: false, reason: "BEFORE_START", time: sysConfig.reservationStart };
    }

    // 마감 시간 체크
    if (sysConfig.reservationCutoff) {
      const [cutoffHour, cutoffMin] = sysConfig.reservationCutoff.split(":").map(Number);
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffHour, cutoffMin, 0, 0);
      if (now > cutoffDate) return { available: false, reason: "AFTER_CUTOFF", time: sysConfig.reservationCutoff };
    }

    return { available: true };
  };

  const resStatus = getReservationStatus();

  // 연락처 포맷팅 (010-0000-0000)
  const formatPhone = (val) => {
    const cleaned = val.replace(/\D/g, "");
    let formatted = cleaned;
    if (cleaned.length > 3 && cleaned.length <= 7) {
      formatted = `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    } else if (cleaned.length > 7) {
      formatted = `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}`;
    }
    return formatted;
  };

  const handlePhoneChange = (e) => {
    setPhone(formatPhone(e.target.value));
  };

  const showStatus = (type, title, message) => {
    setStatus({ type, title, message });
    if (type === 'success') {
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const handleReserve = async () => {
    // 시스템 상태 체크
    if (!resStatus.available) {
      let msg = "현재 예약이 불가능합니다.";
      if (resStatus.reason === "SYSTEM_DISABLED") msg = "시스템이 일시 중지되었습니다.";
      if (resStatus.reason === "BEFORE_START") msg = `예약은 ${resStatus.time}부터 가능합니다.`;
      if (resStatus.reason === "AFTER_CUTOFF") msg = `예약은 ${resStatus.time}에 마감되었습니다.`;
      showStatus('error', '예약 불가', msg);
      return;
    }

    if (!selectedSlot || phone.length < 13) {
      showStatus('error', '입력 오류', '시간을 선택하고 올바른 연락처를 입력해 주세요.');
      return;
    }

    setLoading(true);
    try {
      const phoneNoDash = phone.replace(/-/g, "");
      const todayStr = new Date().toLocaleDateString('sv-SE');
      const resId = `${phoneNoDash}_${selectedSlot.id}`;
      const resRef = doc(db, "reservations", resId);
      const slotRef = doc(db, "timeSlots", selectedSlot.id);

      await runTransaction(db, async (transaction) => {
        // 1. 최신 타임슬롯 데이터 조회
        const slotSnap = await transaction.get(slotRef);
        if (!slotSnap.exists()) {
          throw new Error("SLOT_NOT_FOUND");
        }
        const slotData = slotSnap.data();

        // 2. 잔여석 확인
        if (slotData.remaining <= 0) {
          throw new Error("NO_SEATS_LEFT");
        }

        // 3. 중복 예약 확인 (휴대폰 번호 + 날짜 조합)
        // Note: transaction 안에서 query를 직접 쓸 수 없으므로, 예약 문서 ID(resId) 존재 여부로 확인
        const resSnap = await transaction.get(resRef);
        if (resSnap.exists()) {
          throw new Error("ALREADY_RESERVED");
        }

        // 4. 예약 생성 및 잔여석 차감
        transaction.set(resRef, {
          phone: phoneNoDash,
          timeSlotId: selectedSlot.id,
          time: slotData.time,
          date: slotData.date,
          createdAt: serverTimestamp(),
        });

        transaction.update(slotRef, {
          remaining: slotData.remaining - 1
        });
      });

      showStatus('success', '예약 완료', `${selectedSlot.time} 예약이 성공적으로 완료되었습니다.`);
      setPhone("");
      setSelectedSlot(null);
    } catch (err) {
      console.error(err);
      if (err.message === "NO_SEATS_LEFT") {
        showStatus('error', '매진', '선택한 시간대의 좌석이 매진되었습니다.');
      } else if (err.message === "ALREADY_RESERVED") {
        showStatus('error', '중복 예약', '이미 오늘 예약 내역이 존재합니다.');
      } else if (err.message === "SLOT_NOT_FOUND") {
        showStatus('error', '오류 발생', '시간대 정보를 찾을 수 없습니다.');
      } else {
        showStatus('error', '오류 발생', '예약 중 문제가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOrCancel = async (type) => {
    if (phone.length < 13) {
      showStatus('error', '입력 오류', '올바른 연락처를 입력해 주세요.');
      return;
    }
    setLoading(true);
    try {
      const phoneNoDash = phone.replace(/-/g, "");
      const todayStr = new Date().toLocaleDateString('sv-SE');
      
      const q = query(
        collection(db, "reservations"), 
        where("phone", "==", phoneNoDash),
        where("date", "==", todayStr)
      );
      const snap = await getDocs(q);
      
      if (snap.empty) {
        showStatus('error', '내역 없음', '오늘 예약된 내역이 없습니다.');
        setSearchResult(null);
        return;
      }

      const resData = { id: snap.docs[0].id, ...snap.docs[0].data() };
      setSearchResult(resData);
      showStatus('success', '조회 성공', `오늘 ${resData.time} 예약이 조회되었습니다.`);
    } catch (err) {
      console.error(err);
      showStatus('error', '오류 발생', '조회 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const confirmCancel = async () => {
    if (!searchResult) return;
    setLoading(true);
    try {
      const resRef = doc(db, "reservations", searchResult.id);
      const slotRef = doc(db, "timeSlots", searchResult.timeSlotId);

      await runTransaction(db, async (transaction) => {
        const resSnap = await transaction.get(resRef);
        if (!resSnap.exists()) return; // 이미 취소됨

        const slotSnap = await transaction.get(slotRef);
        if (!slotSnap.exists()) {
          transaction.delete(resRef); // 타임슬롯은 없지만 예약만 있는 경우 삭제만 진행
          return;
        }

        const slotData = slotSnap.data();

        transaction.delete(resRef);
        transaction.update(slotRef, {
          remaining: slotData.remaining + 1
        });
      });

      showStatus('success', '취소 완료', '예약이 정상적으로 취소되었습니다.');
      setSearchResult(null);
      setPhone("");
    } catch (err) {
      console.error(err);
      showStatus('error', '오류 발생', '취소 처리 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, "iicrestaurant@gentlemonster.com", adminPassword);
      showStatus('success', '인증 성공', '관리자 페이지로 이동합니다.');
      setTimeout(() => navigate("/admin"), 1000);
    } catch (err) {
      console.error(err);
      showStatus('error', '인증 실패', '비밀번호가 올바르지 않습니다.');
      setAdminPassword("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen font-sans relative overflow-hidden">
      {/* Admin Toggle (Top Right) */}
      <div className="absolute top-6 right-6 z-40">
        <button 
          onClick={() => setShowAdminLogin(true)}
          className="p-3 bg-white/5 hover:bg-white/10 backdrop-blur-md rounded-full text-gray-400/60 hover:text-gray-200 transition-all border border-white/5"
          title="관리자 설정"
        >
          <UserCog size={20} />
        </button>
      </div>

      {/* Admin Login Modal (Page Overlay) */}
      {showAdminLogin && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black tracking-tight">ADMIN</h3>
              <button onClick={() => {setShowAdminLogin(false); setAdminPassword("");}} className="text-gray-300 hover:text-black transition-colors">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Password</label>
                <input 
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  autoFocus
                  className="w-full p-5 bg-gray-50 border border-gray-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-black/5 focus:border-gray-300 transition-all text-lg"
                />
              </div>
              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-brand-dark text-white py-5 rounded-2xl font-bold text-lg hover:bg-black/90 transition-all shadow-xl shadow-black/10 active:scale-[0.98]"
              >
                {loading ? "인증 중..." : "접속하기"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Status Overlay (Page Display) */}
      {status && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[70] w-[90%] max-w-md animate-in slide-in-from-top duration-300">
          <div className={cn(
            "p-4 rounded-2xl shadow-2xl flex items-center gap-4 border",
            status.type === 'success' ? "bg-white border-green-100" : "bg-white border-red-100"
          )}>
            {status.type === 'success' ? (
              <CheckCircle2 className="text-green-500 shrink-0" size={24} />
            ) : (
              <AlertCircle className="text-red-500 shrink-0" size={24} />
            )}
            <div className="flex-1">
              <h4 className="font-bold text-sm">{status.title}</h4>
              <p className="text-xs text-gray-500 mt-0.5">{status.message}</p>
            </div>
            <button onClick={() => setStatus(null)} className="text-gray-300 hover:text-black transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Left Section: Dark Background */}
      <div className="w-full md:w-[45%] bg-brand-dark text-white p-8 md:p-16 flex flex-col justify-between items-start sticky top-0 md:h-screen overflow-hidden">
        <GeometricBackground />
        <div className="relative z-10">
          <h1 className="text-xl font-bold tracking-widest mb-20">IIC RESTAURANT</h1>
          <div className="space-y-6">
            <span className="inline-block px-3 py-1 border border-white/30 rounded-full text-[10px] tracking-widest text-white/60">
              LUNCH RESERVATION
            </span>
            <h2 className="text-4xl md:text-6xl font-extrabold leading-tight">
              미식의 순간,<br />IIC에서.
            </h2>
            <p className="text-white/60 text-sm leading-relaxed mt-6">
              희망하는 식사 시간을 선택하시고<br />
              연락처를 입력하시면<br />
              예약이 확정됩니다.
            </p>
          </div>
        </div>
        <div className="mt-12 md:mt-0 text-white/40 text-[11px] flex items-center gap-2 relative z-10">
          <Clock size={14} />
          <span>식사 운영 시간 {sysConfig.operatingHours}</span>
        </div>
      </div>

      {/* Right Section: White Background */}
      <div className="w-full md:w-[55%] bg-white p-6 md:p-16 flex flex-col items-center">
        {/* Tab Navigation */}
        <div className="w-full max-w-xl bg-gray-100 p-1 rounded-xl flex mb-12">
          {["reserve", "check"].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setSearchResult(null);
                setStatus(null);
              }}
              className={cn(
                "flex-1 py-3 text-sm font-medium rounded-lg transition-all duration-200",
                activeTab === tab ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-600"
              )}
            >
              {tab === "reserve" ? "예약하기" : "예약 조회 및 취소"}
            </button>
          ))}
        </div>

        {/* Form Content */}
        <div className="w-full max-w-xl">
          {activeTab === "reserve" && (
            <div className="space-y-10 animate-in fade-in duration-500">
              <div>
                <h3 className="text-3xl font-bold mb-2">식사 예약</h3>
                <p className="text-gray-400 text-sm">타임 선택 후 연락처를 입력해 주세요.</p>
              </div>

              {/* System Disabled or Out of Cutoff Warning */}
              {!resStatus.available && (
                <div className="p-6 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-4 text-red-600">
                  {resStatus.reason === "BEFORE_START" ? <PlayCircle size={24} /> : <PowerOff size={24} />}
                  <div>
                    <p className="font-bold text-sm">현재 예약이 불가능합니다.</p>
                    <p className="text-xs opacity-80">
                      {resStatus.reason === "SYSTEM_DISABLED" && "시스템이 일시 중지되었습니다."}
                      {resStatus.reason === "BEFORE_START" && `예약은 ${resStatus.time}부터 가능합니다.`}
                      {resStatus.reason === "AFTER_CUTOFF" && `예약은 ${resStatus.time}에 마감되었습니다.`}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">예약 시간 선택</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {timeSlots.map((slot) => (
                    <button
                      key={slot.id}
                      onClick={() => setSelectedSlot(slot)}
                      disabled={slot.remaining <= 0 || !resStatus.available}
                      className={cn(
                        "relative p-5 rounded-xl border-2 transition-all duration-200 text-left group",
                        (slot.remaining <= 0 || !resStatus.available) && "opacity-50 cursor-not-allowed grayscale",
                        selectedSlot?.id === slot.id 
                          ? "bg-brand-dark border-brand-dark text-white shadow-xl translate-y-[-2px]" 
                          : "bg-white border-gray-100 hover:border-gray-300"
                      )}
                    >
                      <div className="text-xl font-bold mb-1">{slot.time}</div>
                      <div className={cn(
                        "text-[10px] font-medium",
                        selectedSlot?.id === slot.id ? "text-white/60" : "text-gray-400"
                      )}>
                        잔여 {Math.max(0, slot.remaining)}석
                      </div>
                      <div className={cn(
                        "mt-3 h-[2px] w-full bg-current opacity-10",
                        selectedSlot?.id === slot.id && "opacity-30"
                      )} />
                    </button>
                  ))}
                  {timeSlots.length === 0 && <p className="col-span-3 text-center py-10 text-gray-400">현재 예약 가능한 타임이 없습니다.</p>}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">연락처</label>
                <input
                  type="text"
                  placeholder="010-0000-0000"
                  value={phone}
                  onChange={handlePhoneChange}
                  disabled={!resStatus.available}
                  className="w-full p-4 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all text-lg tracking-wider disabled:opacity-50"
                />
              </div>

              <button
                onClick={handleReserve}
                disabled={loading || !resStatus.available}
                className="w-full bg-brand-dark text-white py-5 rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-black/90 active:scale-[0.98] transition-all disabled:bg-gray-400"
              >
                {loading ? "처리 중..." : "예약하기"}
                {!loading && <ChevronRight size={20} />}
              </button>
            </div>
          )}

          {activeTab === "check" && (
            <div className="space-y-10 animate-in fade-in duration-500">
               <div>
                <h3 className="text-3xl font-bold mb-2">예약 조회 및 취소</h3>
                <p className="text-gray-400 text-sm">오늘 예약하신 내역을 조회하고 취소할 수 있습니다.</p>
              </div>

              {searchResult ? (
                <div className="p-8 bg-gray-50 rounded-2xl border border-gray-100 space-y-6 animate-in zoom-in-95 duration-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-gray-400 uppercase font-bold tracking-widest">오늘의 예약</div>
                      <div className="text-4xl font-black mt-1">{searchResult.time}</div>
                    </div>
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
                      <Clock size={24} className="text-black" />
                    </div>
                  </div>
                  
                  <div className="pt-6 border-t border-gray-200/50 flex flex-col gap-1">
                    <div className="text-xs text-gray-400 font-medium">예약 연락처</div>
                    <div className="text-lg font-bold tracking-wider">{formatPhone(searchResult.phone)}</div>
                  </div>

                  <button
                    onClick={confirmCancel}
                    disabled={loading}
                    className="w-full bg-red-500 text-white py-4 rounded-xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-200"
                  >
                    {loading ? "취소 중..." : "이 예약 취소하기"}
                  </button>
                  
                  <button 
                    onClick={() => {setSearchResult(null); setPhone("");}}
                    className="w-full py-2 text-xs text-gray-400 hover:text-black transition-colors"
                  >
                    다른 번호로 조회하기
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">연락처</label>
                    <input
                      type="text"
                      placeholder="010-0000-0000"
                      value={phone}
                      onChange={handlePhoneChange}
                      className="w-full p-4 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all text-lg tracking-wider"
                    />
                  </div>

                  <button
                    onClick={() => handleCheckOrCancel(activeTab)}
                    disabled={loading}
                    className="w-full bg-brand-dark text-white py-5 rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-black/90 transition-all"
                  >
                    {loading ? "조회 중..." : "예약 조회하기"}
                    <ChevronRight size={20} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
