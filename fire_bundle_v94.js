// إعدادات Firebase الحقيقية والمستقرة
console.log("FIRE GYM SCRIPT INITIALIZING...");

// Fast Path logic moved to DOMContentLoaded for stability

window.onerror = function(m, u, l) { 
    const msg = "CRITICAL ERROR: " + m + "\nLine: " + l + "\nURL: " + u;
    console.error(msg);
};

const firebaseConfig = { 
    apiKey: "AIzaSyAxMNBdkNk_brPMlq1O3_HPRWOIqj-lb24", 
    authDomain: "fire-gym-9c753.firebaseapp.com", 
    projectId: "fire-gym-9c753", 
    storageBucket: "fire-gym-9c753.firebasestorage.app", 
    messagingSenderId: "417014585133", 
    appId: "1:417014585133:web:38f62686ae2e133298a5a4" 
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// تفعيل العمل بدون إنترنت (تم إيقافه مؤقتاً لحل مشكلة الانهيار في الموبايلات الحديثة)
/*
db.enablePersistence().catch(err => {
    console.warn("Persistence failed:", err.code);
});
*/

let currentUser = null; let activeTarget = null; let currentPlanData = {}; let finalBase64 = "";
let allUsersData = []; let editingCat = ""; let lastViewedCat = "";
const ADMIN_PHONE = "01100896637";
const PLAN_CATS = ['بنج', 'ظهر', 'كتف', 'دراع', 'رجل', 'بطن'];
const NUTRI_CATS = ['فطار', 'غداء', 'عشاء', 'سناك', 'قبل التمرين', 'بعد التمرين', 'فيتامينات ومكملات'];

// Timer Variables
let workoutStartTime = null; 
let workoutTimerInterval = null; 
let workoutSeconds = 0;
let restInterval = null;

// مخزن عالمي لأحدث الرسائل لتحديث القائمة فوراً
let adminLatestMessages = {};
let currentChatUser = null;
let chatUnsub = null;

// --- AUTH & LOGIN ---
async function login() {
    const p = document.getElementById('login-phone').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    if(!p || !pass) return Swal.fire('خطأ', 'برجاء كتابة البيانات', 'error');
    Swal.fire({ title: 'جاري التحقق...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    try {
        if(p === ADMIN_PHONE) { 
            localStorage.setItem('fire_gym_phone', p);
            const adminDoc = { phone: p, name: "كابتن أحمد", status: "approved", role: "admin" };
            await db.collection('users').doc(p).set(adminDoc, { merge: true });
            Swal.close(); enterApp(adminDoc); return; 
        }
        const snap = await db.collection('users').doc(p).get();
        Swal.close();
        if(snap.exists) {
            const data = snap.data();
            if(data.password.toString().trim() === pass) {
                if(data.status !== 'approved') return Swal.fire('انتظر', 'طلبك تحت المراجعة من الكابتن', 'warning');
                localStorage.setItem('fire_gym_phone', p);
                enterApp(data);
            } else { Swal.fire('خطأ', 'كلمة السر غير صحيحة يا وحش ❌', 'error'); }
        } else { Swal.fire('خطأ', 'رقم الموبايل ده مش مسجل عندنا.. 🔥', 'error'); }
    } catch(e) { 
        console.error(e);
        if(typeof Swal !== 'undefined') { Swal.close(); Swal.fire('خطأ', e.message, 'error'); }
        alert("Login Error: " + e.message); 
    }
}


async function register() {
    const n = document.getElementById('reg-name').value.trim();
    const p = document.getElementById('reg-phone').value.trim();
    const pass = document.getElementById('reg-pass').value.trim();
    const durationMonths = parseInt(document.getElementById('reg-duration').value) || 1;
    
    if(!n || !p || !pass) return Swal.fire('نقص بيانات', 'برجاء ملء كل الخانات يا بطل', 'warning');
    Swal.fire({ title: 'جاري إرسال طلبك...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    
    // حساب تاريخ انتهاء الاشتراك
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + durationMonths);
    
    const data = { 
        name: n, phone: p, age: document.getElementById('reg-age').value, 
        height: document.getElementById('reg-height').value, weight: document.getElementById('reg-weight').value, 
        fat: document.getElementById('reg-fat').value, goal: document.getElementById('reg-goal').value, 
        duration: durationMonths, expiryDate: expiry.getTime(),
        password: pass, status: 'pending', workoutPlan: {}, ts: firebase.firestore.FieldValue.serverTimestamp() 
    };
    try {
        await db.collection('users').doc(p).set(data);
        Swal.close();
        sendNotificationTo(ADMIN_PHONE, "طلب اشتراك جديد! 🆕", `البطل ${n} سجل بياناته ومستني موافقتك يا كوتش! 🔥`);
        Swal.fire('تم بنجاح! 🔥', 'طلبك وصل للكابتن، أول ما يوافق هتقدر تدخل حسابك فوراً', 'success');
        toggleAuth('login');
    } catch(e) { Swal.close(); Swal.fire('خطأ', 'فشل إرسال الطلب', 'error'); }
}

function logout() { 
    localStorage.removeItem('fire_gym_phone'); 
    location.reload(); 
}

let userListener = null;
async function enterApp(u) {
    currentUser = u; 
    document.getElementById('auth-section').classList.add('hidden'); 
    document.getElementById('app-content').classList.remove('hidden');
    const nav = document.getElementById('bottom-nav-bar');
    if(nav) nav.classList.remove('hidden');
    switchTab('user', document.querySelector('.bottom-tabs .tab.active'));
    
    if(userListener) userListener();
    userListener = db.collection('users').doc(u.phone).onSnapshot((doc) => {
        if(doc.exists) {
            const data = doc.data(); currentUser = data; currentPlanData = data.workoutPlan || {};
            const goal = data.goal || ""; const banner = document.getElementById('system-banner'); const title = document.getElementById('system-main-title'); const badge = document.getElementById('system-title-badge');
            if(data.role === 'admin') { 
                banner.style.background = "linear-gradient(135deg, #0f0f0f, #2a2a2a)"; title.innerText = "لوحة قيادة الكابتن 👨‍🏫"; badge.innerText = "مدير المنظومة"; badge.style.background = "linear-gradient(to right, #e53935, #b71c1c)";
            } else {
                if(goal.includes('VIP')) { banner.style.background = "linear-gradient(135deg, #1a1500, #4d3d00)"; title.innerText = "نظام VIP الملكي ⭐"; badge.innerText = "نظام VIP"; badge.style.background = "linear-gradient(to right, #ffb300, #ff8f00)"; }
                else if(goal.includes('تغذيه')) { banner.style.background = "linear-gradient(135deg, #0a140a, #1b5c2a)"; title.innerText = "نظام التغذية المتكامل 🥗"; badge.innerText = "نظام تغذية"; badge.style.background = "#4caf50"; }
                else { banner.style.background = "linear-gradient(135deg, #0a0e14, #1b3d5c)"; title.innerText = "نظام التدريب الحديدي 🏋️‍♂️"; badge.innerText = "نظام تدريب"; badge.style.background = "var(--primary)"; }
            }
            document.getElementById('user-display-name').innerText = data.name;
            document.getElementById('me-name').innerText = data.name;
            document.getElementById('me-age').innerText = (data.age || '--');
            document.getElementById('me-weight').innerText = (data.weight || '--') + ' كغم';
            document.getElementById('me-height').innerText = (data.height || '--') + ' سم';
            document.getElementById('me-fat').innerText = (data.fat || '0') + ' %';
            document.getElementById('me-goal-badge').innerText = (data.role === 'admin' ? '👑 كابتن الفريق' : (data.goal || 'بطل فير جيم'));
            if(data.photo) document.getElementById('me-photo').src = data.photo;
            
            // تحديث بيانات الاشتراك
            if(data.expiryDate) {
                const exp = data.expiryDate;
                const now = Date.now();
                const diff = exp - now;
                const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
                const dateObj = new Date(exp);
                const dateStr = `${dateObj.getDate()} / ${dateObj.getMonth()+1} / ${dateObj.getFullYear()}`;
                
                document.getElementById('me-expiry-date').innerText = dateStr;
                const daysEl = document.getElementById('me-expiry-days');
                
                if(days > 0) {
                    daysEl.innerText = `باقي ${days} يوم`;
                    daysEl.style.color = "#fff";
                    // حساب النسبة للشريط (بافتراض أقصى مدة 30 يوم للعرض الجمالي لو شهر)
                    let totalDays = (data.duration || 1) * 30;
                    let percent = Math.max(0, Math.min(100, (days / totalDays) * 100));
                    document.getElementById('expiry-progress-fill').style.width = percent + "%";
                    document.getElementById('expiry-progress-fill').style.background = percent < 20 ? "#ff3b30" : "var(--primary)";
                } else {
                    daysEl.innerText = "منتهي ⚠️";
                    daysEl.style.color = "#ff3b30";
                    document.getElementById('expiry-progress-fill').style.width = "100%";
                    document.getElementById('expiry-progress-fill').style.background = "#ff3b30";
                }
            }

            const noteBox = document.getElementById('captain-notes-box');
            if(data.captainNotes) { noteBox.classList.remove('hidden'); document.getElementById('captain-notes-text').innerText = data.captainNotes; } 
            else { noteBox.classList.add('hidden'); }
            renderUserPlanTabs();
            if(lastViewedCat) viewCatPlan(lastViewedCat, true);
        }
    });

    renderTrackerGrid(); loadUserLogs(); checkWaterReset(); initSystemNotifications(); initChatListeners();
    if(u.role === 'admin') { 
        document.getElementById('admin-nav').classList.remove('hidden'); 
        document.getElementById('admin-info-menu-btn').classList.remove('hidden');
        document.getElementById('add-technique-btn').classList.remove('hidden');
        
        // Hide Home and History for Admin
        if(document.getElementById('home-tab-nav')) document.getElementById('home-tab-nav').classList.add('hidden');
        if(document.getElementById('history-tab-nav')) document.getElementById('history-tab-nav').classList.add('hidden');
        
        switchTab('admin', document.getElementById('admin-nav'));
        loadAdmin(); 
    } else { loadRecipes(); loadFoodPrefs(); }
}

// --- UI HELPERS ---
function renderTrackerGrid() {
    const grid = document.getElementById('main-tracker-grid'); const g = currentUser.goal || "";
    let html = `<div class="track-btn" onclick="openLogger('وزن')"><b>⚖️</b>وزن</div><div class="track-btn" onclick="openLogger('وجبة')"><b>🥗</b>وجبة</div><div class="track-btn" onclick="openLogger('تمرين')"><b>💪</b>تمرين</div><div class="track-btn" onclick="openLogger('صور')"><b>📸</b>صور</div>`;
    if (currentUser.role !== 'admin') {
        if(g.includes('تدريب')) html = `<div class="track-btn" onclick="openLogger('تمرين')"><b>💪</b>تمرين</div><div class="track-btn" onclick="openLogger('صور')"><b>📸</b>صور</div>`;
        else if(g.includes('تغذيه')) html = `<div class="track-btn" onclick="openLogger('وجبة')"><b>🥗</b>وجبة</div><div class="track-btn" onclick="openLogger('وزن')"><b>⚖️</b>وزن</div>`;
    }
    grid.innerHTML = html;
}

function renderUserPlanTabs() {
    const container = document.getElementById('user-plan-tabs'); const extras = document.getElementById('nutrition-extras'); const g = currentUser.goal || ""; let html = "";
    if(g.includes('VIP')) { 
        document.getElementById('vip-toggle-container').classList.remove('hidden'); 
        const btnN = document.getElementById('btn-show-nutrition');
        const currentMode = (btnN && btnN.style.background !== 'transparent') ? 'nutrition' : 'workout';
        switchVipMode(currentMode, true); 
        if(extras) extras.classList.remove('hidden'); 
        loadFoodPrefs(); loadRecipes(); 
    } 
    else {
        document.getElementById('vip-toggle-container').classList.add('hidden');
        if(g.includes('تدريب')) html += PLAN_CATS.map(c => `<button class="sub-btn" style="background:#1a1a1a; color:var(--primary); font-size:12px;" onclick="viewCatPlan('${c}')">🏋️ ${c}</button>`).join('');
        if(g.includes('تغذيه')) { html += NUTRI_CATS.map(c => `<button class="sub-btn" style="background:#1a1a1a; color:#4caf50; font-size:12px;" onclick="viewCatPlan('${c}')">🥗 ${c}</button>`).join(''); if(extras) extras.classList.remove('hidden'); loadFoodPrefs(); loadRecipes(); }
    }
    container.innerHTML = html;
}

function switchVipMode(mode, forceShow = false) {
    const container = document.getElementById('user-plan-tabs'); const btnW = document.getElementById('btn-show-workout'); const btnN = document.getElementById('btn-show-nutrition');
    const view = document.getElementById('user-plan-view');
    const timerBtn = document.getElementById('workout-timer-btn');

    // Toggle logic for the main tabs
    if(!forceShow && ((mode === 'workout' && btnW.style.background !== 'transparent' && !container.classList.contains('hidden')) || 
       (mode === 'nutrition' && btnN.style.background !== 'transparent' && !container.classList.contains('hidden')))) {
        container.classList.add('hidden');
        if(view) view.classList.add('hidden');
        if(timerBtn) timerBtn.classList.add('hidden');
        btnW.style.background = 'transparent';
        btnN.style.background = 'transparent';
        return;
    }

    container.classList.remove('hidden');
    if(mode === 'workout'){ btnW.style.background = 'var(--primary)'; btnN.style.background = 'transparent'; container.innerHTML = PLAN_CATS.map(c => `<button class="sub-btn" style="background:rgba(229,57,53,0.1); color:var(--primary);" onclick="viewCatPlan('${c}')">🏋️ ${c}</button>`).join(''); }
    else { btnN.style.background = '#4caf50'; btnW.style.background = 'transparent'; container.innerHTML = NUTRI_CATS.map(c => `<button class="sub-btn" style="background:rgba(76,175,80,0.1); color:#4caf50;" onclick="viewCatPlan('${c}')">🥗 ${c}</button>`).join(''); }
}

function viewCatPlan(cat, force = false) {
    const view = document.getElementById('user-plan-view');
    const timerBtn = document.getElementById('workout-timer-btn');
    const isNutri = NUTRI_CATS.includes(cat);
    
    lastViewedCat = cat;

    if(view) view.classList.remove('hidden');
    if(timerBtn) {
        if(isNutri) timerBtn.classList.add('hidden');
        else timerBtn.classList.remove('hidden');
    }
    
    // تأكيد تلوين الأزرار العلوية بشكل صحيح
    const btnW = document.getElementById('btn-show-workout');
    const btnN = document.getElementById('btn-show-nutrition');
    if(btnW && btnN) {
        if(isNutri) { btnN.style.background = '#4caf50'; btnW.style.background = 'transparent'; }
        else { btnW.style.background = 'var(--primary)'; btnN.style.background = 'transparent'; }
    }
    const exs = currentPlanData[cat] || []; 
    const container = document.getElementById('plan-cards-container');
    
    // تصحيح الأي دي ليتوافق مع HTML
    if(timerBtn) timerBtn.classList.toggle('hidden', isNutri);
    // إخفاء قسم تفضيلات الأكل والوصفات عند عرض جدول تمرين محدد لعدم الزحمة
    const foodPrefs = document.getElementById('food-prefs-section');
    if(foodPrefs) foodPrefs.classList.add('hidden');
    const recipesSec = document.getElementById('recipes-section');
    if(recipesSec) recipesSec.classList.add('hidden');
    const recipes = document.getElementById('nutrition-extras');
    if(recipes) recipes.classList.add('hidden');

    if(isNutri) {
        let tableHtml = `
        <div style="background:rgba(255,179,0,0.05); border:1px solid rgba(255,179,0,0.2); border-radius:30px; padding:20px; margin-bottom:15px;">
            <h5 style="color:var(--accent); margin-bottom:15px;">🥗 البرنامج الغذائي: ${cat}</h5>
            <div style="overflow-x:auto; border-radius:15px; border:1px solid #222;">
                <table style="width:100%; border-collapse:collapse; text-align:right;">
                    <thead>
                        <tr style="background:#111; color:var(--accent); font-size:11px;">
                            <th style="padding:15px; border:1px solid #222;">نوع الأكل</th>
                            <th style="padding:15px; border:1px solid #222;">التفاصيل</th>
                            <th style="padding:15px; border:1px solid #222;">الكمية</th>
                            <th style="padding:15px; border:1px solid #222; text-align:center;">تسجيل</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${exs.map((ex, i) => `
                            <tr style="border-bottom:1px solid #222; ${ex.done ? 'background:rgba(76,175,80,0.05);' : ''}">
                                <td style="padding:15px; color:#fff;">${ex.name}</td>
                                <td style="padding:15px; color:#aaa;">${ex.note || '---'}</td>
                                <td style="padding:15px; color:var(--accent);">${ex.weight || 'حسب الرغبة'}</td>
                                <td style="padding:15px; text-align:center;">
                                    <button onclick="logNutritionEntry('${cat}', ${i}, this)" 
                                            style="background:${ex.done ? 'var(--success)' : 'rgba(255,255,255,0.05)'}; color:${ex.done ? '#000' : '#fff'}; border:1px solid ${ex.done ? 'var(--success)' : '#333'}; padding:8px 12px; border-radius:10px; font-size:12px; font-weight:bold; cursor:pointer; transition:0.3s;">
                                        ${ex.done ? 'تم ✅' : 'سجل 🥗'}
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
        container.innerHTML = exs.length ? tableHtml : '<p style="text-align:center; padding:30px; color:#444;">مفيش بيانات لسه يا بطل 🔥</p>';
    } else {
        let cardsHtml = `<div style="display:flex; flex-direction:column; gap:8px; margin-bottom:20px;">${exs.map((ex, i) => `
            <div class="card exercise-card ${ex.done ? 'done' : ''}" 
                 onclick="openExEditor('${cat}', ${i})"
                 style="padding:18px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:24px; display:flex; justify-content:space-between; align-items:center; position:relative; overflow:hidden; transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor:pointer; backdrop-filter:blur(10px);">
                
                <!-- Decorative Left Accent -->
                <div style="position:absolute; left:0; top:0; bottom:0; width:4px; background:${ex.done ? 'var(--success)' : 'var(--primary)'};"></div>

                <div style="flex:1;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                        <span style="font-size:18px;">🏋️</span>
                        <h4 style="margin:0; font-size:16px; color:#fff; font-weight:600; letter-spacing:0.5px;">${ex.name}</h4>
                        ${(ex.videoUrl || getSmartVideo(ex.name) || cat === 'بنج') ? 
                            `<span onclick="event.stopPropagation(); openExerciseVideo('${ex.name}', '${ex.videoUrl || getSmartVideo(ex.name) || 'https://www.w3schools.com/html/mov_bbb.mp4'}')" 
                                   style="cursor:pointer; background:var(--primary); color:#fff; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:900; border:none; box-shadow: 0 4px 10px rgba(229,57,53,0.4); margin-right:10px; display:inline-flex; align-items:center; gap:5px;">
                                   🎬 شرح
                             </span>` : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <p style="margin:0; font-size:11px; color:#777; background:rgba(255,255,255,0.05); padding:3px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.1);">🎯 ${ex.sets || '4'} مجموعات</p>
                        <span style="font-size:11px; color:${ex.done ? 'var(--success)' : 'var(--accent)'}; font-weight:bold; display:flex; align-items:center; gap:4px;">
                            ${ex.done ? '● مكتمل ✅' : '● قيد التنفيذ'}
                        </span>
                    </div>
                </div>

                <div style="display:flex; align-items:center; gap:12px;" onclick="event.stopPropagation();">
                    <button onclick="openExEditor('${cat}', ${i})" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:var(--accent); width:40px; height:40px; border-radius:14px; display:flex; align-items:center; justify-content:center; font-size:18px; transition:0.2s;">
                        ${currentUser.role === 'admin' ? '✏️' : 'ℹ️'}
                    </button>
                    <div class="checkbox-wrapper">
                        <input type="checkbox" id="check-${i}" class="custom-checkbox" ${ex.done?'checked':''} onchange="toggleExDone('${cat}', ${i}, this.checked, '${ex.name}')">
                        <label for="check-${i}"></label>
                    </div>
                </div>
            </div>
        `).join('')}</div><button onclick="startRestTimer(60)" class="btn-full" style="background:linear-gradient(135deg, #222, #111); font-size:13px; padding:15px; border:1px solid #333; border-radius:20px; box-shadow: 0 10px 20px rgba(0,0,0,0.3);">⏱️ ابدأ مؤقت الراحة (60 ثانية)</button>`;
        container.innerHTML = exs.length ? cardsHtml : '<p style="text-align:center; padding:30px; color:#444;">مفيش تدريبات لسه. 🔥</p>';
    }
}

function openExEditor(cat, idx) {
    const ex = currentPlanData[cat][idx];
    document.getElementById('ex-editor-name').innerText = ex.name;
    document.getElementById('ex-editor-sets').innerText = ex.sets || '4';
    
    let html = `
        <table style="width:100%; border-collapse:collapse; text-align:center; table-layout: fixed;">
            <thead>
                <tr style="color:#777; font-size:11px; background:#111;">
                    <th style="padding:12px 5px; border:1px solid #222; width:40px;">مج</th>
                    <th style="padding:12px 5px; border:1px solid #222;">وزن</th>
                    <th style="padding:12px 5px; border:1px solid #222;">عدة</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    const isAdmin = (currentUser.role === 'admin');
    for(let n=1; n<=6; n++) {
        html += `
            <tr style="border-bottom:1px solid #222;">
                <td style="padding:15px 5px; color:var(--accent); font-weight:bold; background:#0a0a0a; border:1px solid #222;">${n}</td>
                <td style="padding:15px 5px; border:1px solid #222; min-width:80px;">
                    ${isAdmin ? `<input type="text" value="${ex['w'+n]||''}" onchange="updateExSet('${cat}', ${idx}, 'w${n}', this.value)" placeholder="-" style="width:100%; padding:10px 5px; background:#000; border:1px solid #333; color:var(--accent); text-align:center; border-radius:8px; font-size:16px;">` 
                    : `<span style="color:var(--accent); font-weight:900; font-size:18px;">${ex['w'+n]||'-'}</span>`}
                </td>
                <td style="padding:15px 5px; border:1px solid #222; min-width:80px;">
                    ${isAdmin ? `<input type="text" value="${ex['r'+n]||''}" onchange="updateExSet('${cat}', ${idx}, 'r${n}', this.value)" placeholder="-" style="width:100%; padding:10px 5px; background:#000; border:1px solid #333; color:var(--success); text-align:center; border-radius:8px; font-size:16px;">`
                    : `<span style="color:var(--success); font-weight:900; font-size:18px;">${ex['r'+n]||'-'}</span>`}
                </td>
            </tr>
        `;
    }
    
    document.getElementById('ex-editor-sets-container').innerHTML = html;
    document.getElementById('ex-editor-close-btn').innerText = isAdmin ? 'حفظ التعديلات ✅' : 'إغلاق ✕';
    document.getElementById('ex-editor-modal').classList.remove('hidden');
}

async function updateExSet(cat, idx, key, val) {
    if(currentUser.role !== 'admin') return; 
    currentPlanData[cat][idx][key] = val;
    await db.collection('users').doc(currentUser.phone).update({ workoutPlan: currentPlanData });
}

function saveExEdit() {
    document.getElementById('ex-editor-modal').classList.add('hidden');
    if(lastViewedCat) viewCatPlan(lastViewedCat, true);
}

async function logNutritionEntry(cat, idx, btn) {
    if(currentUser.role === 'admin') return; 
    const item = currentPlanData[cat][idx];
    if(item.done) {
        item.done = false;
        await db.collection('users').doc(currentUser.phone).update({ workoutPlan: currentPlanData });
        if(btn) {
            btn.style.background = 'rgba(255,255,255,0.05)';
            btn.style.color = '#fff';
            btn.style.border = '1px solid #333';
            btn.innerText = 'سجل 🥗';
        } else {
            viewCatPlan(cat, true);
        }
        return;
    }

    item.done = true;
    await db.collection('users').doc(currentUser.phone).update({ workoutPlan: currentPlanData });
    
    await db.collection('logs').add({
        uName: currentUser.name,
        uPhone: currentUser.phone,
        type: 'وجبة',
        sub: cat,
        val: `🥘 ${item.name} | الكمية: ${item.weight || 'حسب الرغبة'} | الطبخ: مقرر ${item.note ? ' | التفاصيل: ' + item.note : ''}`,
        ts: firebase.firestore.FieldValue.serverTimestamp()
    });

    if(btn) {
        btn.style.background = 'var(--success)';
        btn.style.color = '#000';
        btn.style.border = '1px solid var(--success)';
        btn.innerText = 'تم ✅';
    }

    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'تم تسجيل الوجبة ✅', timer: 1500 });
    if(!btn) viewCatPlan(cat, true);
    loadUserLogs();
}

// --- LOGGING & HISTORY ---
async function toggleExDone(cat, idx, status, exName) { 
    currentPlanData[cat][idx].done = status; await db.collection('users').doc(currentUser.phone).update({ workoutPlan: currentPlanData }); 
    if(status) {
        const now = new Date(); const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); const ex = currentPlanData[cat][idx];
        const newExData = { name: exName, time: timeStr, sets: ex.sets || '4', w: [ex.w1, ex.w2, ex.w3, ex.w4, ex.w5, ex.w6], r: [ex.r1, ex.r2, ex.r3, ex.r4, ex.r5, ex.r6] };
        try {
            const snap = await db.collection('logs').where('uPhone', '==', currentUser.phone).where('type', '==', 'تمرين').where('sub', '==', cat).get();
            let targetDoc = null; const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
            snap.forEach(doc => { const data = doc.data(); const ts = data.ts ? data.ts.toMillis() : 0; if(ts > twoHoursAgo) { if(!targetDoc || ts > targetDoc.data().ts.toMillis()) targetDoc = doc; } });
            if(targetDoc) { let existingExs = JSON.parse(targetDoc.data().val); existingExs.push(newExData); await db.collection('logs').doc(targetDoc.id).update({ val: JSON.stringify(existingExs) }); } 
            else { throw new Error("No recent log"); }
        } catch(e) { await db.collection('logs').add({ uName: currentUser.name, uPhone: currentUser.phone, type: 'تمرين', sub: cat, val: JSON.stringify([newExData]), ts: firebase.firestore.FieldValue.serverTimestamp() }); }
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'تم تسجيل الانجاز ✅', timer: 1500 }); loadUserLogs();
    }
}

async function fetchAndRenderLogs(phone, containerId, isAdminView = false) {
    const list = document.getElementById(containerId); if(!list) return;
    const snap = await db.collection('logs').where('uPhone', '==', phone).get();
    let arr = []; snap.forEach(d => arr.push({id: d.id, ...d.data()})); arr.sort((a,b) => (b.ts?.seconds||0) - (a.ts?.seconds||0));
    let h = ""; 
    let processed = []; let lastW = null;
    arr.forEach(d => {
        d.allIds = [d.id];
        if(d.type === 'تمرين' && d.val && d.val.startsWith('[')) {
            try {
                let exs = JSON.parse(d.val);
                if(lastW && lastW.type === 'تمرين' && (lastW.ts?.seconds - d.ts?.seconds < 7200)) { 
                    lastW.exs = lastW.exs.concat(exs); 
                    lastW.allIds.push(d.id);
                    return;
                }
                d.exs = exs; lastW = d;
            } catch(e){ d.exs = []; }
        } else if(d.type === 'وجبة') {
            // تجميع الوجبات من نفس النوع في وقت قريب (ساعتين)
            if(lastW && lastW.type === 'وجبة' && lastW.sub === d.sub && (lastW.ts?.seconds - d.ts?.seconds < 7200)) {
                lastW.meals = lastW.meals.concat(d.val.split('\n'));
                lastW.allIds.push(d.id);
                return;
            }
            d.meals = d.val.split('\n');
            lastW = d;
        } else { lastW = null; }
        processed.push(d);
    });

    // تجميع حسب الشهر واليوم
    let monthGroups = {};
    processed.forEach(d => {
        const dt = (typeof d.ts === 'number') ? new Date(d.ts) : (d.ts?.toDate() || new Date());
        const monthKey = dt.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
        const dayKey = dt.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });
        
        if(!monthGroups[monthKey]) monthGroups[monthKey] = {};
        if(!monthGroups[monthKey][dayKey]) monthGroups[monthKey][dayKey] = [];
        monthGroups[monthKey][dayKey].push(d);
    });

    for(let month in monthGroups) {
        h += `
            <div class="month-group" style="margin-bottom:15px;">
                <div onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('.arr').innerText = this.nextElementSibling.classList.contains('hidden') ? '▼' : '▲'" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:12px 15px; border-radius:15px; cursor:pointer; margin-bottom:8px; border:1px solid rgba(255,255,255,0.1);">
                    <span style="color:var(--accent); font-size:13px; font-weight:bold;">📅 ${month}</span>
                    <span class="arr" style="color:var(--accent); font-size:12px;">▲</span>
                </div>
                <div class="month-content">
        `;
        for(let day in monthGroups[month]) {
            h += `
                <div class="day-group" style="margin-right:10px; margin-bottom:10px;">
                    <div onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('.arr').innerText = this.nextElementSibling.classList.contains('hidden') ? '▼' : '▲'" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:8px 12px; border-radius:10px; cursor:pointer; margin-bottom:5px;">
                        <span style="color:#777; font-size:11px;">📍 ${day}</span>
                        <span class="arr" style="color:#555; font-size:10px;">▲</span>
                    </div>
                    <div class="day-content">
            `;

            monthGroups[month][day].forEach(d => {
                let icon = '🔥', color = 'var(--primary)', valHtml = d.val;
                if(d.type==='تمرين') { icon='💪'; } else if(d.type==='مياه') { icon='💧'; color='#007aff'; } else if(d.type==='صور') { icon='📸'; valHtml=`<img src="${d.val}" style="width:100%; border-radius:15px; margin-top:10px;">`; }
                
                if(d.type==='تمرين' && d.exs) { 
                    valHtml = `
                    <div style="overflow-x:auto; direction:rtl;">
                        <table style="width:100%; border-collapse:collapse; min-width:400px; background:rgba(0,0,0,0.2); border:1px solid #222; border-radius:15px; overflow:hidden;">
                            <thead>
                                <tr style="background:rgba(255,255,255,0.02); color:#777; font-size:10px;">
                                    <th style="padding:12px 8px; border:1px solid #222;">التمرين</th>
                                    <th style="padding:12px 8px; border:1px solid #222;">مج</th>
                                    <th style="padding:12px 8px; border:1px solid #222;">نوع</th>
                                    ${[1,2,3,4,5,6].map(i=>`<th style="padding:12px 8px; border:1px solid #222;">${i}</th>`).join('')}
                                    <th style="padding:12px 8px; border:1px solid #222;">صح</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${d.exs.map(ex => {
                                    let rowW = `<td style="padding:10px; border:1px solid #222; color:var(--accent); font-weight:bold;">وزن</td>`;
                                    let rowR = `<td style="padding:10px; border:1px solid #222; color:var(--success); font-weight:bold;">عدة</td>`;
                                    for(let i=0; i<6; i++) {
                                        const w = (ex.details && ex.details[i]) ? ex.details[i].weight : '-';
                                        const r = (ex.details && ex.details[i]) ? ex.details[i].reps : '-';
                                        rowW += `<td style="padding:10px; border:1px solid #222; color:var(--accent);">${w}</td>`;
                                        rowR += `<td style="padding:10px; border:1px solid #222; color:var(--success);">${r}</td>`;
                                    }
                                    return `
                                        <tr>
                                            <td rowspan="2" style="padding:15px 10px; border:1px solid #222; font-weight:900; color:#fff; font-size:13px; text-align:center; min-width:110px;">
                                                ${ex.name}
                                                <div style="font-size:9px; color:#555; margin-top:5px; font-weight:normal;">🕒 ${ex.time || ''}</div>
                                            </td>
                                            <td rowspan="2" style="padding:10px; border:1px solid #222; color:var(--primary); font-weight:bold; font-size:14px; text-align:center;">${ex.sets}</td>
                                            ${rowW}
                                            <td rowspan="2" style="padding:10px; border:1px solid #222; text-align:center;">
                                                <div style="background:var(--success); color:#000; width:20px; height:20px; border-radius:4px; display:inline-flex; align-items:center; justify-content:center; font-weight:bold; font-size:12px;">✓</div>
                                            </td>
                                        </tr>
                                        <tr>${rowR}</tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>`; 
                } else if(d.type === 'وجبة' && d.meals) {
                    valHtml = `
                    <div style="overflow-x:auto; border-radius:15px; border:1px solid #222; background:rgba(0,0,0,0.2);">
                        <table style="width:100%; border-collapse:collapse; text-align:right; min-width:450px;">
                            <thead style="background:#111; color:#777; font-size:10px;">
                                <tr>
                                    <th style="padding:10px; border:1px solid #222;">الصنف 🥘</th>
                                    <th style="padding:10px; border:1px solid #222;">الكمية ⚖️</th>
                                    <th style="padding:10px; border:1px solid #222;">الطبخ 🍳</th>
                                    <th style="padding:10px; border:1px solid #222;">التفاصيل 📝</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${d.meals.map(m => {
                                    let parts = m.split('|').map(p => p.trim());
                                    let name = parts[0] ? parts[0].replace('🥘', '').trim() : '-';
                                    let qty = parts[1] ? parts[1].replace('الكمية:', '').trim() : '-';
                                    let method = parts[2] ? parts[2].replace('الطبخ:', '').trim() : '-';
                                    let detail = parts[3] ? parts[3].replace('التفاصيل:', '').trim() : '-';
                                    
                                    // معالجة الصيغة القديمة
                                    if(parts.length === 1 && m.includes('-')) {
                                        let old = m.split('-');
                                        name = old[0].trim();
                                        qty = old[1].trim();
                                        method = 'مقرر';
                                        detail = '-';
                                    }

                                    return `
                                        <tr>
                                            <td style="padding:12px; border:1px solid #222; color:#fff; font-size:13px; font-weight:bold;">${name}</td>
                                            <td style="padding:12px; border:1px solid #222; color:var(--accent); font-size:12px;">${qty}</td>
                                            <td style="padding:12px; border:1px solid #222; color:var(--success); font-size:12px;">${method}</td>
                                            <td style="padding:12px; border:1px solid #222; color:#aaa; font-size:11px;">${detail}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>`;
                }
                
                const dt_item = (typeof d.ts === 'number') ? new Date(d.ts) : (d.ts?.toDate() || new Date());
                const timeStr = dt_item.toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'});

                h += `
                    <div class="history-item">
                        <i class="del-btn" onclick="deleteLog('${d.allIds.join(',')}', '${phone}', '${containerId}')">🗑️</i>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <div style="display:flex; align-items:center; gap:15px;">
                                <div style="width:45px; height:45px; background:rgba(255,255,255,0.05); border-radius:15px; display:flex; align-items:center; justify-content:center; font-size:22px; border:1px solid rgba(255,255,255,0.05);">${icon}</div>
                                <div>
                                    <b style="color:${color}; display:block; font-size:14px;">${d.type} ${d.sub||''}</b>
                                    <small style="color:#555; font-size:10px;">${timeStr}</small>
                                </div>
                            </div>
                        </div>
                        ${d.type === 'وقت التمرين' || d.type === 'تمرين' ? `<div style="text-align:center; margin-bottom:15px;"><button onclick="openShareCard('${d.sub||''}')" class="pulse-glow" style="background:linear-gradient(135deg, var(--primary), var(--primary-dark)); border:none; color:#fff; padding:10px 20px; border-radius:15px; font-size:12px; font-weight:900; cursor:pointer; display:inline-flex; align-items:center; gap:8px; box-shadow:0 6px 15px var(--primary-glow);">📤 شارك نجاحك مع أصدقائك 🔥</button></div>` : ''}
                        <div style="color:#eee; font-size:13px; line-height:1.6; background:rgba(0,0,0,0.2); padding:12px; border-radius:15px; border:1px solid rgba(255,255,255,0.02); white-space: pre-line;">${valHtml}</div>
                    </div>`;
            });
            h += `</div></div>`;
        }
        h += `</div></div>`;
    }
    list.innerHTML = h || '<p style="text-align:center; padding:50px; color:#444;">مفيش نشاط مسجل لسه.. 🔥</p>';
}

function loadUserLogs() { fetchAndRenderLogs(currentUser.phone, 'user-history-list'); }
async function deleteLog(idsStr, phone, containerId){ 
    const result = await Swal.fire({
        title: 'حذف السجل؟ 🗑️',
        text: "هل أنت متأكد من حذف هذا النشاط؟ سيتم حذف جميع العناصر المرتبطة به.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ff3b30',
        cancelButtonColor: '#333',
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        background: '#121212',
        color: '#fff'
    });
    if(result.isConfirmed){ 
        const ids = idsStr.split(',');
        const batch = db.batch();
        ids.forEach(id => {
            batch.delete(db.collection('logs').doc(id));
        });
        await batch.commit();
        fetchAndRenderLogs(phone || currentUser.phone, containerId || 'user-history-list'); 
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'تم الحذف بنجاح', timer: 1500 });
    } 
}

// --- LOGGING ENGINE (Tracker Grid) ---
let currentLogType = ""; let currentLogSub = "";
function openLogger(type) {
    currentLogType = type; document.getElementById('logger-title').innerText = "تسجيل " + type;
    document.getElementById('logger-modal').classList.remove('hidden');
    
    // تصحيح الأي دي ليتوافق مع HTML
    const subList = document.getElementById('category-btns'); 
    if(subList) subList.innerHTML = "";
    document.getElementById('category-menu').classList.remove('hidden');
    
    document.getElementById('log-inputs').classList.add('hidden');
    
    let subs = [];
    if(type==='وزن') { currentLogSub = "وزن يومي"; showInputs(); return; }
    if(type==='تمرين') subs = PLAN_CATS;
    if(type==='وجبة') subs = NUTRI_CATS;
    if(type==='صور') subs = ['قبل التمرين', 'بعد التمرين', 'تحول أسبوعي'];
    
    if(subList) subList.innerHTML = subs.map(s => `<button class="sub-btn" style="background:#1a1a1a; padding:15px; border-radius:12px; border:1px solid #333; color:#fff; font-size:12px; font-weight:bold;" onclick="setSub('${s}')">${s}</button>`).join('');
}

function setSub(s) {
    currentLogSub = s; showInputs();
    document.querySelectorAll('#category-btns .sub-btn').forEach(b => {
        b.style.background = b.innerText === s ? 'var(--primary)' : '#1a1a1a';
    });
}

function showInputs() {
    document.getElementById('category-menu').classList.add('hidden');
    const area = document.getElementById('log-inputs'); 
    area.classList.remove('hidden');
    
    const wrapper = document.getElementById('file-wrapper');
    if(currentLogType === 'تمرين') { 
        area.innerHTML = `<button class="btn-full" onclick="openWorkoutTable()">فتح جدول تسجيل التكرارات 💪</button>`; 
    } else if(currentLogType === 'صور') {
        if(wrapper) wrapper.classList.remove('hidden');
        area.innerHTML = `
            <button class="btn-full" onclick="document.getElementById('log-file').click()" style="background:#333;">📸 التقاط صورة</button>
            <input type="file" id="log-file" accept="image/*" capture="environment" class="hidden" onchange="handleImageProcessing(this)">
            <img id="img-preview" class="hidden" style="width:100%; border-radius:15px; margin:15px 0;">
            <button class="btn-full" onclick="saveLog()">تأكيد وحفظ ✅</button>
        `;
    } else if(currentLogType === 'وجبة') {
        area.innerHTML = `
            <div id="meal-items-container"></div>
            <button onclick="addMealItemRow()" style="width:100%; padding:10px; background:rgba(255,255,255,0.05); border:1px dashed #555; color:#aaa; border-radius:12px; margin-bottom:15px; font-size:12px; cursor:pointer;">➕ إضافة نوع أكل آخر</button>
            <textarea id="log-note" placeholder="📝 ملاحظات إضافية..." style="width:100%; height:80px; padding:15px; background:#111; border:1px solid #333; color:#fff; border-radius:12px; margin-bottom:15px;"></textarea>
            <button class="btn-full" onclick="saveLog()">تأكيد وحفظ ✅</button>
        `;
        addMealItemRow(); // أضف أول صف تلقائياً
    } else {
        const placeholder = currentLogType === 'وزن' ? "اكتب وزنك الحالي (كجم)..." : "اكتب التفاصيل...";
        area.innerHTML = `
            <input type="number" id="log-val" placeholder="${placeholder}" style="width:100%; padding:15px; background:#111; border:1px solid #333; border-radius:15px; color:#fff; margin-bottom:10px;">
            <textarea id="log-note" placeholder="ملاحظة إضافية..." style="width:100%; height:80px; padding:15px; background:#111; border:1px solid #333; color:#fff; border-radius:12px; margin-bottom:15px;"></textarea>
            <button class="btn-full" onclick="saveLog()">تأكيد وحفظ ✅</button>
        `;
    }
}

function addMealItemRow() {
    const container = document.getElementById('meal-items-container');
    if(!container) return;
    const div = document.createElement('div');
    div.className = "meal-item-row";
    div.style = "background:rgba(0,0,0,0.2); padding:15px; border-radius:20px; border:1px solid #222; margin-bottom:12px; position:relative;";
    div.innerHTML = `
        <div onclick="this.parentElement.remove()" style="position:absolute; left:10px; top:10px; color:#ff3b30; cursor:pointer; font-size:14px;">✕</div>
        <input type="text" class="m-name" placeholder="🥗 اسم الأكل (مثلاً: أرز)" style="width:100%; padding:12px; background:#000; border:1px solid #333; border-radius:12px; color:#fff; margin-bottom:10px; font-size:13px;">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <input type="text" class="m-qty" placeholder="⚖️ الكمية (مثلاً: 150ج)" style="background:#000; border:1px solid #333; border-radius:12px; color:#fff; padding:10px; font-size:12px;">
            <input type="text" class="m-method" placeholder="🍳 الطبخ (مثلاً: مسلوق)" style="background:#000; border:1px solid #333; border-radius:12px; color:#fff; padding:10px; font-size:12px;">
        </div>
    `;
    container.appendChild(div);
}

function handleImageProcessing(input) {
    if (input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 600; canvas.height = (img.height/img.width)*600;
                canvas.getContext('2d').drawImage(img, 0,0,600,canvas.height);
                finalBase64 = canvas.toDataURL('image/jpeg', 0.6);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function saveLog(valOverride) {
    let val = valOverride || "";
    const note = document.getElementById('log-note')?.value.trim();

    if(!valOverride) {
        if(currentLogType === 'وجبة') {
            let items = [];
            document.querySelectorAll('.meal-item-row').forEach(row => {
                const name = row.querySelector('.m-name').value.trim();
                const qty = row.querySelector('.m-qty').value.trim();
                const method = row.querySelector('.m-method').value.trim();
                if(name) items.push(`🥘 ${name} | الكمية: ${qty||'-'} | الطبخ: ${method||'-'}`);
            });
            if(items.length === 0) return Swal.fire('نقص بيانات', 'برجاء كتابة اسم الوجبة يا بطل', 'warning');
            val = items.join('\n');
        } else if(currentLogType === 'صور') {
            val = finalBase64;
        } else {
            val = document.getElementById('log-val')?.value || "";
        }
    }

    if(!val && currentLogType!=='وزن') return Swal.fire('نقص بيانات', 'برجاء ملء البيانات المطلوبة', 'warning');
    
    // إضافة الملاحظة للـ val لو موجودة
    let finalVal = val;
    if(note) finalVal += `\n📝 ملاحظة: ${note}`;

    Swal.fire({ title: 'جاري الحفظ...', didOpen: () => Swal.showLoading() });
    await db.collection('logs').add({
        uName: currentUser.name, uPhone: currentUser.phone,
        type: currentLogType, sub: currentLogSub, val: finalVal,
        ts: firebase.firestore.FieldValue.serverTimestamp()
    });
    Swal.close(); closeLogger(); loadUserLogs();
    if(currentLogType === 'تمرين') sendNotificationTo(ADMIN_PHONE, "بطل سجل تمرين! 💪", `البطل ${currentUser.name} خلص تمرين ${currentLogSub}.`);
}

function closeLogger() { document.getElementById('logger-modal').classList.add('hidden'); }

// --- WORKOUT TABLE (Detailed) ---
function openWorkoutTable() {
    document.getElementById('workout-table-modal').classList.remove('hidden');
    document.getElementById('workout-table-title').innerText = "تسجيل: " + currentLogSub;
    const body = document.getElementById('exercise-rows'); 
    if(body) body.innerHTML = "";
    addExerciseRow();
}

function addExerciseRow() {
    const body = document.getElementById('exercise-rows');
    const div = document.createElement('div');
    div.className = "workout-card-input";
    // التصميم المطابق للصورة
    div.innerHTML = `
        <div style="position:relative; background:#0f0f0f; border:1px solid #222; border-radius:25px; padding:20px; margin-bottom:20px; border-right:4px solid var(--primary);">
            <i onclick="this.parentElement.remove()" style="position:absolute; left:15px; top:15px; cursor:pointer; font-size:20px; opacity:0.6;">🗑️</i>
            
            <div style="margin-bottom:15px;">
                <label style="color:var(--primary); font-size:12px; display:block; margin-bottom:8px;">اسم التمرين</label>
                <input type="text" class="ex-name" placeholder="مثلاً: بنج عالي بالدمبل..." style="width:100%; background:#000; border:1px solid #333; color:#fff; padding:12px; border-radius:12px;">
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <label style="color:#777; font-size:12px;">المجموعات</label>
                <input type="number" class="ex-sets" value="4" oninput="renderSetDetails(this)" style="width:60px; text-align:center; background:#000; border:1px solid #333; color:var(--accent); padding:8px; border-radius:10px; font-weight:bold;">
            </div>

            <div class="sets-grid" style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; background:rgba(0,0,0,0.3); padding:15px; border-radius:15px;">
                <!-- سيتم رندرة المجموعات هنا تلقائياً -->
            </div>
        </div>
    `;
    body.appendChild(div);
    renderSetDetails(div.querySelector('.ex-sets'));
}

function renderSetDetails(input) {
    const grid = input.parentElement.nextElementSibling;
    const count = parseInt(input.value) || 0;
    let h = "";
    for(let i=1; i<=count; i++) {
        h = h + `
            <div style="text-align:center;">
                <small style="color:#555; font-size:9px; display:block; margin-bottom:5px;">مجموعة ${i}</small>
                <input type="text" class="set-weight" placeholder="وزن" style="width:100%; background:#000; border:1px solid #222; color:#fff; font-size:10px; padding:6px; border-radius:8px; margin-bottom:5px; text-align:center;">
                <input type="text" class="set-reps" placeholder="عدات" style="width:100%; background:#000; border:1px solid var(--success); color:var(--success); font-size:10px; padding:6px; border-radius:8px; text-align:center;">
            </div>
        `;
    }
    grid.innerHTML = h;
}

async function saveWorkoutTable() {
    const rows = document.querySelectorAll('#exercise-rows .workout-card-input');
    let data = [];
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'});
    rows.forEach(r => {
        const name = r.querySelector('.ex-name').value;
        const setsCount = parseInt(r.querySelector('.ex-sets').value) || 0;
        if(name) {
            let details = [];
            const setDivs = r.querySelectorAll('.sets-grid > div');
            setDivs.forEach(sd => {
                const weight = sd.querySelector('.set-weight').value || '-';
                const reps = sd.querySelector('.set-reps').value || '-';
                details.push({ weight, reps });
            });
            data.push({ name, sets: setsCount, details, time: timeStr });
        }
    });
    if(!data.length) return;
    await saveLog(JSON.stringify(data));
    document.getElementById('workout-table-modal').classList.add('hidden');
}

// --- NOTIFICATIONS & MORE MENU ---
async function sendNotificationTo(p, t, m) { 
    try { await db.collection('notifications').add({ targetPhone: p.toString().trim(), title: t, message: m, ts: Date.now(), read: false }); } catch(e){} 
}

function initSystemNotifications() { 
    try {
        if (location.protocol === 'file:') return; // المتصفحات تمنع الإشعارات في الملفات المحلية
        if (!("Notification" in window)) return; 
        if (Notification.permission === "granted") listenForCustomNotifications(); 
        else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(p => { 
                if(p==="granted") listenForCustomNotifications(); 
            }).catch(e => console.warn("Notif Permission Error:", e));
        }
    } catch(e) { console.warn("System Notifications Init Error:", e); }
}

function listenForCustomNotifications() {
    if(!currentUser) return;
    const p = currentUser.phone.toString().trim();
    db.collection('notifications').where('targetPhone', '==', p).orderBy('ts', 'desc').limit(20).onSnapshot(snap => {
        let unread = 0;
        const list = snap.docs.map(doc => {
            const d = doc.data();
            if(!d.read) unread++;
            return { id: doc.id, ...d };
        });
        
        // تحديث الجرس للأدمن أو المستخدم العادي
        const badgeAdmin = document.getElementById('notif-badge-admin');
        if(badgeAdmin) {
            if(unread > 0) {
                badgeAdmin.innerText = unread;
                badgeAdmin.classList.remove('hidden');
            } else {
                badgeAdmin.classList.add('hidden');
            }
        }
    });
}
function toggleMoreMenu() {
    const overlay = document.getElementById('more-menu-overlay');
    const content = document.getElementById('more-menu-content');
    const approved = allUsersData.filter(u => u.status === 'approved').length;
    const pending = allUsersData.filter(u => u.status === 'pending').length;
    const expired = allUsersData.filter(u => u.status === 'approved' && u.expiryDate && u.expiryDate < Date.now()).length;
    
    document.getElementById('stat-total-val').innerText = approved;
    document.getElementById('stat-pending-val').innerText = pending;
    document.getElementById('stat-expired-val').innerText = expired;
    if(overlay.classList.contains('hidden')) { 
        overlay.classList.remove('hidden'); 
        setTimeout(()=>content.style.bottom='90px', 10); 
    } else { 
        content.style.bottom='-100%'; 
        setTimeout(()=>overlay.classList.add('hidden'), 300); 
    }
}

// --- EVALUATION & ADMIN ---
async function loadEvaluationData() {
    try {
        const snap = await db.collection('evaluations').where('uPhone', '==', currentUser.phone).get();
        let allEvals = []; 
        snap.forEach(d => allEvals.push({ id: d.id, ...d.data() }));
        
        // ترتيب من الأقدم للأحدث أولاً
        allEvals.sort((a,b) => (a.ts || 0) - (b.ts || 0));

        // وظيفة للحصول على رقم الأسبوع والسنة
        const getWeekId = (ts) => {
            const d = new Date(ts);
            const oneJan = new Date(d.getFullYear(), 0, 1);
            const weekNum = Math.ceil((((d - oneJan) / 86400000) + oneJan.getDay() + 1) / 7);
            return `${d.getFullYear()}-W${weekNum}`;
        };

        // تصفية البيانات لإظهار آخر تقييم فقط في كل أسبوع
        let weeklyEvalsMap = {};
        allEvals.forEach(ev => {
            const weekId = getWeekId(ev.ts);
            weeklyEvalsMap[weekId] = ev; // سيتم استبدال القديم بالجديد في نفس الأسبوع
        });
        
        let evals = Object.values(weeklyEvalsMap).sort((a,b) => (a.ts || 0) - (b.ts || 0));

        if(evals.length > 0) {
            const lastEval = evals[evals.length - 1];
            document.getElementById('current-score-text').innerText = lastEval.score + " / 10";
            document.getElementById('coach-note-bubble').innerText = lastEval.note;
            
            const weightEl = document.getElementById('eval-last-weight');
            if(weightEl) weightEl.innerText = (lastEval.weight || currentUser.weight || '--') + " كجم";
            
            // رسم الرسم البياني الأسبوعي
            renderEvalChart(evals);
            
            // عرض التاريخ الأسبوعي (من الأحدث للأقدم)
            renderEvalHistoryList([...evals].reverse());
        } else {
            document.getElementById('coach-note-bubble').innerText = "في انتظار أول تقييم من الكابتن... 🔥";
        }
    } catch(e) { console.error("Eval Load Error:", e); }
}

let evalChartInstance = null;
function renderEvalChart(evals) {
    const ctx = document.getElementById('evalChart');
    if(!ctx) return;

    if(evalChartInstance) evalChartInstance.destroy();

    const labels = evals.map(ev => {
        const d = new Date(ev.ts);
        return `${d.getDate()}/${d.getMonth()+1}`;
    });

    const weightData = evals.map(ev => ev.weight || null);
    const fatData = evals.map(ev => ev.fat || null);
    const scoreData = evals.map(ev => ev.score || 0);

    evalChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'الوزن (كجم)',
                    data: weightData,
                    borderColor: '#ff3b30',
                    backgroundColor: '#ff3b30',
                    borderWidth: 4,
                    tension: 0.3,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    yAxisID: 'y'
                },
                {
                    label: 'الدهون (%)',
                    data: fatData,
                    borderColor: '#ffb300',
                    backgroundColor: '#ffb300',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.3,
                    pointRadius: 5,
                    yAxisID: 'y'
                },
                {
                    label: 'الالتزام',
                    data: scoreData,
                    borderColor: '#4caf50',
                    backgroundColor: 'rgba(76, 175, 80, 0.15)',
                    borderWidth: 3,
                    tension: 0.4,
                    pointRadius: 4,
                    fill: true,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleAlign: 'right',
                    bodyAlign: 'right',
                    rtl: true,
                    padding: 12,
                    cornerRadius: 10
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'الوزن / الدهون', color: '#777', font: { size: 10 } },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#aaa', font: { size: 11 } }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    min: 0,
                    max: 10,
                    title: { display: true, text: 'الالتزام (10)', color: '#4caf50', font: { size: 10 } },
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#4caf50', font: { size: 11, weight: 'bold' } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#888', font: { size: 10 } }
                }
            }
        }
    });
}

function renderEvalHistoryList(evals) {
    const list = document.getElementById('eval-history-list');
    if(!list) return;
    let h = "";
    evals.forEach(ev => {
        const d = new Date(ev.ts);
        const dateStr = d.toLocaleDateString('ar-EG', { day:'numeric', month:'long', year:'numeric' });
        h += `
            <div class="card" style="margin-bottom:15px; border-right:4px solid ${ev.score >= 8 ? '#4caf50' : '#ffb300'};">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <b style="color:var(--accent); font-size:14px;">📅 ${dateStr}</b>
                    <span style="background:rgba(255,255,255,0.05); padding:2px 10px; border-radius:8px; font-size:12px; color:#fff;">الالتزام: ${ev.score}/10</span>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                    <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:10px; text-align:center;">
                        <small style="color:#555; display:block; font-size:10px;">الوزن</small>
                        <b style="color:#ff3b30;">${ev.weight || '--'} كجم</b>
                    </div>
                    <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:10px; text-align:center;">
                        <small style="color:#555; display:block; font-size:10px;">الدهون</small>
                        <b style="color:#ffb300;">${ev.fat || '--'} %</b>
                    </div>
                </div>
                <p style="color:#eee; font-size:13px; line-height:1.6; font-style:italic;">"${ev.note}"</p>
            </div>
        `;
    });
    list.innerHTML = h;
}

async function submitEvaluation() {
    const score = document.getElementById('admin-eval-score').value;
    const note = document.getElementById('admin-eval-note').value;
    const weight = document.getElementById('admin-eval-weight').value;
    const fat = document.getElementById('admin-eval-fat').value;
    
    if(!activeTarget) return;

    try {
        await db.collection('evaluations').add({ 
            uPhone: activeTarget, 
            score: parseInt(score), 
            note: note, 
            weight: parseFloat(weight) || 0,
            fat: parseFloat(fat) || 0,
            ts: Date.now() 
        });
        
        // تحديث بيانات المستخدم الحالية لسهولة العرض
        let updateData = {};
        if(weight) updateData.weight = parseFloat(weight);
        if(fat) updateData.fat = parseFloat(fat);
        if(Object.keys(updateData).length > 0) {
            await db.collection('users').doc(activeTarget).update(updateData);
        }

        sendNotificationTo(activeTarget, "تقييم جديد! 📈", `الكابتن قيم أداءك بـ ${score} من 10.. عاش!`);
        Swal.fire('تم التقييم 🔥', 'تم تحديث البيانات والرسوم البيانية للبطل.', 'success');
    } catch(e) {
        Swal.fire('خطأ ❌', 'فشل حفظ التقييم، حاول مرة تانية.', 'error');
    }
}
async function loadAdmin() {
    const snap = await db.collection('users').orderBy('name').get(); allUsersData = [];
    let pendingCount = 0;
    snap.forEach(d => {
        const u = d.data();
        allUsersData.push({id: d.id, ...u});
        if(u.status === 'pending') pendingCount++;
    });
    
    // تحديث الأرقام الأساسية
    const approvedCount = allUsersData.filter(u => u.status === 'approved').length;
    const expiredCount = allUsersData.filter(u => u.status === 'approved' && u.expiryDate && u.expiryDate < Date.now()).length;
    
    document.getElementById('stat-total-val').innerText = approvedCount;
    document.getElementById('stat-pending-val').innerText = pendingCount;
    document.getElementById('stat-expired-val').innerText = expiredCount;
    document.getElementById('dot-pending').classList.toggle('hidden', pendingCount === 0);

    // رادار لحظي لطلبات تغيير النظام
    db.collection('goalChanges').onSnapshot(goalsSnap => {
        const goalsCount = goalsSnap.size;
        document.getElementById('stat-goals-val').innerText = goalsCount;
        document.getElementById('dot-goals').classList.toggle('hidden', goalsCount === 0);
        renderGoalChanges(goalsSnap);
    });

    filterAdminUsers('all');
    
    let ph = "";
    const pSnap = await db.collection('users').where('status','==','pending').get(); 
    pSnap.forEach(d => { 
        const u = d.data(); 
        ph += `<div class="card" style="display:flex; justify-content:space-between; align-items:center; border-right:4px solid var(--primary); margin-bottom:10px; background:#111;">
                <b style="font-size:14px; color:#fff;">${u.name}</b>
                <div style="display:flex; gap:8px;">
                    <button onclick="openProfile('${d.id}')" style="background:#222; border:1px solid #444; border-radius:8px; padding:8px; cursor:pointer;" title="تجهيز الجدول">✍️</button>
                    <button onclick="approveUser('${d.id}')" style="background:var(--primary); color:#fff; border:none; border-radius:8px; padding:8px 12px; cursor:pointer; font-weight:bold;">تفعيل ✅</button>
                    <button onclick="deleteUser('${d.id}')" style="background:rgba(255,0,0,0.1); color:#ff3b30; border:1px solid #ff3b30; border-radius:8px; padding:8px; cursor:pointer;">🗑️</button>
                </div>
              </div>`; 
    });
    document.getElementById('pending-users-list-modal').innerHTML = ph || '<p style="text-align:center; color:#444; font-size:12px; padding:20px;">لا يوجد طلبات انضمام حالياً</p>';
}

function renderGoalChanges(snap) {
    const list = document.getElementById('goal-change-list-modal');
    let h = "";
    snap.forEach(doc => {
        const d = doc.data();
        const goalId = doc.id;
        const userPhone = String(d.userPhone || "").trim();
        const newGoal = String(d.newGoal || "").trim();
        
        h += `<div class="card" style="margin-bottom:15px; background:#111; border-right:4px solid #ffb300; display:flex; justify-content:space-between; align-items:center; padding:15px; border-radius:18px;">
                <div style="flex:1; text-align:right;">
                    <b style="color:#fff; display:block; font-size:16px;">${d.userName}</b>
                    <small style="color:#ffb300; font-size:12px;">طلب تغيير إلى: ${newGoal}</small>
                </div>
                <button onclick="approveGoalChange('${goalId}', '${userPhone}', '${newGoal}')" style="background:#ffb300; color:#000; border:none; padding:10px 20px; border-radius:12px; font-weight:bold; cursor:pointer; font-size:14px; box-shadow:0 4px 10px rgba(255,179,0,0.2);">
                    ✅ موافقة
                </button>
              </div>`;
    });
    list.innerHTML = h || '<div style="text-align:center; padding:40px; color:#444;"><span style="font-size:40px; display:block; margin-bottom:10px;">🚀</span> لا يوجد طلبات تغيير نظام حالياً</div>';
}

async function approveGoalChange(id, phone, goal) {
    if(!id || !phone || !goal) return;
    Swal.fire({ title: 'جاري التحديث...', didOpen: () => Swal.showLoading(), target: document.getElementById('goal-change-modal') });
    try {
        const cleanPhone = String(phone).trim();
        const cleanGoal = String(goal).trim();
        
        await db.collection('users').doc(cleanPhone).update({ 
            goal: cleanGoal,
            lastUpdate: Date.now()
        });

        await db.collection('goalChanges').doc(id).delete();
        sendNotificationTo(cleanPhone, "تم تغيير نظامك! 🚀", `الكابتن وافق على طلبك ودلوقتي نظامك هو: ${cleanGoal}`);
        
        Swal.fire({
            title: 'تم التحديث بنجاح ✅',
            icon: 'success',
            timer: 2000,
            target: document.getElementById('goal-change-modal')
        });
        loadAdmin();
    } catch(e) { 
        console.error("Error in approveGoalChange:", e);
        Swal.fire({ title: 'خطأ', text: 'فشل التحديث، تأكد من الاتصال', icon: 'error', target: document.getElementById('goal-change-modal') }); 
    }
}

// --- نظام إدارة الرسائل للأدمن (WhatsApp Style) ---

function handleChatTabClick() {
    if(!currentUser) return;
    if(currentUser.role === 'admin') {
        switchTab('admin-chat', document.getElementById('chat-tab-nav'));
        renderAdminChatList();
    } else {
        openChat();
    }
}

function renderAdminChatList() {
    const list = document.getElementById('admin-chat-list');
    if(!list) return;

    // تحويل خريطة الرسائل لمصفوفة وترتيبها بالأحدث
    const rooms = Object.keys(adminLatestMessages).map(phone => {
        const user = allUsersData.find(u => u.phone === phone);
        return {
            phone: phone,
            name: user ? user.name : phone,
            ...adminLatestMessages[phone]
        };
    }).sort((a, b) => b.ts - a.ts);

    if(rooms.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:#444; margin-top:50px;">لا توجد محادثات نشطة بعد 📭</p>';
        return;
    }

    list.innerHTML = rooms.map(room => {
        const isMe = room.sender === currentUser.phone;
        const timeStr = new Date(room.ts).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'});
        const badgeClass = (!isMe && currentChatUser !== room.phone) ? "" : "hidden";

        return `
            <div onclick="openChat('${room.phone}')" style="display:flex; align-items:center; gap:15px; background:#111; padding:15px; border-radius:20px; border:1px solid #222; cursor:pointer; transition:0.3s;" onmouseover="this.style.background='#1a1a1a'" onmouseout="this.style.background='#111'">
                <div style="width:50px; height:50px; border-radius:50%; background:rgba(255,255,255,0.03); display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0;">👤</div>
                <div style="flex:1; overflow:hidden; text-align:right;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                        <small style="color:#555; font-size:10px;">${timeStr}</small>
                        <b style="color:#fff; font-size:15px;">${room.name}</b>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span id="admin-chat-badge-${room.phone}" class="admin-chat-badge ${badgeClass}" style="width:10px; height:10px; background:red; border-radius:50%; border:2px solid #000;"></span>
                        <p style="color:#777; font-size:13px; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:80%;">
                            ${isMe ? 'أنت: ' : ''}${room.msg}
                        </p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function setupGlobalChatListener() {
    if(!currentUser || currentUser.role === 'admin') return;
    
    // Member listens to their own chat room for new messages NOT from them
    db.collection('chats')
      .where('uPhone', '==', currentUser.phone)
      .onSnapshot(snap => {
          let hasUnread = false;
          snap.forEach(doc => {
              const d = doc.data();
              const isMe = d.sender === currentUser.phone;
              const isChatOpen = !document.getElementById('chat-modal').classList.contains('hidden');
              if(!isMe && !isChatOpen) hasUnread = true;
          });
          
          const badge = document.getElementById('chat-badge');
          if(badge) {
              if(hasUnread) badge.classList.remove('hidden');
              else badge.classList.add('hidden');
          }
      }, err => console.error("Global Chat Listener Error:", err));
}

// نظام مراقبة الرسائل للكابتن (مثل واتساب)
function setupAdminChatBadges() {
    if(!currentUser || currentUser.role !== 'admin') return;
    
    console.log("Admin Chat Listener Initializing...");
    
    const processSnap = (snap) => {
        console.log("CHAT_SNAP_RECEIVED:", snap.size);
        if(snap.empty) {
            renderAdminChatList();
            return;
        }
        
        snap.forEach(doc => {
            const d = doc.data();
            if(d.uPhone && (!adminLatestMessages[d.uPhone] || d.ts > adminLatestMessages[d.uPhone].ts)) {
                adminLatestMessages[d.uPhone] = d;
            }
        });

        // رندر القائمة فوراً لو مفتوحة
        const chatTab = document.getElementById('admin-chat-tab');
        if(chatTab && !chatTab.classList.contains('hidden')) {
            renderAdminChatList();
        }

        updateAllChatBadges();
    };

    // سحب الرسائل ببساطة بدون أي فلاتر معقدة لضمان الوصول
    db.collection('chats').limit(200).onSnapshot(processSnap, err => {
        console.error("CHAT_LISTENER_CRITICAL_ERROR:", err);
    });
}

function updateAllChatBadges() {
    if(!currentUser) return;
    const isModalOpen = !document.getElementById('chat-modal').classList.contains('hidden');

    if(currentUser.role === 'admin') {
        let hasAnyUnread = false;
        for(const phone in adminLatestMessages) {
            const last = adminLatestMessages[phone];
            const badges = document.querySelectorAll(`[id="admin-chat-badge-${phone}"]`);
            const isThisChatOpen = isModalOpen && currentChatUser === phone;
            
            const isUnread = last.sender !== currentUser.phone && !isThisChatOpen;
            if(isUnread) hasAnyUnread = true;

            badges.forEach(badge => {
                if(isUnread) badge.classList.remove('hidden');
                else badge.classList.add('hidden');
            });
        }
        const globalBadge = document.getElementById('chat-badge');
        if(globalBadge) {
            if(hasAnyUnread) globalBadge.classList.remove('hidden');
            else globalBadge.classList.add('hidden');
        }
    } else {
        // العضو: يتم التحديث عادة من السناب شوت لكن نضمن هنا الإخفاء لو فتح الشات
        if(isModalOpen) {
            const b = document.getElementById('chat-badge');
            if(b) b.classList.add('hidden');
        }
    }
}

function initChatListeners() {
    setupGlobalChatListener();
    setupAdminChatBadges();
}

let currentAdminFilter = 'all';
function filterAdminUsers(goal = currentAdminFilter) {
    currentAdminFilter = goal;
    const searchVal = document.getElementById('admin-search-phone').value.trim();
    const list = document.getElementById('all-users-list'); 
    let filtered = allUsersData.filter(u => u.status === 'approved');
    
    // تحديث ألوان أزرار الفلتر
    const filterBtns = document.querySelectorAll('#admin-user-filters .sub-btn');
    const colors = {
        'all': 'var(--primary)',
        'نظام تدريب': 'var(--primary)',
        'نظام تغذيه': '#2e7d32',
        'نظام تدريب + تغذيه': '#6a1b9a',
        'نظام VIP': 'var(--accent)',
        'expired': '#b71c1c'
    };
    
    filterBtns.forEach(btn => {
        const btnGoal = btn.getAttribute('onclick').match(/'([^']+)'/)[1];
        btn.style.background = (btnGoal === goal) ? (colors[btnGoal] || '#1a1a1a') : '#1a1a1a';
    });

    if(goal === 'expired') {
        filtered = allUsersData.filter(u => u.status === 'approved' && u.expiryDate && u.expiryDate < Date.now());
    } else if(goal !== 'all') {
        // فلتر مرن يبحث عن الكلمة الأساسية (مثل VIP أو تغذيه) داخل نص الهدف
        const searchKey = goal.replace('نظام ', ''); 
        filtered = filtered.filter(u => (u.goal || "").includes(searchKey));
    }
    if(searchVal) filtered = filtered.filter(u => u.phone && u.phone.includes(searchVal));

    list.innerHTML = filtered.map(u => {
        let goalIcon = "🏋️";
        let goalColor = "var(--primary)";
        const goalStr = u.goal || "";

        if(goalStr.includes('تغذيه')) { goalIcon = "🥗"; goalColor = "#2e7d32"; }
        else if(goalStr.includes('VIP')) { goalIcon = "⭐"; goalColor = "var(--accent)"; }
        else if(goalStr.includes('+') || goalStr.includes('تغذية')) { // handle Mix variations
             if(goalStr.includes('تدريب')) { goalIcon = "🔄"; goalColor = "#6a1b9a"; }
        }
        
        // Final fallback to double check Mix
        if(goalStr === 'نظام تدريب + تغذيه') { goalIcon = "🔄"; goalColor = "#6a1b9a"; }
        // التحقق من وجود رسالة جديدة لهذا المستخدم فوراً عند الرندرة
        const lastMsg = adminLatestMessages[u.phone];
        const showBadge = lastMsg && lastMsg.sender !== currentUser.phone ? "" : "hidden";

        return `
            <div class="user-admin-card" style="margin-bottom:12px; display:flex; align-items:center; gap:12px; background:linear-gradient(135deg, #111, #070707); padding:12px; border-radius:20px; border:1px solid #222; transition:0.3s; position:relative; overflow:hidden; border-right:4px solid ${goalColor};">
                <div style="width:45px; height:45px; border-radius:50%; background:rgba(255,255,255,0.03); display:flex; align-items:center; justify-content:center; font-size:20px; border:1px solid rgba(255,255,255,0.05); flex-shrink:0;">👤</div>
                <div style="flex:1; text-align:right;" onclick="openProfile('${u.id}')">
                    <b style="color:#fff; display:block; font-size:15px; margin-bottom:2px;">${u.name}</b>
                    <span style="font-size:10px; color:${goalColor}; font-weight:bold;">${goalIcon} ${u.goal || 'بدون نظام'}</span>
                </div>
                <div style="display:flex; gap:5px;">
                    <div style="position:relative;">
                        <button onclick="openChat('${u.phone}')" style="background:rgba(33,150,243,0.1); border:1px solid #2196f3; color:#2196f3; width:40px; height:40px; border-radius:12px; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center;">💬</button>
                        <span id="admin-chat-badge-${u.phone}" class="admin-chat-badge ${showBadge}" style="position:absolute; top:-5px; right:-5px; width:12px; height:12px; background:red; border-radius:50%; border:2px solid #000; z-index:5;"></span>
                    </div>
                    <button onclick="activeTarget='${u.id}'; viewSelectedUserLogs()" style="background:rgba(255,255,255,0.05); border:1px solid #333; color:#fff; width:40px; height:40px; border-radius:12px; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:0.3s;">📜</button>
                </div>
            </div>
        `;
    }).join('');
}
async function openProfile(id) { 
    activeTarget = id; const d = await db.collection('users').doc(id).get(); const data = d.data();
    document.getElementById('prof-name').innerText = data.name; 
    document.getElementById('admin-captain-notes').value = data.captainNotes || "";
    
    // Fill Vitals for Admin
    document.getElementById('admin-view-age').innerText = data.age || '--';
    document.getElementById('admin-view-weight').innerText = data.weight || '--';
    document.getElementById('admin-view-height').innerText = data.height || '--';
    document.getElementById('admin-view-fat').innerText = data.fat || '--';

    document.getElementById('profile-modal').classList.remove('hidden'); currentPlanData = data.workoutPlan || {};
    
    // ستايل جديد بريميوم للزراير (Workout)
    document.getElementById('admin-plan-cats-workout').innerHTML = PLAN_CATS.map(c => `
        <button class="sub-btn" onclick="editAdminPlan('${c}')" style="background:#1a1a1a; border:1px solid #333; color:var(--primary); padding:15px; border-radius:15px; font-weight:bold; font-size:14px; transition:all 0.3s; box-shadow:0 4px 6px rgba(0,0,0,0.3);">
            🏋️ ${c}
        </button>`).join('');

    // ستايل جديد بريميوم للزراير (Nutrition)
    document.getElementById('admin-plan-cats-nutri').innerHTML = NUTRI_CATS.map(c => `
        <button class="sub-btn" onclick="editAdminPlan('${c}')" style="background:#1a1a1a; border:1px solid #333; color:#4caf50; padding:15px; border-radius:15px; font-weight:bold; font-size:14px; transition:all 0.3s; box-shadow:0 4px 6px rgba(0,0,0,0.3);">
            🥗 ${c}
        </button>`).join('');
}
function editAdminPlan(cat) { editingCat = cat; document.getElementById('admin-plan-editor').classList.remove('hidden'); const container = document.getElementById('admin-plan-rows'); container.innerHTML = ""; const exs = currentPlanData[cat] || []; exs.forEach(ex => addAdminPlanRow(ex)); if(exs.length===0) addAdminPlanRow(); }
function addAdminPlanRow(d = {}) {
    const container = document.getElementById('admin-plan-rows');
    const card = document.createElement('div');
    card.className = "plan-edit-card";
    const isNutri = NUTRI_CATS.includes(editingCat);
    const rowId = 'row-' + Date.now() + Math.random().toString(36).substr(2, 5);
    
    card.style = `
        background: #1a1a1a;
        border: 1px solid #333;
        border-right: 4px solid ${isNutri ? '#4caf50' : 'var(--primary)'};
        border-radius: 20px;
        padding: 20px;
        margin-bottom: 15px;
        position: relative;
        box-shadow: 0 10px 20px rgba(0,0,0,0.4);
    `;

    // إبعاد السلة قليلاً لليمين
    const deleteBtn = `<div onclick="this.parentElement.remove()" style="position:absolute; right:15px; top:15px; color:#ff3b30; cursor:pointer; font-size:18px; filter:drop-shadow(0 0 5px rgba(255,59,48,0.3)); z-index:10;">🗑️</div>`;

    if(isNutri) {
        card.innerHTML = `
            ${deleteBtn}
            <div style="display:flex; flex-direction:column; gap:12px; margin-top:10px;">
                <input type="text" value="${d.name||''}" class="p-name" placeholder="🥗 اسم الوجبة (مثلاً: فطار بطل)" style="width:100%; background:#000; border:1px solid #333; color:#fff; padding:12px; border-radius:12px; font-weight:bold;">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                    <input type="text" value="${d.note||''}" class="p-note" placeholder="📝 التفاصيل" style="background:#000; border:1px solid #333; color:#aaa; padding:10px; border-radius:10px; font-size:13px;">
                    <input type="text" value="${d.weight||''}" class="p-weight" placeholder="⚖️ الكمية" style="background:#000; border:1px solid #333; color:#4caf50; padding:10px; border-radius:10px; font-size:13px; font-weight:bold;">
                </div>
            </div>`;
    } else {
        const initialSets = d.sets || 4;
        card.innerHTML = `
            ${deleteBtn}
            <div style="display:flex; flex-direction:column; gap:12px; margin-top:10px;">
                <div style="display:flex; gap:10px; align-items:center; padding-left:30px;">
                    <input type="text" value="${d.name||''}" class="p-name" placeholder="🏋️ اسم التمرين" style="flex:1; background:#000; border:1px solid #333; color:#fff; padding:12px; border-radius:12px; font-weight:bold;">
                    <div style="display:flex; align-items:center; background:#000; padding:5px 10px; border-radius:10px; border:1px solid #333;">
                        <small style="color:#777; margin-left:5px;">مجموعات:</small>
                        <input type="number" value="${initialSets}" class="p-sets" 
                               oninput="updateSetsVisibility('${rowId}', this.value)"
                               style="width:45px; background:none; border:none; color:var(--primary); font-weight:bold; text-align:center;">
                    </div>
                </div>
                <div id="${rowId}" style="display:grid; grid-template-columns: repeat(2, 1fr); gap:12px; background:rgba(0,0,0,0.3); padding:15px; border-radius:18px;">
                    ${[1,2,3,4,5,6].map(n => `
                        <div class="set-box-${n}" style="display:${n > initialSets ? 'none' : 'flex'}; flex-direction:column; gap:8px; background:#000; padding:10px; border-radius:12px; border:1px solid #222;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span style="font-size:10px; color:#777; font-weight:bold;">مجموعة ${n}</span>
                            </div>
                            <input type="text" value="${d['w'+n]||''}" class="w${n}" placeholder="الوزن (مثلاً: 20 ك)" style="width:100%; background:rgba(255,179,0,0.05); border:1px solid #333; color:var(--accent); font-size:14px; text-align:center; padding:8px; border-radius:8px;">
                            <input type="text" value="${d['r'+n]||''}" class="r${n}" placeholder="العدات (مثلاً: 12)" style="width:100%; background:rgba(76,175,80,0.05); border:1px solid #333; color:var(--success); font-size:14px; text-align:center; padding:8px; border-radius:8px;">
                        </div>
                    `).join('')}
                </div>
            </div>`;
    }
    container.appendChild(card);
}

function updateSetsVisibility(rowId, count) {
    const container = document.getElementById(rowId);
    if(!container) return;
    const num = parseInt(count) || 0;
    for(let i=1; i<=6; i++) {
        const box = container.querySelector('.set-box-' + i);
        if(box) box.style.display = (i <= num) ? 'flex' : 'none';
    }
}

async function saveAdminPlan(ev) { 
    if(ev) ev.preventDefault(); 
    const targetId = activeTarget; 
    let exs = []; 
    document.querySelectorAll('.plan-edit-card').forEach(card => { 
        const name = card.querySelector('.p-name').value.trim(); 
        if(name) { 
            const isNutri = NUTRI_CATS.includes(editingCat); 
            let row = { name, done: false }; 
            if(isNutri) { 
                row.note = card.querySelector('.p-note').value; 
                row.weight = card.querySelector('.p-weight').value; 
            } else { 
                row.sets = card.querySelector('.p-sets').value; 
                for(let i=1; i<=6; i++) { 
                    row['w'+i] = card.querySelector('.w'+i).value; 
                    row['r'+i] = card.querySelector('.r'+i).value; 
                } 
            } 
            exs.push(row); 
        } 
    }); 
    currentPlanData[editingCat] = exs; 
    await db.collection('users').doc(targetId).update({ workoutPlan: currentPlanData }); 
    sendNotificationTo(targetId, "تحديث من الكابتن 🔥", `تم تعديل جدول ${editingCat}`); 
    
    // إظهار الرسالة بوضوح
    Swal.fire({ 
        icon: 'success', 
        title: 'تم الحفظ بنجاح ✅', 
        showConfirmButton: false, 
        timer: 1500, 
        background: '#1a1a1a', 
        color: '#fff' 
    }); 
}

// --- ADMIN USER CONTROLS ---
async function viewSelectedUserLogs() {
    Swal.fire({
        title: 'سجل نشاط البطل 📜',
        html: '<div id="admin-user-history" style="max-height:500px; overflow-y:auto;">جاري التحميل...</div>',
        width: '95%', background: '#121212', color: '#fff'
    });
    fetchAndRenderLogs(activeTarget, 'admin-user-history', true);
}

async function saveCaptainNotes() {
    const notes = document.getElementById('admin-captain-notes').value;
    await db.collection('users').doc(activeTarget).update({ captainNotes: notes });
    sendNotificationTo(activeTarget, "رسالة من الكابتن 🔔", "الكابتن ساب لك ملاحظة جديدة في صفحتك الرئيسية.. شوفها دلوقت!");
    Swal.fire({ 
        icon: 'success', 
        title: 'تم حفظ الملاحظات وإرسال تنبيه ✅', 
        showConfirmButton: false, 
        timer: 1500, 
        background: '#1a1a1a', 
        color: '#fff' 
    });
}

async function resetUserPass() {
    const { value: newPass } = await Swal.fire({ title: 'تعيين كلمة سر جديدة', input: 'text', showCancelButton: true });
    if(newPass) {
        await db.collection('users').doc(activeTarget).update({ password: newPass });
        Swal.fire('تم التغيير ✅', `كلمة السر الجديدة: ${newPass}`, 'success');
    }
}

async function approveUser(id) {
    await db.collection('users').doc(id).update({ status: 'approved' });
    sendNotificationTo(id, "تم تفعيل حسابك! 🎉", "ألف مبروك! الكابتن وافق على اشتراكك، تقدر تدخل دلوقت وتشوف نظامك.");
    loadAdmin();
    Swal.fire('تم التفعيل ✅', '', 'success');
}

async function deleteUser(id) {
    const targetId = id || activeTarget;
    if(!targetId) return;

    const result = await Swal.fire({
        title: 'هل أنت متأكد؟ ⚠️',
        text: "سيتم حذف هذا البطل نهائياً!",
        icon: 'warning',
        target: document.getElementById('profile-modal'), // الربط بالصفحة الحالية
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#333',
        confirmButtonText: 'نعم، احذفه! 🗑️',
        cancelButtonText: 'إلغاء',
        background: '#181818',
        color: '#fff',
        backdrop: 'rgba(0,0,0,0.4)'
    });

    if (result.isConfirmed) {
        Swal.fire({ title: 'جاري الحذف...', didOpen: () => Swal.showLoading() });
        try {
            await db.collection('users').doc(targetId).delete();
            
            // إغلاق كل المودالات المفتوحة
            document.getElementById('profile-modal').classList.add('hidden');
            document.getElementById('pending-requests-modal').classList.add('hidden');
            
            await loadAdmin();
            Swal.fire('تم الحذف!', 'تمت إزالة البطل بنجاح.', 'success');
        } catch(e) {
            Swal.fire('خطأ', 'فشل حذف المشترك', 'error');
        }
    }
}

// --- OTHERS & KNOWLEDGE ---
function openInfoBank() { 
    document.getElementById('info-bank-modal').classList.remove('hidden'); 
    const content = document.getElementById('info-bank-content'); 
    content.innerHTML = '<p style="text-align:center; color:#777;">جاري التحميل... 🔥</p>'; 
    
    const fallbackTips = [
        { q: "أهمية شرب المياة أثناء التمرين 💧", a: "شرب المياة بيحافظ على رطوبة عضلاتك وبيمنع التشنجات، لازم تشرب على الأقل 2 لتر خلال يومك." },
        { q: "إزاي تستفيد من الـ Creatine؟ 🧪", a: "الكرياتين بيزود القوة والحجم، جرعته اليومية 5 جرام ولازم تشرب معاه مياة كتير." },
        { q: "ليه النوم مهم لبناء العضلات؟ 😴", a: "العضلات بتكبر وإنت نايم! جسمك بيفرز هرمون النمو خلال النوم العميق، لازم تنام 7-8 ساعات." },
        { q: "القاعدة الذهبية للتغذية 🥗", a: "عشان تشوف نتيجة، لازم 70% من مجهودك يكون في المطبخ! البروتين هو حجر الأساس لبناء العضلات." }
    ];

    function renderTips(tips) {
        let h = "";
        tips.forEach(t => {
            h += `<div style="background:rgba(255,255,255,0.03); border:1px solid #222; padding:15px; border-radius:15px; margin-bottom:10px;"><b style="color:var(--accent);">💡 ${t.q}</b><p style="color:#eee; font-size:13px; line-height:1.6;">${t.a}</p></div>`;
        });
        content.innerHTML = h;
    }

    db.collection('knowledge').orderBy('ts', 'desc').get().then(snap => { 
        if (!snap.empty) {
            let items = [];
            snap.forEach(doc => items.push(doc.data()));
            renderTips(items);
        } else {
            renderTips(fallbackTips);
        }
    }).catch(() => {
        renderTips(fallbackTips);
    });
}
async function loadTechniques() { const list = document.getElementById('technique-list'); try { const snap = await db.collection('techniques').orderBy('ts', 'desc').get(); let h = ""; snap.forEach(doc => { const d = doc.data(); h += `<div class="card" style="margin-bottom:15px;"><div style="display:flex; justify-content:space-between; align-items:center;"><b>${d.name}</b>${currentUser.role==='admin'?`<i onclick="deleteTechnique('${doc.id}')" style="color:#ff3b30; cursor:pointer;">🗑️</i>`:''}</div><div style="display:flex; gap:10px; margin-top:10px;">${d.correctUrl?`<a href="${d.correctUrl}" target="_blank" class="sub-btn">✅ الأداء</a>`:''}${d.wrongUrl?`<a href="${d.wrongUrl}" target="_blank" class="sub-btn" style="color:#ff3b30;">❌ الخطأ</a>`:''}</div></div>`; }); list.innerHTML = h || '<p>قريباً..</p>'; } catch(e){} }
function switchTab(t, el) { 
    document.querySelectorAll('.content-tab').forEach(c => c.classList.add('hidden')); 
    document.getElementById(t+'-tab').classList.remove('hidden'); 
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active')); 
    if(el) el.classList.add('active'); 
    
    // إظهار الأقسام الأساسية عند التبديل لتبويب المستخدم
    if(t==='user') {
        const goal = (currentUser && currentUser.goal) ? currentUser.goal : '';
        if(goal.includes('تغذيه') || goal.includes('VIP')) {
            if(document.getElementById('nutrition-extras')) document.getElementById('nutrition-extras').classList.remove('hidden');
            if(document.getElementById('food-prefs-section')) document.getElementById('food-prefs-section').classList.remove('hidden');
        }
    }

    if(t==='history') loadUserLogs(); 
    if(t==='technique') loadTechniques(); 
    if(t==='eval') loadEvaluationData(); 
}

// --- TIMERS ---

function toggleWorkoutTimer() {
    const btn = document.getElementById('workout-timer-btn'); const display = document.getElementById('workout-timer-display');
    if (!workoutTimerInterval) {
        workoutStartTime = Date.now() - (workoutSeconds * 1000);
        workoutTimerInterval = setInterval(() => { workoutSeconds = Math.floor((Date.now() - workoutStartTime) / 1000); const h = Math.floor(workoutSeconds / 3600).toString().padStart(2, '0'); const m = Math.floor((workoutSeconds % 3600) / 60).toString().padStart(2, '0'); const s = (workoutSeconds % 60).toString().padStart(2, '0'); display.innerText = `${h}:${m}:${s}`; }, 1000);
        btn.style.background = "#ff3b30";
    } else {
        clearInterval(workoutTimerInterval); workoutTimerInterval = null; const totalTime = display.innerText;
        Swal.fire({ title: 'خلصت التمرين؟ 💪', text: `وقتك: ${totalTime}`, showCancelButton: true }).then(async (res) => { 
            if(res.isConfirmed) { 
                await db.collection('logs').add({ uPhone: currentUser.phone, uName: currentUser.name, type: 'وقت التمرين', val: totalTime, ts: firebase.firestore.FieldValue.serverTimestamp() }); 
                sendNotificationTo(ADMIN_PHONE, "بطل خلص تمرينه! 🏆", `البطل ${currentUser.name} خلص تمرينه في وقت ${totalTime}.`); 
                
                // مسح علامات الصح للتمارين والوجبات
                const allCats = [...PLAN_CATS, ...NUTRI_CATS];
                for(let c of allCats) { if(currentPlanData[c]) currentPlanData[c].forEach(item => item.done = false); }
                await db.collection('users').doc(currentUser.phone).update({ workoutPlan: currentPlanData });
                
                workoutSeconds = 0; display.innerText = "00:00:00"; btn.style.background = "var(--accent)"; 
                if(lastViewedCat) viewCatPlan(lastViewedCat, true);
                loadUserLogs(); 

                // إظهار بطاقة المشاركة مع اسم التمرين الحالي
                openShareCard(lastViewedCat || "الحديد");
            } 
        });
    }
}

function startRestTimer(s) {
    const overlay = document.getElementById('rest-timer-overlay');
    const display = document.getElementById('rest-seconds');
    const circle = document.getElementById('rest-progress-circle');
    if(!overlay || !display || !circle) return;

    overlay.style.display = 'flex';
    let r = s;
    display.innerText = r;
    
    const totalLength = 282.7; // 2 * PI * 45
    circle.style.strokeDashoffset = 0;
    
    if(restInterval) clearInterval(restInterval);
    restInterval = setInterval(()=> { 
        r--; 
        display.innerText = r; 
        const offset = totalLength - (r / s) * totalLength;
        circle.style.strokeDashoffset = offset;

        if(r<=0){ 
            stopRestTimer();
        } 
    }, 1000); 
}

function stopRestTimer() {
    clearInterval(restInterval);
    const overlay = document.getElementById('rest-timer-overlay');
    if(overlay) overlay.style.display = 'none';
}

// --- RECOVERY FUNCTIONS ---
async function fireGymChangePass() { const { value: pass } = await Swal.fire({ title: 'تغيير كلمة السر 🔒', input: 'password', showCancelButton: true }); if (pass) { await db.collection('users').doc(currentUser.phone).update({ password: pass }); Swal.fire('تم التغيير ✅', '', 'success'); } }
async function requestGoalChange() { const { value: goal } = await Swal.fire({ title: 'اختر نظامك الجديد 🚀', input: 'select', inputOptions: { 'نظام تدريب': 'نظام تدريب 🏋️‍♂️', 'نظام تغذيه': 'نظام تغذيه 🥗', 'نظام VIP': 'نظام VIP ⭐' }, showCancelButton: true }); if (goal) { await db.collection('users').doc(currentUser.phone).update({ pendingGoal: goal }); sendNotificationTo(ADMIN_PHONE, "طلب تغيير نظام 📝", `البطل ${currentUser.name} طالب يغير نظامه لـ ${goal}`); Swal.fire('تم الإرسال ✅', '', 'success'); } }
function checkWaterReset() { const d = new Date().toDateString(); if(localStorage.getItem('w_date')!==d){ localStorage.setItem('w_date',d); localStorage.setItem('w_count',"0"); } document.getElementById('water-count').innerText=localStorage.getItem('w_count')||"0"; }
async function updateWater(v) { let c = parseInt(localStorage.getItem('w_count')||"0")+v; localStorage.setItem('w_count', c); document.getElementById('water-count').innerText=c; await db.collection('logs').add({ uPhone: currentUser.phone, type: 'مياه', val: c + ' كوب', ts: firebase.firestore.FieldValue.serverTimestamp() }); loadUserLogs(); }
// --- UI LOADERS ---

function toggleAuth(mode) {
    if(mode === 'register') {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('register-form').classList.remove('hidden');
    } else {
        document.getElementById('register-form').classList.add('hidden');
        document.getElementById('login-form').classList.remove('hidden');
    }
}

function toggleNutritionSection(id) {
    const sections = ['food-prefs-section', 'recipes-section'];
    sections.forEach(s => {
        const el = document.getElementById(s);
        if(!el) return;
        if(s === id) el.classList.toggle('hidden');
        else el.classList.add('hidden');
    });
}

// --- RECIPES SYSTEM ---
async function loadRecipes() {
    const gallery = document.getElementById('recipes-gallery');
    if(!gallery) return;
    try {
        const snap = await db.collection('recipes').orderBy('ts', 'desc').get();
        let h = "";
        snap.forEach(doc => {
            const d = doc.data();
            // إخفاء الوصفات التي قام المستخدم بحذفها لنفسه
            if(currentUser.hiddenRecipes && currentUser.hiddenRecipes.includes(doc.id) && currentUser.role !== 'admin') return;

            h += `
            <div class="card" style="padding:0; overflow:hidden;" onclick="openRecipeDetail('${doc.id}')">
                <div style="height:120px; background:url('${d.img || 'https://via.placeholder.com/150'}') center/cover;"></div>
                <div style="padding:10px; font-size:12px; text-align:center;">
                    <b>${d.name}</b>
                    <button onclick="event.stopPropagation(); deleteRecipe('${doc.id}')" style="display:block; width:100%; margin-top:5px; background:rgba(255,59,48,0.1); color:#ff3b30; border:1px solid #ff3b30; border-radius:5px; font-size:10px;">
                        ${currentUser.role === 'admin' ? 'حذف نهائي 🗑️' : 'إخفاء 🗑️'}
                    </button>
                </div>
            </div>`;
        });
        gallery.innerHTML = h || '<p style="grid-column: 1 / -1; text-align:center; color:#444;">مفيش وصفات لسه 🔥</p>';
    } catch(e){}
}

function openRecipeDetail(id) {
    db.collection('recipes').doc(id).get().then(doc => {
        const d = doc.data();
        document.getElementById('recipe-detail-img').style.backgroundImage = `url('${d.img}')`;
        document.getElementById('recipe-detail-name').innerText = d.name;
        document.getElementById('recipe-detail-desc').innerText = d.desc;
        document.getElementById('recipe-detail-modal').classList.remove('hidden');
    });
}

function processRecipeImg(input) {
    if (input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 500; canvas.height = (img.height/img.width)*500;
                canvas.getContext('2d').drawImage(img, 0,0,500,canvas.height);
                finalBase64 = canvas.toDataURL('image/jpeg', 0.6);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function saveRecipe() {
    const name = document.getElementById('recipe-name').value;
    const desc = document.getElementById('recipe-desc').value;
    if(!name || !finalBase64) return Swal.fire('نقص بيانات', 'لازم اسم وصورة للوصفة', 'warning');
    await db.collection('recipes').add({ name, desc, img: finalBase64, ts: Date.now() });
    Swal.fire('تم النشر ✅', '', 'success');
    document.getElementById('admin-recipes-tool').classList.add('hidden');
    loadRecipes();
}

async function deleteRecipe(id) {
    if(currentUser.role === 'admin') {
        const result = await Swal.fire({
            title: 'حذف نهائي؟ ⚠️',
            text: "سيتم حذف الوصفة نهائياً من عند جميع الأبطال!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ff3b30',
            cancelButtonColor: '#333',
            confirmButtonText: 'نعم، احذف نهائياً',
            cancelButtonText: 'إلغاء',
            background: '#121212',
            color: '#fff'
        });
        if(result.isConfirmed) { 
            await db.collection('recipes').doc(id).delete(); 
            loadRecipes(); 
            Swal.fire('تم الحذف', '', 'success');
        }
    } else {
        const result = await Swal.fire({
            title: 'إخفاء الوصفة؟ 🗑️',
            text: "هل تريد إخفاء هذه الوصفة من قائمتك؟",
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#ff3b30',
            cancelButtonColor: '#333',
            confirmButtonText: 'نعم، إخفاء',
            cancelButtonText: 'إلغاء',
            background: '#121212',
            color: '#fff'
        });
        if(result.isConfirmed) {
            if(!currentUser.hiddenRecipes) currentUser.hiddenRecipes = [];
            currentUser.hiddenRecipes.push(id);
            await db.collection('users').doc(currentUser.phone).update({
                hiddenRecipes: firebase.firestore.FieldValue.arrayUnion(id)
            });
            loadRecipes();
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'تم الإخفاء', timer: 1500 });
        }
    }
}

// --- FOOD PREFERENCES ---
async function loadFoodPrefs() {
    const body = document.getElementById('food-prefs-body');
    if(!body) return;
    const prefs = currentUser.foodPrefs || [];
    body.innerHTML = prefs.map((p, i) => `
        <tr style="border-bottom:1px solid #222;">
            <td style="padding:10px;"><input type="text" value="${p.name}" class="pref-name" style="width:100%; background:none; border:none; color:#fff;"></td>
            <td>
                <select class="pref-status" style="background:#000; color:#fff; border:1px solid #333; border-radius:5px; padding:5px;">
                    <option value="like" ${p.status==='like'?'selected':''}>❤️ بحب</option>
                    <option value="dislike" ${p.status==='dislike'?'selected':''}>💔 بكره</option>
                </select>
            </td>
            <td><button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:#ff3b30;">✕</button></td>
        </tr>
    `).join('');
}

function addPrefRow() {
    const body = document.getElementById('food-prefs-body');
    if(!body) return;
    const tr = document.createElement('tr');
    tr.style.borderBottom = "1px solid #222";
    tr.innerHTML = `
        <td style="padding:10px;"><input type="text" class="pref-name" placeholder="مثلاً: بامية" style="width:100%; background:none; border:none; color:#fff;"></td>
        <td>
            <select class="pref-status" style="background:#000; color:#fff; border:1px solid #333; border-radius:5px; padding:5px;">
                <option value="like">❤️ بحب</option>
                <option value="dislike">💔 بكره</option>
            </select>
        </td>
        <td><button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:#ff3b30;">✕</button></td>`;
    body.appendChild(tr);
}

async function saveFoodPrefs() {
    const rows = document.querySelectorAll('#food-prefs-body tr');
    let prefs = [];
    rows.forEach(r => {
        const name = r.querySelector('.pref-name').value;
        const status = r.querySelector('.pref-status').value;
        if(name) prefs.push({ name, status });
    });
    await db.collection('users').doc(currentUser.phone).update({ foodPrefs: prefs });
    Swal.fire('تم الحفظ ✅', 'الكابتن هيشوف تفضيلاتك في الأكل فوراً', 'success');
}


// --- KNOWLEDGE MANAGEMENT ---
async function saveKnowledge() {
    const q = document.getElementById('info-q').value;
    const a = document.getElementById('info-a').value;
    if(!q || !a) return;
    await db.collection('knowledge').add({ q, a, ts: Date.now() });
    Swal.fire('تم النشر ✅', '', 'success');
    document.getElementById('info-q').value = "";
    document.getElementById('info-a').value = "";
    loadKnowledgeAdmin();
}

async function loadKnowledgeAdmin() {
    const list = document.getElementById('admin-info-list');
    if(!list) return;
    const snap = await db.collection('knowledge').orderBy('ts', 'desc').get();
    let h = "";
    snap.forEach(doc => {
        h += `<div style="background:#111; padding:10px; border-radius:10px; margin-bottom:5px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:12px;">${doc.data().q}</span>
                <button onclick="deleteKnowledge('${doc.id}')" style="color:#ff3b30; background:none; border:none;">🗑️</button>
              </div>`;
    });
    list.innerHTML = h;
}

async function deleteKnowledge(id) {
    const result = await Swal.fire({
        title: 'حذف المعلومة؟ 🗑️',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ff3b30',
        cancelButtonColor: '#333',
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        background: '#121212',
        color: '#fff'
    });
    if(result.isConfirmed) { 
        await db.collection('knowledge').doc(id).delete(); 
        loadKnowledgeAdmin(); 
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'تم الحذف', timer: 1500 });
    } 
}

async function forceSeedKnowledge() {
    const res = await Swal.fire({
        title: 'إعادة تعيين بنك المعلومات؟',
        text: "سيتم مسح كل النصائح الحالية وإضافة النصائح الأساسية (المنقذة) فوراً!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، أعد التعيين 🔄',
        cancelButtonText: 'إلغاء',
        background: '#121212',
        color: '#fff',
        target: document.getElementById('admin-info-card')
    });

    if (res.isConfirmed) {
        Swal.fire({ 
            title: 'جاري التحديث...', 
            allowOutsideClick: false, 
            target: document.getElementById('admin-info-card'),
            didOpen: () => Swal.showLoading() 
        });
        try {
            // مسح القديم
            const snap = await db.collection('knowledge').get();
            const batch = db.batch();
            snap.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            // إضافة الأساسيات
            const defaults = [
                { q: "أهمية شرب المياة أثناء التمرين 💧", a: "شرب المياة بيحافظ على رطوبة عضلاتك وبيمنع التشنجات، لازم تشرب على الأقل 2 لتر خلال يومك." },
                { q: "إزاي تستفيد من الـ Creatine؟ 🧪", a: "الكرياتين بيزود القوة والحجم، جرعته اليومية 5 جرام ولازم تشرب معاه مياة كتير." },
                { q: "ليه النوم مهم لبناء العضلات؟ 😴", a: "العضلات بتكبر وإنت نايم! جسمك بيفرز هرمون النمو خلال النوم العميق، لازم تنام 7-8 ساعات." },
                { q: "القاعدة الذهبية للتغذية 🥗", a: "عشان تشوف نتيجة، لازم 70% من مجهودك يكون في المطبخ! البروتين هو حجر الأساس لبناء العضلات." }
            ];

            for (const item of defaults) {
                await db.collection('knowledge').add({ ...item, ts: Date.now() });
            }

            Swal.fire({
                title: 'تمت إعادة التعيين بنجاح ✅',
                icon: 'success',
                target: document.getElementById('admin-info-card')
            });
            loadKnowledgeAdmin();
            openInfoBank(); // تحديث العرض للمستخدمين
        } catch (e) {
            Swal.fire({
                title: 'خطأ',
                text: 'فشل التحديث، تأكد من الاتصال',
                icon: 'error',
                target: document.getElementById('admin-info-card')
            });
        }
    }
}

// --- TECHNIQUES MANAGEMENT ---
async function saveTechnique() {
    const name = document.getElementById('tech-name').value;
    const correct = document.getElementById('tech-correct').value;
    const wrong = document.getElementById('tech-wrong').value;
    if(!name) return;
    await db.collection('techniques').add({ name, correctUrl: correct, wrongUrl: wrong, ts: Date.now() });
    Swal.fire('تم النشر ✅', '', 'success');
    document.getElementById('technique-modal').classList.add('hidden');
    loadTechniques();
}

async function deleteTechnique(id) {
    const result = await Swal.fire({
        title: 'حذف التكنيك؟ 🗑️',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ff3b30',
        cancelButtonColor: '#333',
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        background: '#121212',
        color: '#fff'
    });
    if(result.isConfirmed) { 
        await db.collection('techniques').doc(id).delete(); 
        loadTechniques(); 
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'تم الحذف', timer: 1500 });
    } 
}

// --- NOTIFICATIONS MODAL & BADGE ---
function openNotifModal() {
    Swal.fire({
        title: '🔔 الإشعارات',
        html: '<div id="notif-list" style="max-height:400px; overflow-y:auto; text-align:right;">جاري التحميل...</div>',
        showCloseButton: true,
        showConfirmButton: false,
        background: '#121212',
        color: '#fff',
        width: '95%'
    });
    loadNotifications();
}

function closeNotifModal() {
    Swal.close();
}


async function loadNotifications() {
    const list = document.getElementById('notif-list');
    if(!list) return;
    try {
        const snap = await db.collection('notifications')
            .where('targetPhone', '==', currentUser.phone.toString().trim())
            .get();
        
        let arr = [];
        snap.forEach(d => {
            const data = d.data();
            // تحويل التايم ستامب لرقم بأمان عشان الترتيب ميوقفش
            let timeVal = 0;
            if (data.ts) {
                if (typeof data.ts === 'number') timeVal = data.ts;
                else if (data.ts.toMillis) timeVal = data.ts.toMillis();
                else if (data.ts.seconds) timeVal = data.ts.seconds * 1000;
            }
            arr.push({ id: d.id, ...data, timeVal });
        });

        // الترتيب باستخدام الرقم اللي استخلصناه
        arr.sort((a,b) => b.timeVal - a.timeVal);

        let h = arr.map(d => {
            let displayTime = "الآن";
            if (d.ts) {
                if (typeof d.ts === 'number') displayTime = new Date(d.ts).toLocaleTimeString('ar-EG');
                else if (d.ts.toDate) displayTime = d.ts.toDate().toLocaleTimeString('ar-EG');
            }
            return `
                <div style="background:rgba(255,255,255,0.03); border:1px solid #333; padding:15px; border-radius:15px; margin-bottom:10px; border-right:4px solid var(--primary);">
                    <b style="color:var(--accent); font-size:14px; display:block; margin-bottom:5px;">${d.title}</b>
                    <p style="color:#eee; font-size:13px; line-height:1.4; margin:0;">${d.message}</p>
                    <small style="color:#555; font-size:10px; margin-top:8px; display:block;">${displayTime}</small>
                </div>
            `;
        }).join('');

        list.innerHTML = (arr.length ? h + `<button onclick="clearNotifications()" style="width:100%; padding:10px; background:rgba(255,59,48,0.1); border:1px solid #ff3b30; color:#ff3b30; border-radius:10px; margin-top:10px; font-weight:bold;">🗑️ مسح كل الإشعارات</button>` : '<p style="text-align:center; padding:30px; color:#444;">مفيش إشعارات حالياً يا بطل! 🔥</p>');
        
        const b1 = document.getElementById('notif-badge');
        const b2 = document.getElementById('notif-badge-admin');
        if(b1) { b1.classList.add('hidden'); b1.innerText = "0"; }
        if(b2) { b2.classList.add('hidden'); b2.innerText = "0"; }
    } catch(e) { 
        console.error("Notif Error:", e);
        list.innerHTML = '<p style="color:red; text-align:center;">خطأ في تحميل البيانات</p>'; 
    }
}

async function clearNotifications() {
    const snap = await db.collection('notifications').where('targetPhone', '==', currentUser.phone.toString().trim()).get();
    const batch = db.batch();
    snap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    Swal.close();
    Swal.fire({ toast:true, position:'top-end', icon:'success', title:'تم تنظيف الجرس 🧹', timer:1500 });
}

// تعديل دالة الاستماع لتظهر النقطة الحمراء
function listenForCustomNotifications() {
    if (!currentUser || !currentUser.phone) return;
    const start = Date.now();
    db.collection('notifications').where('targetPhone', '==', currentUser.phone.toString().trim()).onSnapshot(snap => {
        snap.docChanges().forEach(c => {
            if(c.type === 'added'){ 
                const d = c.doc.data(); 
                if((d.ts || 0) > start - 10000) { 
                    Swal.fire({ toast:true, position:'top-end', title:d.title, text:d.message, icon:'info', timer:4000 }); 
                    const b1 = document.getElementById('notif-badge');
                    const b2 = document.getElementById('notif-badge-admin');
                    if(b1) { b1.classList.remove('hidden'); b1.innerText = parseInt(b1.innerText || "0") + 1; }
                    if(b2) { b2.classList.remove('hidden'); b2.innerText = parseInt(b2.innerText || "0") + 1; }
                } 
            }
        });
        
        // إظهار العلامة لو فيه إشعارات قديمة أصلاً في البداية
        if(!snap.empty) {
            const b1 = document.getElementById('notif-badge');
            const b2 = document.getElementById('notif-badge-admin');
            if(b1) { b1.classList.remove('hidden'); b1.innerText = snap.size; }
            if(b2) { b2.classList.remove('hidden'); b2.innerText = snap.size; }
        }
    });
}

// تحويل لـ DOMContentLoaded عشان يفتح أسرع بكتير من window.onload
document.addEventListener('DOMContentLoaded', async () => {
    const savedPhone = localStorage.getItem('fire_gym_phone');
    if(savedPhone) {
        try {
            const snap = await db.collection('users').doc(savedPhone).get();
            if(snap.exists) {
                const data = snap.data();
                if(data.status === 'approved' || data.role === 'admin') enterApp(data);
                else localStorage.removeItem('fire_gym_phone');
            } else { localStorage.removeItem('fire_gym_phone'); }
        } catch(e) { console.error("Auto Login Error:", e); }
    }
});

// --- SHARE CARD LOGIC ---
function openShareCard(workoutName) {
    const name = currentUser ? currentUser.name : "بطل فير جيم";
    const photo = (currentUser && currentUser.photo) ? currentUser.photo : "https://via.placeholder.com/150";
    
    // تخصيص اسم التمرين
    const workout = workoutName || "التمرين";
    document.getElementById('share-workout-text').innerHTML = `خلصت تمرينة <span style="color:var(--primary); font-weight:900;">${workout}</span> النهاردة<br>مع Fire Gym`;
    
    // جمل تشجيعية عشوائية
    const phrases = ["استمر يا دبابة 🦍", "استمر يا وحش 🦁", "عااااش يا جامد 🔥", "وحش اللعبة 👑", "فورمة الساحل جاية 🌊", "البطل الحقيقي 💪"];
    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
    document.getElementById('share-random-phrase').innerText = randomPhrase;

    document.getElementById('share-user-name').innerText = name;
    document.getElementById('share-user-img').src = photo;
    document.getElementById('share-card-overlay').style.display = 'flex';
}

function closeShareCard() {
    document.getElementById('share-card-overlay').style.display = 'none';
}

async function downloadShareCard() {
    const card = document.getElementById('share-card');
    const btn = event.target;
    btn.innerText = "جاري التحضير... ⏳";
    btn.disabled = true;

    try {
        const canvas = await html2canvas(card, {
            scale: 2, // تقليل الحجم شوية عشان الأبلكيشن يقبله
            backgroundColor: '#000',
            useCORS: true,
            logging: false
        });
        
        canvas.toBlob(async (blob) => {
            if (!blob) throw new Error("Canvas to Blob failed");
            
            const file = new File([blob], `FireGym_Workout_${new Date().getTime()}.png`, { type: 'image/png' });

            // استخدام خاصية المشاركة لو متاحة (أفضل بكتير للموبايل)
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'تمرينة Fire Gym 🔥',
                        text: 'عاش يا بطل! دي تمرينة النهاردة من تطبيق Fire Gym'
                    });
                } catch (err) {
                    // لو المستخدم كنسل المشاركة أو حصل خطأ بسيط
                    console.log("Share cancelled or failed:", err);
                    // نحاول نحملها بالطريقة العادية كـ fallback
                    saveBlobAsFile(blob);
                }
            } else {
                // الطريقة العادية للديسك توب أو الموبايلات القديمة
                saveBlobAsFile(blob);
            }
        }, 'image/png');

    } catch (e) {
        console.error(e);
        Swal.fire('خطأ', 'فشل في توليد الصورة، جرب تاخد سكرين شوت 📸', 'error');
    } finally {
        btn.innerText = "حفظ الصورة 📥";
        btn.disabled = false;
    }
}

function saveBlobAsFile(blob) {
    const reader = new FileReader();
    reader.onloadend = function() {
        const base64data = reader.result;
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        if (isMobile) {
            const viewer = document.getElementById('full-screen-viewer');
            const img = document.getElementById('viewer-img');
            const loadingText = document.getElementById('viewer-loading-text');
            const dlBtn = document.getElementById('direct-download-btn');

            if (viewer && img) {
                img.src = base64data;
                if(loadingText) loadingText.style.display = 'none';
                viewer.style.display = 'flex';

                // ضبط زرار التحميل المباشر
                if(dlBtn) {
                    dlBtn.onclick = () => {
                        const link = document.createElement('a');
                        link.href = base64data;
                        link.download = `FireGym_Workout_${new Date().getTime()}.png`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    };
                }

                Swal.close();
                closeShareCard();
            } else {
                window.open(base64data, '_blank');
            }
        } else {
            const link = document.createElement('a');
            link.href = base64data;
            link.download = `FireGym_Workout_${new Date().getTime()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            Swal.fire({ icon: 'success', title: 'تم الحفظ! 📸', background: '#121212', color: '#fff' });
        }
    };
    reader.readAsDataURL(blob);
}

function closeFullViewer() {
    document.getElementById('full-screen-viewer').style.display = 'none';
}

async function requestGoalChange() {
    const { value: goal } = await Swal.fire({
        title: 'طلب تغيير النظام 🚀',
        input: 'select',
        inputOptions: {
            'نظام تدريب فقط': 'نظام تدريب فقط 🏋️‍♂️',
            'نظام تغذيه فقط': 'نظام تغذيه فقط 🥗',
            'نظام تدريب + تغذيه': 'نظام تدريب + تغذيه 🔄',
            'نظام VIP الملكي': 'نظام VIP الملكي ⭐'
        },
        inputPlaceholder: 'اختر النظام الجديد...',
        showCancelButton: true,
        confirmButtonText: 'إرسال الطلب ✅',
        cancelButtonText: 'إلغاء',
        background: '#121212',
        color: '#fff'
    });

    if (goal) {
        Swal.fire({ title: 'جاري إرسال طلبك...', didOpen: () => Swal.showLoading() });
        try {
            await db.collection('goalChanges').add({
                userPhone: currentUser.phone,
                userName: currentUser.name,
                newGoal: goal,
                ts: Date.now()
            });
            sendNotificationTo(ADMIN_PHONE, "طلب تغيير نظام! 🚀", `البطل ${currentUser.name} عايز يغير نظامه لـ ${goal}`);
            Swal.fire('تم الإرسال! 🔥', 'طلبك وصل للكابتن وهيتم مراجعته وتغيير النظام قريباً.', 'success');
        } catch (e) { Swal.fire('خطأ', 'فشل إرسال الطلب', 'error'); }
    }
}

async function editMyInfo() {
    const { value: f } = await Swal.fire({
        title: 'تعديل بياناتي الحيوية ✏️',
        background: '#121212',
        color: '#fff',
        confirmButtonColor: 'var(--accent)',
        confirmButtonText: 'حفظ التعديلات ✅',
        cancelButtonText: 'إلغاء',
        showCancelButton: true,
        html: `
            <div style="text-align:right; display:flex; flex-direction:column; gap:15px; padding:10px;">
                <div>
                    <label style="color:#aaa; font-size:12px;">السن:</label>
                    <input id="sw-age" type="number" class="swal2-input" style="width:90%; margin:5px 0; background:#000; color:#fff; border:1px solid #333;" value="${currentUser.age || ''}">
                </div>
                <div>
                    <label style="color:#aaa; font-size:12px;">الوزن (كغم):</label>
                    <input id="sw-weight" type="number" class="swal2-input" style="width:90%; margin:5px 0; background:#000; color:#fff; border:1px solid #333;" value="${currentUser.weight || ''}">
                </div>
                <div>
                    <label style="color:#aaa; font-size:12px;">الطول (سم):</label>
                    <input id="sw-height" type="number" class="swal2-input" style="width:90%; margin:5px 0; background:#000; color:#fff; border:1px solid #333;" value="${currentUser.height || ''}">
                </div>
                <div>
                    <label style="color:#aaa; font-size:12px;">نسبة الدهون (%):</label>
                    <input id="sw-fat" type="number" class="swal2-input" style="width:90%; margin:5px 0; background:#000; color:#fff; border:1px solid #333;" value="${currentUser.fat || ''}">
                </div>
            </div>
        `,
        preConfirm: () => {
            return {
                age: document.getElementById('sw-age').value,
                weight: document.getElementById('sw-weight').value,
                height: document.getElementById('sw-height').value,
                fat: document.getElementById('sw-fat').value
            }
        }
    });

    if (f) {
        Swal.fire({ title: 'جاري الحفظ...', didOpen: () => Swal.showLoading() });
        try {
            await db.collection('users').doc(currentUser.phone).update(f);
            Swal.fire({ icon: 'success', title: 'تم التحديث! 🔥', timer: 1500 });
        } catch (e) {
            Swal.fire('خطأ', 'فشل تحديث البيانات', 'error');
        }
    }
}

async function forceUpdate() {
    Swal.fire({
        title: 'جاري التحديث الشامل...',
        text: 'بنمحى الكاش وبنجيبلك أحدث نسخة من السيرفر 🔥',
        background: '#121212',
        color: '#fff',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // حفظ بيانات الدخول قبل المسح
        const phone = localStorage.getItem('fire_gym_phone');
        
        // 1. مسح الكاش
        if ('caches' in window) {
            const keys = await caches.keys();
            for (let key of keys) await caches.delete(key);
        }

        // 2. إلغاء السيرفس وركر
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (let reg of regs) await reg.unregister();
        }

        // 3. مسح التخزين المؤقت فقط (مع الحفاظ على الدخول)
        sessionStorage.clear();
        
        // إعادة بيانات الدخول
        if(phone) localStorage.setItem('fire_gym_phone', phone);

        // 4. ريفريش سريع
        window.location.reload();
    } catch (e) {
        window.location.reload();
    }
}

async function uploadMePhoto(el) {
    const file = el.files[0];
    if(!file) return;
    
    Swal.fire({ 
        title: 'جاري معالجة الصورة... 📸', 
        text: 'بنسرع عملية الرفع شوية',
        allowOutsideClick: false, 
        didOpen: () => Swal.showLoading() 
    });
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            const maxDim = 500;
            let w = img.width;
            let h = img.height;
            if (w > h) {
                if (w > maxDim) { h *= maxDim / w; w = maxDim; }
            } else {
                if (h > maxDim) { w *= maxDim / h; h = maxDim; }
            }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            
            const b64 = canvas.toDataURL('image/jpeg', 0.7);
            
            try {
                await db.collection('users').doc(currentUser.phone).update({ photo: b64 });
                const mePhoto = document.getElementById('me-photo');
                if(mePhoto) mePhoto.src = b64;
                Swal.fire({ icon: 'success', title: 'عاش يا بطل! 🔥', text: 'صورتك اتحدثت بنجاح', timer: 2000 });
            } catch (err) {
                console.error("Upload failed:", err);
                Swal.fire('خطأ', 'فشل في حفظ الصورة، جرب صورة تانية', 'error');
            }
        };
        img.src = e.target.result;
    };
    reader.onerror = () => Swal.fire('خطأ', 'فشل قراءة الملف', 'error');
    reader.readAsDataURL(file);
}

// --- REAL-TIME CHAT SYSTEM ---

function openChat(phone) {
    if(!currentUser) return;
    
    // الغرفة دائماً هي رقم تليفون العضو، سواء اللي فاتح هو الأدمن أو العضو نفسه
    currentChatUser = phone || (currentUser.role === 'admin' ? null : currentUser.phone);
    
    if(!currentChatUser && currentUser.role === 'admin') {
        return Swal.fire('تنبيه', 'برجاء اختيار بطل للدردشة معه من قائمة الأبطال', 'info');
    }

    document.getElementById('chat-modal').classList.remove('hidden');
    document.getElementById('chat-messages').innerHTML = '<p style="text-align:center; color:#555;">جاري فتح المحادثة... 🔄</p>';
    
    // تحديث عنوان الشات للأدمن
    if(currentUser.role === 'admin') {
        const u = allUsersData.find(usr => usr.phone === currentChatUser);
        document.getElementById('chat-title').innerText = `💬 الدردشة مع ${u ? u.name : currentChatUser}`;
    } else {
        document.getElementById('chat-title').innerText = `💬 الدردشة مع الكابتن`;
    }

    updateAllChatBadges();
    listenToChat(currentChatUser);
}

function listenToChat(phone) {
    if(chatUnsub) chatUnsub();
    
    console.log("Listening to chat room:", phone);

    chatUnsub = db.collection('chats')
        .where('uPhone', '==', phone)
        .onSnapshot(snap => {
            const container = document.getElementById('chat-messages');
            let messages = [];
            snap.forEach(doc => {
                messages.push({ id: doc.id, ...doc.data() });
            });
            
            messages.sort((a, b) => a.ts - b.ts);

            let h = "";
            messages.forEach(d => {
                const isMe = d.sender === currentUser.phone;
                h += `
                    <div style="align-self: ${isMe ? 'flex-end' : 'flex-start'}; max-width: 85%;">
                        <div style="background: ${isMe ? 'var(--primary)' : '#222'}; color: #fff; padding: 12px 18px; border-radius: 20px; border-bottom-${isMe ? 'right' : 'left'}-radius: 2px; font-size: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.2);">
                            ${d.msg}
                        </div>
                        <small style="color: #444; font-size: 9px; margin-top: 4px; display: block; text-align: ${isMe ? 'right' : 'left'};">
                            ${new Date(d.ts).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'})}
                        </small>
                    </div>
                `;
            });
            container.innerHTML = h || '<p style="text-align:center; color:#333; margin-top:50px;">ابدأ المحادثة الآن! 👋</p>';
            container.scrollTop = container.scrollHeight;
        }, err => {
            console.error("Chat Error:", err);
        });
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if(!msg || !currentChatUser) return;
    
    const senderPhone = currentUser.phone;
    const roomPhone = currentChatUser; // دي دايماً رقم العضو

    input.value = "";
    await db.collection('chats').add({
        uPhone: roomPhone,
        sender: senderPhone,
        msg: msg,
        ts: Date.now()
    });
    
    // إرسال تنبيه للطرف التاني
    const notifyTarget = (currentUser.role === 'admin') ? roomPhone : ADMIN_PHONE;
    sendNotificationTo(notifyTarget, "رسالة جديدة 💬", `${currentUser.name}: ${msg.substring(0,20)}...`);
}

function closeChat() {
    if(chatUnsub) chatUnsub();
    document.getElementById('chat-modal').classList.add('hidden');
    updateAllChatBadges();
}

// إضافة حدث Enter للإرسال
document.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' && !document.getElementById('chat-modal').classList.contains('hidden')) {
        const input = document.getElementById('chat-input');
        if(document.activeElement === input) sendMessage();
    }
});

// نهاية الملف - تم تنظيف التكرارات لضمان استقرار الشات

// --- ELITE FEATURES: LEADERBOARD & BADGES ---

async function openLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    const list = document.getElementById('full-leaderboard-list');
    if(!modal || !list) return;

    modal.classList.remove('hidden');
    list.innerHTML = '<p style="text-align:center; color:#555; padding:20px;">جاري تجهيز قائمة العمالقة... 🏆</p>';

    try {
        const snap = await db.collection('evaluations').orderBy('ts', 'desc').limit(100).get();
        let userScores = {};

        snap.forEach(doc => {
            const d = doc.data();
            if(!userScores[d.uPhone]) {
                userScores[d.uPhone] = { scores: [], phone: d.uPhone };
            }
            userScores[d.uPhone].scores.push(d.score);
        });

        let leaderboard = [];
        for (let phone in userScores) {
            const avg = userScores[phone].scores.reduce((a, b) => a + b, 0) / userScores[phone].scores.length;
            leaderboard.push({ phone, avg: parseFloat(avg.toFixed(1)) });
        }

        leaderboard.sort((a, b) => b.avg - a.avg);

        const topPlayers = leaderboard.slice(0, 10);
        let html = "";
        
        for (let i = 0; i < topPlayers.length; i++) {
            const entry = topPlayers[i];
            const userSnap = await db.collection('users').doc(entry.phone).get();
            const userData = userSnap.data();
            const userName = userData ? userData.name : "بطل مشترك";
            
            let medal = i === 0 ? "🥇" : (i === 1 ? "🥈" : (i === 2 ? "🥉" : `#${i+1}`));
            let bgColor = i < 3 ? 'rgba(255,179,0,0.05)' : 'transparent';
            let borderColor = i < 3 ? 'var(--accent)' : '#222';

            html += `
                <div style="display:flex; align-items:center; gap:15px; background:${bgColor}; padding:15px; border-radius:20px; margin-bottom:12px; border:1px solid ${borderColor};">
                    <div style="width:45px; height:45px; background:#000; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:900; color:var(--accent); font-size:20px; border:2px solid ${borderColor};">${medal}</div>
                    <div style="flex:1;">
                        <b style="color:#fff; display:block; font-size:15px;">${userName}</b>
                        <div style="width:100%; height:6px; background:#111; border-radius:3px; margin-top:8px; border:1px solid #222;">
                            <div style="width:${(entry.avg/10)*100}%; height:100%; background:linear-gradient(90deg, var(--primary), #ff3b30); border-radius:3px;"></div>
                        </div>
                    </div>
                    <div style="text-align:center; min-width:50px;">
                        <b style="color:var(--primary); font-size:22px; display:block;">${entry.avg}</b>
                        <small style="display:block; font-size:9px; color:#555; text-transform:uppercase;">Score</small>
                    </div>
                </div>
            `;
        }

        list.innerHTML = html || '<p style="text-align:center; color:#555;">لا يوجد تقييمات كافية بعد 📭</p>';
        
    } catch(e) {
        console.error("Leaderboard Error:", e);
        list.innerHTML = '<p style="text-align:center; color:red;">فشل جلب البيانات ❌</p>';
    }
}

async function updateMiniLeaderboard(top3) {
    const mini = document.getElementById('mini-leaderboard');
    if(!mini) return;
    
    let html = "";
    for(let i=0; i<top3.length; i++) {
        const entry = top3[i];
        const userSnap = await db.collection('users').doc(entry.phone).get();
        const userData = userSnap.data();
        const firstName = userData ? userData.name.split(' ')[0] : "بطل";
        
        html += `
            <div style="flex-shrink:0; width:100px; text-align:center; background:rgba(255,255,255,0.02); padding:15px 10px; border-radius:20px; border:1px solid #222; position:relative;">
                ${i<3 ? `<span style="position:absolute; top:-5px; right:-5px; font-size:14px;">${i===0?'🥇':i===1?'🥈':'🥉'}</span>` : ''}
                <div style="width:50px; height:50px; background:linear-gradient(135deg,#222,#000); border-radius:50%; margin:0 auto 10px; display:flex; align-items:center; justify-content:center; font-size:24px; border:1px solid ${i===0?'var(--accent)':'#333'};">👤</div>
                <b style="color:#fff; font-size:12px; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:4px;">${firstName}</b>
                <div style="background:rgba(229,57,53,0.1); color:var(--primary); font-size:11px; font-weight:900; border-radius:10px; padding:2px 0;">⭐ ${entry.avg}</div>
            </div>
        `;
    }
    mini.innerHTML = html || '<p style="color:#444; font-size:10px; width:100%; text-align:center;">في انتظار الأبطال... 🏆</p>';
}

function renderBadges() {
    const container = document.getElementById('user-badges');
    if(!container || !currentUser) return;

    let badges = [];
    
    // 1. وسام ملك الالتزام
    if(currentUser.lastScore >= 9) {
        badges.push({ icon: '👑', name: 'ملك الالتزام', color: '#ffb300', desc: 'تقييمك الأخير ممتاز (9/10 أو أكتر)' });
    }

    // 2. وسام بطل المياه
    const water = parseInt(localStorage.getItem('w_count') || "0");
    if(water >= 8) {
        badges.push({ icon: '💧', name: 'منبع الطاقة', color: '#2196f3', desc: 'شربت أكتر من 8 أكواب مية النهاردة' });
    }

    // 3. وسام العضوية الذهبية (لو حسابه مفعل)
    if(currentUser.status === 'approved') {
        badges.push({ icon: '🏅', name: 'عضو ذهبي', color: '#4caf50', desc: 'حسابك مفعل بالكامل في Fire Gym' });
    }

    // 4. وسام الـ VIP
    if(currentUser.goal && currentUser.goal.includes('VIP')) {
        badges.push({ icon: '⭐', name: 'VIP Elite', color: 'var(--accent)', desc: 'أنت مشترك في أقوى نظام لدينا' });
    }

    if(badges.length === 0) {
        container.innerHTML = '<p style="color:#555; font-size:11px;">كمل تمارينك عشان تفتح أوسمة جديدة! 🔥</p>';
        return;
    }

    container.innerHTML = badges.map(b => `
        <div onclick="Swal.fire({title:'${b.name}', text:'${b.desc}', iconHtml:'${b.icon}', background:'#1a1a1a', color:'#fff', confirmButtonColor: '${b.color}'})" 
             style="background:rgba(255,255,255,0.03); border:1px solid ${b.color}44; padding:15px 10px; border-radius:18px; text-align:center; width:90px; cursor:pointer; transition:0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'; this.style.transform='translateY(-5px)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'; this.style.transform='translateY(0)'">
            <span style="font-size:30px; display:block; margin-bottom:8px;">${b.icon}</span>
            <b style="font-size:10px; color:#fff; display:block; line-height:1.2;">${b.name}</b>
        </div>
    `).join('');
}

// تشغيل الميزات عند التحميل
setTimeout(() => {
    if(typeof currentUser !== 'undefined' && currentUser) {
        renderBadges();
        // جلب بيانات اللوحة الصغيرة تلقائياً
        db.collection('evaluations').orderBy('ts', 'desc').limit(20).get().then(snap => {
            let scores = {};
            snap.forEach(d => {
                const data = d.data();
                if(!scores[data.uPhone]) scores[data.uPhone] = { s: [], p: data.uPhone };
                scores[data.uPhone].s.push(data.score);
            });
            let top3 = Object.values(scores)
                .map(v => ({ phone: v.p, avg: parseFloat((v.s.reduce((a,b)=>a+b,0)/v.s.length).toFixed(1)) }))
                .sort((a,b)=>b.avg-a.avg)
                .slice(0,3);
            updateMiniLeaderboard(top3);
        }).catch(err => console.log("Mini Leaderboard Silent Fail (Safe)"));
    }
}, 3000);

// --- END OF ELITE FEATURES ---

// --- MACRO CALCULATOR LOGIC ---
let currentMacroGoal = 'cut';

function openMacroCalculator() {
    document.getElementById('macro-modal').classList.remove('hidden');
    // تعبئة البيانات تلقائياً إذا كانت موجودة في حساب المستخدم
    if(currentUser) {
        if(currentUser.age) document.getElementById('macro-age').value = currentUser.age;
    }
}

function setMacroGoal(goal, btn) {
    currentMacroGoal = goal;
    document.querySelectorAll('.macro-goal-btn').forEach(b => {
        b.style.background = '#222';
        b.style.color = '#777';
    });
    btn.style.background = '#2e7d32';
    btn.style.color = '#fff';
}

function calculateMacros() {
    const age = parseInt(document.getElementById('macro-age').value);
    const weight = parseFloat(currentUser.weight);
    const height = parseFloat(currentUser.height);
    const gender = document.getElementById('macro-gender').value;
    const activity = parseFloat(document.getElementById('macro-activity').value);

    if(!age || !weight || !height) {
        return Swal.fire('بيانات ناقصة', 'تأكد من إدخال عمرك ووزنك وطولك في حسابك أولاً', 'warning');
    }

    // حساب BMR (Mifflin-St Jeor Equation)
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    if(gender === 'male') bmr += 5;
    else bmr -= 161;

    // حساب TDEE (السعرات الكلية)
    let tdee = Math.round(bmr * activity);

    // تعديل السعرات حسب الهدف
    let finalCalories = tdee;
    if(currentMacroGoal === 'cut') finalCalories -= 500;
    else if(currentMacroGoal === 'bulk') finalCalories += 500;

    // حساب الماكروز (تقسيم رياضي متوازن)
    // بروتين: 2.2 جرام لكل كيلو وزن
    // دهون: 0.8 جرام لكل كيلو وزن
    // الباقي كربوهيدرات
    let protein = Math.round(weight * 2.2);
    let fats = Math.round(weight * 0.8);
    let proteinCals = protein * 4;
    let fatCals = fats * 9;
    let carbs = Math.round((finalCalories - (proteinCals + fatCals)) / 4);

    if(carbs < 50) carbs = 50; // حد أدنى للكربوهيدرات

    // عرض النتائج
    document.getElementById('result-calories').innerText = finalCalories;
    document.getElementById('result-protein').innerText = protein + "g";
    document.getElementById('result-carbs').innerText = carbs + "g";
    document.getElementById('result-fats').innerText = fats + "g";

    document.getElementById('macro-form').classList.add('hidden');
    document.getElementById('macro-result').classList.remove('hidden');
    
    // حفظ في قاعدة البيانات لسهولة الرجوع إليها
    db.collection('users').doc(currentUser.phone).update({
        dailyCalories: finalCalories,
        macros: { protein, carbs, fats }
    }).catch(e => console.log("Silent update fail"));
}

// --- END OF MACRO CALCULATOR ---

// --- PAMPERING FEATURES: MOTIVATION & CONFETTI ---

const MOTIVATION_QUOTES = [
    "الوحوش مش بتعرف المستحيل.. ابدأ تمرينك! 🔥",
    "عرق اليوم هو راحة الغد.. كمل يا بطل! 💪",
    "جسمك هو المكان الوحيد اللي هتعيش فيه، اهتم بيه. 🏋️‍♂️",
    "مش لازم تكون عظيم عشان تبدأ، بس لازم تبدأ عشان تكون عظيم. 🥇",
    "أصعب مجموعة هي اللي بتعمل الفرق.. اضغط على نفسك! ⚡",
    "النتيجة بتيجي بالاستمرار مش بالسرعة. 🐢🐰",
    "كل وجبة صحية هي استثمار في صحتك. 🥗",
    "أنت أقوى مما تعتقد.. أثبت لنفسك ده النهاردة! ⚔️"
];

function renderMotivationQuote() {
    const textEl = document.getElementById('motivation-text');
    if(!textEl) return;
    const randomQuote = MOTIVATION_QUOTES[Math.floor(Math.random() * MOTIVATION_QUOTES.length)];
    textEl.innerText = `"${randomQuote}"`;
}

function fireConfetti() {
    const duration = 2000;
    const end = Date.now() + duration;
    
    const colors = ['#e53935', '#ffb300', '#4caf50', '#2196f3', '#ffffff'];

    (function frame() {
        const confetti = document.createElement('div');
        confetti.innerText = ['🎉', '🔥', '💪', '🏆', '🥇', '✨'][Math.floor(Math.random() * 6)];
        confetti.style.position = 'fixed';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.top = '-5vh';
        confetti.style.fontSize = Math.random() * 20 + 20 + 'px';
        confetti.style.zIndex = '999999';
        confetti.style.pointerEvents = 'none';
        confetti.style.transition = 'transform 2s linear, opacity 2s';
        
        document.body.appendChild(confetti);

        setTimeout(() => {
            confetti.style.transform = `translate(${(Math.random() - 0.5) * 200}px, 110vh) rotate(${Math.random() * 360}deg)`;
            confetti.style.opacity = '0';
        }, 10);

        setTimeout(() => confetti.remove(), 2500);

        if (Date.now() < end) {
            requestAnimationFrame(frame);
        }
    }());
}

// تحديث renderBadges لاستخدام الاحتفال
const originalRenderBadges = renderBadges;
renderBadges = function() {
    originalRenderBadges();
    const badgeElements = document.querySelectorAll('#user-badges div');
    badgeElements.forEach(el => {
        const oldOnclick = el.onclick;
        el.onclick = function() {
            fireConfetti();
            if(oldOnclick) oldOnclick.apply(this);
        };
    });
};

// تشغيل الميزات
setTimeout(() => {
    renderMotivationQuote();
}, 2000);

// --- END OF PAMPERING ---
// --- EXERCISE VIDEO LIBRARY LOGIC ---

function openExerciseVideo(title, url) {
    const modal = document.getElementById('exercise-video-modal');
    const titleEl = document.getElementById('video-title');
    const container = document.getElementById('video-container');
    
    if(!modal || !container) return;

    titleEl.innerText = title + " 🎬";
    
    // التحقق إذا كان الرابط فيديو مباشر (MP4) أو يوتيوب
    if(url.endsWith('.mp4')) {
        container.innerHTML = `<video width="100%" height="100%" controls autoplay style="object-fit:cover;">
            <source src="${url}" type="video/mp4">
            متصفحك لا يدعم تشغيل الفيديو.
        </video>`;
    } else {
        // تحويل روابط يوتيوب العادية لروابط Embed لتعمل داخل التطبيق
        let embedUrl = url;
        if(url.includes('youtube.com/watch?v=')) {
            embedUrl = url.replace('watch?v=', 'embed/');
        } else if(url.includes('youtu.be/')) {
            embedUrl = url.replace('youtu.be/', 'youtube.com/embed/');
        }
        container.innerHTML = `<iframe width="100%" height="100%" src="${embedUrl}?autoplay=1&mute=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    }
    
    modal.classList.remove('hidden');
}

function closeExerciseVideo() {
    const modal = document.getElementById('exercise-video-modal');
    const container = document.getElementById('video-container');
    if(container) container.innerHTML = ""; // إيقاف الفيديو
    if(modal) modal.classList.add('hidden');
}

// --- END OF VIDEO LIBRARY ---

// --- SMART EXERCISE VIDEO MAPPING ---
const SMART_EX_VIDEOS = {
    'بنج': 'https://www.youtube.com/embed/rT7Dg0nne2E',
    'فراشة': 'https://www.youtube.com/embed/Z57CtZtp0_w',
    'تجميع': 'https://www.youtube.com/embed/vthMCtgVtFw',
    'بار': 'https://www.youtube.com/embed/rT7Dg0nne2E',
    'سكوات': 'https://www.youtube.com/embed/gcNh17Ckjgg',
    'رجل': 'https://www.youtube.com/embed/gcNh17Ckjgg',
    'بطن': 'https://www.youtube.com/embed/2pLT-olgUJs',
    'ظهر': 'https://www.youtube.com/embed/mG6y606idHM',
    'كتف': 'https://www.youtube.com/embed/HisaWv7f8S4',
    'باي': 'https://www.youtube.com/embed/ykJgrvx_ZAs',
    'تراي': 'https://www.youtube.com/embed/3vC6z08bW7o'
};

function getSmartVideo(name) {
    if(!name) return null;
    for (let key in SMART_EX_VIDEOS) {
        if (name.includes(key)) return SMART_EX_VIDEOS[key];
    }
    return null;
}
// --- END OF SMART MAPPING ---
