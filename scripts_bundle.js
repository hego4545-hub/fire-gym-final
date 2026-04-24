// إعدادات Firebase الحقيقية والمستقرة
console.log("FIRE GYM SCRIPT INITIALIZING...");
window.onerror = function(m, u, l) { 
    const msg = "CRITICAL ERROR: " + m + "\nLine: " + l + "\nURL: " + u;
    alert(msg);
    console.error(msg);
};
alert("Script Start Check - If you see this, JS is loaded.");
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
    if(!n || !p || !pass) return Swal.fire('نقص بيانات', 'برجاء ملء كل الخانات يا بطل', 'warning');
    Swal.fire({ title: 'جاري إرسال طلبك...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    const data = { 
        name: n, phone: p, age: document.getElementById('reg-age').value, 
        height: document.getElementById('reg-height').value, weight: document.getElementById('reg-weight').value, 
        fat: document.getElementById('reg-fat').value, goal: document.getElementById('reg-goal').value, 
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
            document.getElementById('me-weight').innerText = (data.weight || '--') + ' كغم';
            document.getElementById('me-height').innerText = (data.height || '--') + ' سم';
            document.getElementById('me-fat').innerText = (data.fat || '0') + ' %';
            document.getElementById('me-goal-badge').innerText = (data.role === 'admin' ? '👑 كابتن الفريق' : (data.goal || 'بطل فير جيم'));
            if(data.photo) document.getElementById('me-photo').src = data.photo;
            const noteBox = document.getElementById('captain-notes-box');
            if(data.captainNotes) { noteBox.classList.remove('hidden'); document.getElementById('captain-notes-text').innerText = data.captainNotes; } 
            else { noteBox.classList.add('hidden'); }
            renderUserPlanTabs();
        }
    });

    renderTrackerGrid(); loadUserLogs(); checkWaterReset(); initSystemNotifications();
    if(u.role === 'admin') { 
        document.getElementById('admin-nav').classList.remove('hidden'); 
        document.getElementById('admin-info-menu-btn').classList.remove('hidden');
        document.getElementById('add-technique-btn').classList.remove('hidden'); loadAdmin(); 
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
    if(g.includes('VIP')) { document.getElementById('vip-toggle-container').classList.remove('hidden'); switchVipMode('workout'); if(extras) extras.classList.remove('hidden'); loadFoodPrefs(); loadRecipes(); } 
    else {
        document.getElementById('vip-toggle-container').classList.add('hidden');
        if(g.includes('تدريب')) html += PLAN_CATS.map(c => `<button class="sub-btn" style="background:#1a1a1a; color:var(--primary); font-size:12px;" onclick="viewCatPlan('${c}')">🏋️ ${c}</button>`).join('');
        if(g.includes('تغذيه')) { html += NUTRI_CATS.map(c => `<button class="sub-btn" style="background:#1a1a1a; color:#4caf50; font-size:12px;" onclick="viewCatPlan('${c}')">🥗 ${c}</button>`).join(''); if(extras) extras.classList.remove('hidden'); loadFoodPrefs(); loadRecipes(); }
    }
    container.innerHTML = html;
}

function switchVipMode(mode) {
    const container = document.getElementById('user-plan-tabs'); const btnW = document.getElementById('btn-show-workout'); const btnN = document.getElementById('btn-show-nutrition');
    const view = document.getElementById('user-plan-view');
    const timerBtn = document.getElementById('workout-timer-btn');

    // Toggle logic for the main tabs
    if((mode === 'workout' && btnW.style.background !== 'transparent' && !container.classList.contains('hidden')) || 
       (mode === 'nutrition' && btnN.style.background !== 'transparent' && !container.classList.contains('hidden'))) {
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

function viewCatPlan(cat) {
    const view = document.getElementById('user-plan-view');
    const timerBtn = document.getElementById('workout-timer-btn');
    
    // Explicit toggle check
    const isAlreadyOpen = view && !view.classList.contains('hidden') && lastViewedCat === cat;

    if(isAlreadyOpen) {
        if(view) view.classList.add('hidden');
        if(timerBtn) timerBtn.classList.add('hidden');
        if(NUTRI_CATS.includes(cat)) {
            const extras = document.getElementById('nutrition-extras');
            if(extras) extras.classList.remove('hidden');
        }
        lastViewedCat = "";
        return;
    }
    
    lastViewedCat = cat;
    const isNutri = NUTRI_CATS.includes(cat);
    if(view) view.classList.remove('hidden');
    if(timerBtn) {
        if(isNutri) timerBtn.classList.add('hidden');
        else timerBtn.classList.remove('hidden');
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
        let tableHtml = `<div style="background:rgba(255,179,0,0.05); border:1px solid rgba(255,179,0,0.2); border-radius:30px; padding:20px; margin-bottom:15px;"><h5 style="color:var(--accent); margin-bottom:15px;">🥗 البرنامج الغذائي: ${cat}</h5><div style="overflow-x:auto; border-radius:15px; border:1px solid #222;"><table style="width:100%; border-collapse:collapse; text-align:right;"><thead><tr style="background:#111; color:var(--accent); font-size:11px;"><th style="padding:15px; border:1px solid #222;">نوع الأكل</th><th style="padding:15px; border:1px solid #222;">التفاصيل</th><th style="padding:15px; border:1px solid #222;">الكمية</th></tr></thead><tbody>${exs.map(ex => `<tr style="border-bottom:1px solid #222;"><td style="padding:15px; color:#fff;">${ex.name}</td><td style="padding:15px; color:#aaa;">${ex.note || '---'}</td><td style="padding:15px; color:var(--accent);">${ex.weight || 'حسب الرغبة'}</td></tr>`).join('')}</tbody></table></div></div>`;
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
        <table style="width:100%; border-collapse:collapse; text-align:center; min-width:300px;">
            <thead>
                <tr style="color:#777; font-size:11px; background:#111;">
                    <th style="padding:12px; border:1px solid #222;">مج</th>
                    <th style="padding:12px; border:1px solid #222;">وزن</th>
                    <th style="padding:12px; border:1px solid #222;">عدة</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    const isAdmin = (currentUser.role === 'admin');
    for(let n=1; n<=6; n++) {
        html += `
            <tr style="border-bottom:1px solid #222;">
                <td style="padding:10px; color:var(--accent); font-weight:bold; background:#0a0a0a;">${n}</td>
                <td style="padding:10px;">
                    ${isAdmin ? `<input type="text" value="${ex['w'+n]||''}" onchange="updateExSet('${cat}', ${idx}, 'w${n}', this.value)" placeholder="-" style="width:100%; max-width:70px; padding:8px; background:#000; border:1px solid #333; color:var(--accent); text-align:center; border-radius:8px; font-size:14px;">` 
                    : `<span style="color:var(--accent); font-weight:bold;">${ex['w'+n]||'-'}</span>`}
                </td>
                <td style="padding:10px;">
                    ${isAdmin ? `<input type="text" value="${ex['r'+n]||''}" onchange="updateExSet('${cat}', ${idx}, 'r${n}', this.value)" placeholder="-" style="width:100%; max-width:70px; padding:8px; background:#000; border:1px solid #333; color:var(--success); text-align:center; border-radius:8px; font-size:14px;">`
                    : `<span style="color:var(--success); font-weight:bold;">${ex['r'+n]||'-'}</span>`}
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
        if(d.type === 'تمرين' && d.val && d.val.startsWith('[')) {
            try {
                let exs = JSON.parse(d.val);
                if(lastW && (lastW.ts?.seconds - d.ts?.seconds < 7200)) { 
                    lastW.exs = lastW.exs.concat(exs); return;
                }
                d.exs = exs; lastW = d;
            } catch(e){ d.exs = []; }
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
                }
                
                const dt_item = (typeof d.ts === 'number') ? new Date(d.ts) : (d.ts?.toDate() || new Date());
                const timeStr = dt_item.toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'});

                h += `
                    <div class="history-item">
                        <i class="del-btn" onclick="deleteLog('${d.id}', '${phone}', '${containerId}')">🗑️</i>
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
                        <div style="color:#eee; font-size:13px; line-height:1.6; background:rgba(0,0,0,0.2); padding:12px; border-radius:15px; border:1px solid rgba(255,255,255,0.02);">${valHtml}</div>
                    </div>`;
            });
            h += `</div></div>`;
        }
        h += `</div></div>`;
    }
    list.innerHTML = h || '<p style="text-align:center; padding:50px; color:#444;">مفيش نشاط مسجل لسه.. 🔥</p>';
}

function loadUserLogs() { fetchAndRenderLogs(currentUser.phone, 'user-history-list'); }
async function deleteLog(id, phone, containerId){ if(confirm('حذف؟')){ await db.collection('logs').doc(id).delete(); fetchAndRenderLogs(phone || currentUser.phone, containerId || 'user-history-list'); } }

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
    } else {
        const placeholder = currentLogType === 'وزن' ? "اكتب وزنك الحالي (كجم)..." : "اكتب التفاصيل...";
        area.innerHTML = `
            <input type="number" id="log-val" placeholder="${placeholder}" style="width:100%; padding:15px; background:#111; border:1px solid #333; border-radius:15px; color:#fff; margin-bottom:10px;">
            <textarea id="log-note" placeholder="ملاحظة إضافية..." style="width:100%; height:80px; padding:15px; background:#111; border:1px solid #333; color:#fff; border-radius:12px; margin-bottom:15px;"></textarea>
            <button class="btn-full" onclick="saveLog()">تأكيد وحفظ ✅</button>
        `;
    }
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
    const val = valOverride || document.getElementById('log-val')?.value || finalBase64;
    if(!val && currentLogType!=='وزن') return Swal.fire('نقص بيانات', 'برجاء كتابة البيانات أو رفع الصورة', 'warning');
    Swal.fire({ title: 'جاري الحفظ...', didOpen: () => Swal.showLoading() });
    await db.collection('logs').add({
        uName: currentUser.name, uPhone: currentUser.phone,
        type: currentLogType, sub: currentLogSub, val: val,
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
        h += `
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
    try { await db.collection('notifications').add({ targetPhone: p.toString().trim(), title: t, message: m, ts: Date.now() }); } catch(e){} 
}
function initSystemNotifications() { if (!("Notification" in window)) return; if (Notification.permission === "granted") listenForCustomNotifications(); else Notification.requestPermission().then(p => { if(p==="granted") listenForCustomNotifications(); }); }
// Deleted duplicate listenForCustomNotifications
function toggleMoreMenu() {
    const overlay = document.getElementById('more-menu-overlay');
    const content = document.getElementById('more-menu-content');
    if(overlay.classList.contains('hidden')) { overlay.classList.remove('hidden'); setTimeout(()=>content.style.bottom='90px', 10); } 
    else { content.style.bottom='-100%'; setTimeout(()=>overlay.classList.add('hidden'), 300); }
}

// --- EVALUATION & ADMIN ---
async function loadEvaluationData() {
    try {
        const snap = await db.collection('evaluations').where('uPhone', '==', currentUser.phone).get();
        let evals = []; snap.forEach(d => evals.push(d.data()));
        evals.sort((a,b) => (b.ts || 0) - (a.ts || 0));
        const lastEval = evals[0] || { score: 0, note: "في انتظار أول تقييم..." };
        document.getElementById('current-score-text').innerText = lastEval.score + " / 10";
        document.getElementById('coach-note-bubble').innerText = lastEval.note;
    } catch(e){}
}
async function submitEvaluation() {
    const s = document.getElementById('admin-eval-score').value; const n = document.getElementById('admin-eval-note').value;
    await db.collection('evaluations').add({ uPhone: activeTarget, score: parseInt(s), note: n, ts: Date.now() });
    sendNotificationTo(activeTarget, "تقييم جديد! 📈", `الكابتن قيم أداءك بـ ${s} من 10.. عاش!`);
    Swal.fire('تم التقييم 🔥', '', 'success');
}
async function loadAdmin() {
    const snap = await db.collection('users').orderBy('name').get(); allUsersData = [];
    snap.forEach(d => allUsersData.push({id: d.id, ...d.data()}));
    filterAdminUsers('all');
    const pSnap = await db.collection('users').where('status','==','pending').get(); let ph = "";
    pSnap.forEach(d => { const u = d.data(); ph += `<div class="card" style="display:flex; justify-content:space-between;"><b>${u.name}</b><div style="display:flex; gap:5px;"><button onclick="openProfile('${d.id}')">✍️</button><button onclick="approveUser('${d.id}')">✅</button></div></div>`; });
    document.getElementById('pending-users-list').innerHTML = ph || '<p style="text-align:center; color:#444;">لا طلبات</p>';
}
let currentAdminFilter = 'all';
function filterAdminUsers(goal = currentAdminFilter) {
    currentAdminFilter = goal;
    const searchVal = document.getElementById('admin-search-phone').value.trim();
    const list = document.getElementById('all-users-list'); 
    let filtered = allUsersData.filter(u => u.status === 'approved');
    
    if(goal !== 'all') filtered = filtered.filter(u => u.goal === goal);
    if(searchVal) filtered = filtered.filter(u => u.phone && u.phone.includes(searchVal));

    list.innerHTML = filtered.map(u => `<div style="margin-bottom:10px; display:flex; gap:10px;"><button class="track-btn" style="flex:1; background:#1a1a1a;" onclick="openProfile('${u.id}')"><b>${u.name}</b></button><button onclick="activeTarget='${u.id}'; viewSelectedUserLogs()" style="width:50px;">📜</button></div>`).join('');
}
async function openProfile(id) { 
    activeTarget = id; const d = await db.collection('users').doc(id).get(); const data = d.data();
    document.getElementById('prof-name').innerText = data.name; document.getElementById('admin-captain-notes').value = data.captainNotes || "";
    document.getElementById('profile-modal').classList.remove('hidden'); currentPlanData = data.workoutPlan || {};
    document.getElementById('admin-plan-cats-workout').innerHTML = PLAN_CATS.map(c => `<button class="sub-btn" onclick="editAdminPlan('${c}')">${c}</button>`).join('');
    document.getElementById('admin-plan-cats-nutri').innerHTML = NUTRI_CATS.map(c => `<button class="sub-btn" onclick="editAdminPlan('${c}')">${c}</button>`).join('');
}
function editAdminPlan(cat) { editingCat = cat; document.getElementById('admin-plan-editor').classList.remove('hidden'); const container = document.getElementById('admin-plan-rows'); container.innerHTML = ""; const exs = currentPlanData[cat] || []; exs.forEach(ex => addAdminPlanRow(ex)); if(exs.length===0) addAdminPlanRow(); }
function addAdminPlanRow(d = {}) {
    const container = document.getElementById('admin-plan-rows'); const card = document.createElement('div'); card.className = "plan-edit-card"; const isNutri = NUTRI_CATS.includes(editingCat);
    card.style = "background:#111; border:1px solid #333; border-radius:15px; padding:15px; margin-bottom:10px; position:relative;";
    if(isNutri) card.innerHTML = `<div onclick="this.parentElement.remove()" style="position:absolute; left:10px; color:#ff3b30;">🗑️</div><input type="text" value="${d.name||''}" class="p-name" placeholder="الصنف"><input type="text" value="${d.note||''}" class="p-note" placeholder="تفاصيل"><input type="text" value="${d.weight||''}" class="p-weight" placeholder="كمية">`;
    else card.innerHTML = `<div onclick="this.parentElement.remove()" style="position:absolute; left:10px; color:#ff3b30;">🗑️</div><input type="text" value="${d.name||''}" class="p-name" placeholder="اسم التمرين"><input type="number" value="${d.sets||4}" class="p-sets" style="width:60px;"> <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:5px;">${[1,2,3,4,5,6].map(n => `<div><input type="text" value="${d['w'+n]||''}" class="w${n}" placeholder="وزن"><input type="text" value="${d['r'+n]||''}" class="r${n}" placeholder="عدات"></div>`).join('')}</div>`;
    container.appendChild(card);
}

async function saveAdminPlan(ev) { if(ev) ev.preventDefault(); const targetId = activeTarget; let exs = []; document.querySelectorAll('.plan-edit-card').forEach(card => { const name = card.querySelector('.p-name').value.trim(); if(name) { const isNutri = NUTRI_CATS.includes(editingCat); let row = { name, done: false }; if(isNutri) { row.note = card.querySelector('.p-note').value; row.weight = card.querySelector('.p-weight').value; } else { row.sets = card.querySelector('.p-sets').value; for(let i=1; i<=6; i++) { row['w'+i] = card.querySelector('.w'+i).value; row['r'+i] = card.querySelector('.r'+i).value; } } exs.push(row); } }); currentPlanData[editingCat] = exs; await db.collection('users').doc(targetId).update({ workoutPlan: currentPlanData }); sendNotificationTo(targetId, "تحديث من الكابتن 🔥", `تم تعديل جدول ${editingCat}`); Swal.fire('تم الحفظ', '', 'success'); }

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
    Swal.fire('تم الحفظ وإرسال تنبيه ✅', '', 'success');
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
    if(confirm('هل أنت متأكد من حذف هذا البطل نهائياً؟ ⚠️')) {
        await db.collection('users').doc(id).delete();
        loadAdmin();
        Swal.fire('تم الحذف بنجاح', '', 'info');
    }
}

// --- OTHERS & KNOWLEDGE ---
function openInfoBank() { document.getElementById('info-bank-modal').classList.remove('hidden'); const content = document.getElementById('info-bank-content'); content.innerHTML = '<p style="text-align:center; color:#777;">جاري التحميل... 🔥</p>'; db.collection('knowledge').orderBy('ts', 'desc').get().then(snap => { let h = ""; snap.forEach(doc => { const d = doc.data(); h += `<div style="background:rgba(255,255,255,0.03); border:1px solid #222; padding:15px; border-radius:15px; margin-bottom:10px;"><b style="color:var(--accent);">💡 ${d.q}</b><p style="color:#eee; font-size:13px; line-height:1.6;">${d.a}</p></div>`; }); content.innerHTML = h || '<p style="text-align:center;">مفيش معلومات لسه.</p>'; }); }
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
                
                // مسح علامات الصح
                for(let c of PLAN_CATS) { if(currentPlanData[c]) currentPlanData[c].forEach(ex => ex.done = false); }
                await db.collection('users').doc(currentUser.phone).update({ workoutPlan: currentPlanData });
                
                workoutSeconds = 0; display.innerText = "00:00:00"; btn.style.background = "var(--accent)"; 
                if(lastViewedCat) viewCatPlan(lastViewedCat);
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
        if(confirm('حذف الوصفة نهائياً من الجميع؟')) { 
            await db.collection('recipes').doc(id).delete(); 
            loadRecipes(); 
        }
    } else {
        if(confirm('حذف هذه الوصفة من قائمتك؟')) {
            if(!currentUser.hiddenRecipes) currentUser.hiddenRecipes = [];
            currentUser.hiddenRecipes.push(id);
            await db.collection('users').doc(currentUser.phone).update({
                hiddenRecipes: firebase.firestore.FieldValue.arrayUnion(id)
            });
            loadRecipes();
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

// --- GOAL CHANGE REQUESTS (ADMIN) ---
async function approveGoalChange(id, newGoal) {
    await db.collection('users').doc(id).update({ goal: newGoal, pendingGoal: null });
    sendNotificationTo(id, "تم قبول طلبك! 🔥", `نظامك الجديد بقى: ${newGoal} .. بالتوفيق يا وحش!`);
    loadAdmin();
}

async function rejectGoalChange(id) {
    await db.collection('users').doc(id).update({ pendingGoal: null });
    sendNotificationTo(id, "طلب مرفوض 🚧", "للأسف الكابتن رفض طلب تغيير النظام حالياً، اسأله عن السبب.");
    loadAdmin();
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
    if(confirm('حذف؟')) { await db.collection('knowledge').doc(id).delete(); loadKnowledgeAdmin(); }
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
    if(confirm('حذف؟')) { await db.collection('techniques').doc(id).delete(); loadTechniques(); }
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
        
        const badge = document.getElementById('notif-badge');
        if(badge) { badge.classList.add('hidden'); badge.innerText = "0"; }
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
                    const badge = document.getElementById('notif-badge');
                    if(badge) {
                        badge.classList.remove('hidden');
                        badge.innerText = parseInt(badge.innerText || "0") + 1;
                    }
                } 
            }
        });
    });
}

window.onload = async () => {
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
};

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
            if (viewer && img) {
                img.src = base64data;
                viewer.style.display = 'flex';
                // إغلاق أي مودال مفتوح
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
