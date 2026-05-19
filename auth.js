/* ============================================================
   MORSE TRAINER — Firebase Auth & Data Sync
   ============================================================ */

// ──────────── FIREBASE CONFIG ────────────
// ⚠️ THAY CÁC GIÁ TRỊ NÀY BẰNG CONFIG CỦA BẠN TỪ Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyCTqelJ2R6VgC7vsrTqKsyqjrZFDr9XQgc",
    authDomain: "morse-pratice.firebaseapp.com",
    projectId: "morse-pratice",
    storageBucket: "morse-pratice.firebasestorage.app",
    messagingSenderId: "433238192700",
    appId: "1:433238192700:web:20dbc27173b5437a33c939"
};

// ──────────── INIT FIREBASE ────────────
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// ──────────── ERROR MESSAGES ────────────
const AUTH_ERRORS = {
    'auth/email-already-in-use': 'Email này đã được đăng ký.',
    'auth/invalid-email': 'Email không hợp lệ.',
    'auth/weak-password': 'Mật khẩu quá yếu (tối thiểu 6 ký tự).',
    'auth/user-not-found': 'Không tìm thấy tài khoản.',
    'auth/wrong-password': 'Sai mật khẩu. Vui lòng thử lại.',
    'auth/invalid-credential': 'Sai tên đăng nhập hoặc mật khẩu.',
    'auth/too-many-requests': 'Quá nhiều lần thử. Vui lòng đợi rồi thử lại.',
    'auth/network-request-failed': 'Lỗi mạng. Kiểm tra kết nối internet.',
    'username-taken': 'Tên đăng nhập đã tồn tại. Hãy chọn tên khác.',
    'username-not-found': 'Không tìm thấy tên đăng nhập này.',
};
function getAuthError(code) { return AUTH_ERRORS[code] || 'Đã xảy ra lỗi. Vui lòng thử lại.'; }

// ──────────── DOM HELPERS ────────────
function showAuthModal() { document.getElementById('auth-modal').classList.remove('hidden'); }
function hideAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
    clearAuthError();
}
function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg; el.classList.remove('hidden');
}
function clearAuthError() { document.getElementById('auth-error').classList.add('hidden'); }

// ──────────── REGISTER ────────────
// Register: username + email + password
async function handleRegister(e) {
    e.preventDefault();
    clearAuthError();
    const username = document.getElementById('auth-username').value.trim().toLowerCase();
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value;

    if (!username) { showAuthError('Vui lòng nhập tên đăng nhập.'); return; }
    if (username.length < 3) { showAuthError('Tên đăng nhập tối thiểu 3 ký tự.'); return; }
    if (username.length > 20) { showAuthError('Tên đăng nhập tối đa 20 ký tự.'); return; }
    if (!/^[a-z0-9_]+$/.test(username)) { showAuthError('Tên đăng nhập chỉ gồm chữ thường, số, dấu gạch dưới.'); return; }
    if (!email) { showAuthError('Vui lòng nhập email (dùng để khôi phục mật khẩu).'); return; }

    const btn = document.getElementById('auth-submit');
    btn.disabled = true; btn.textContent = 'Đang xử lý...';

    try {
        // Step 1: Create Firebase Auth account first
        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        await cred.user.updateProfile({ displayName: username });

        // Step 2: Save to Firestore (may fail if rules not set, but auth already works)
        try {
            await db.collection('users').doc(cred.user.uid).set({
                username: username,
                email: email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            await db.collection('usernames').doc(username).set({
                uid: cred.user.uid,
            });
        } catch (firestoreErr) {
            console.warn('Firestore save failed (check Firestore rules):', firestoreErr);
            // Auth still succeeded — user can login, data just won't sync yet
        }

        hideAuthModal();
    } catch (err) {
        console.error('Register error:', err.code, err.message);
        showAuthError(getAuthError(err.code));
    } finally {
        btn.disabled = false;
        btn.textContent = document.getElementById('auth-form').dataset.mode === 'register' ? 'Đăng ký' : 'Đăng nhập';
    }
}

// ──────────── LOGIN ────────────
// Login: username + password → lookup email from Firestore → signIn
async function handleLogin(e) {
    e.preventDefault();
    clearAuthError();
    const username = document.getElementById('auth-username').value.trim().toLowerCase();
    const pass = document.getElementById('auth-pass').value;

    if (!username) { showAuthError('Vui lòng nhập tên đăng nhập.'); return; }

    const btn = document.getElementById('auth-submit');
    btn.disabled = true; btn.textContent = 'Đang xử lý...';

    const LOGIN_FAIL_MSG = 'Sai mật khẩu hoặc tài khoản.';

    try {
        let email = null;

        // Try Firestore lookup first
        try {
            const usernameDoc = await db.collection('usernames').doc(username).get();
            if (usernameDoc.exists) {
                const uid = usernameDoc.data().uid;
                const userDoc = await db.collection('users').doc(uid).get();
                if (userDoc.exists) email = userDoc.data().email;
            }
        } catch (fsErr) {
            console.warn('Firestore lookup failed, trying email fallback:', fsErr);
        }

        // If Firestore lookup failed, try treating username as email directly
        // (fallback for users who registered but Firestore rules blocked the write)
        if (!email) {
            // Try username@morse.app as a constructed email, or the username itself if it looks like email
            email = username.includes('@') ? username : null;
        }

        if (!email) {
            showAuthError(LOGIN_FAIL_MSG);
            btn.disabled = false; btn.textContent = 'Đăng nhập';
            return;
        }

        await auth.signInWithEmailAndPassword(email, pass);
        hideAuthModal();
    } catch (err) {
        console.error('Login error:', err.code, err.message);
        showAuthError(LOGIN_FAIL_MSG);
    } finally {
        btn.disabled = false; btn.textContent = 'Đăng nhập';
    }
}

// ──────────── LOGOUT ────────────
async function handleLogout() {
    await syncDataToFirestore();
    await auth.signOut();
}

// ──────────── AUTH STATE OBSERVER ────────────
auth.onAuthStateChanged(user => {
    const userArea = document.getElementById('user-area');
    const loginBtn = document.getElementById('btn-login');
    const userName = document.getElementById('user-name');

    if (user) {
        loginBtn.classList.add('hidden');
        userArea.classList.remove('hidden');
        userName.textContent = user.displayName || user.email.split('@')[0];
        loadDataFromFirestore(user.uid);
    } else {
        loginBtn.classList.remove('hidden');
        userArea.classList.add('hidden');
        userName.textContent = '';
    }
});

// ──────────── FORM MODE TOGGLE ────────────
function setAuthMode(mode) {
    const form = document.getElementById('auth-form');
    const emailGroup = document.getElementById('auth-email-group');
    const submit = document.getElementById('auth-submit');
    const title = document.getElementById('auth-title');
    const toggle = document.getElementById('auth-toggle');

    form.dataset.mode = mode;
    clearAuthError();

    // Reset fields
    form.reset();

    if (mode === 'register') {
        emailGroup.classList.remove('hidden');
        submit.textContent = 'Đăng ký';
        title.textContent = 'Tạo tài khoản';
        toggle.innerHTML = 'Đã có tài khoản? <a href="#" id="auth-switch">Đăng nhập</a>';
    } else {
        emailGroup.classList.add('hidden');
        submit.textContent = 'Đăng nhập';
        title.textContent = 'Đăng nhập';
        toggle.innerHTML = 'Chưa có tài khoản? <a href="#" id="auth-switch">Đăng ký</a>';
    }

    document.getElementById('auth-switch').addEventListener('click', e => {
        e.preventDefault();
        setAuthMode(mode === 'register' ? 'login' : 'register');
    });
}

// ──────────── DATA SYNC: SAVE ────────────
async function syncDataToFirestore() {
    const user = auth.currentUser;
    if (!user) return;
    try {
        const data = {
            charStats: Analytics.charStats,
            errorTypes: Analytics.errorTypes,
            confusionPairs: Analytics.confusionPairs,
            listenStats: Analytics.listenStats,
            listenConfusions: Analytics.listenConfusions,
            typingScore: typeof state !== 'undefined' ? { correct: state.correct, total: state.total } : null,
            listenScore: typeof state !== 'undefined' ? { correct: state.listenCorrect, total: state.listenTotal } : null,
            abbrScore: typeof abbrState !== 'undefined' ? { correct: abbrState.correct, total: abbrState.total } : null,
            lastSyncAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
        await db.collection('users').doc(user.uid).collection('practiceData').doc('current').set(data, { merge: true });
    } catch (err) { console.warn('Sync failed:', err); }
}

// ──────────── DATA SYNC: LOAD ────────────
async function loadDataFromFirestore(uid) {
    try {
        const doc = await db.collection('users').doc(uid).collection('practiceData').doc('current').get();
        if (!doc.exists) return;
        const data = doc.data();
        if (data.charStats) Object.assign(Analytics.charStats, data.charStats);
        if (data.errorTypes) Object.assign(Analytics.errorTypes, data.errorTypes);
        if (data.confusionPairs) Object.assign(Analytics.confusionPairs, data.confusionPairs);
        if (data.listenStats) Object.assign(Analytics.listenStats, data.listenStats);
        if (data.listenConfusions) Object.assign(Analytics.listenConfusions, data.listenConfusions);
        if (data.typingScore && typeof state !== 'undefined') {
            state.correct = data.typingScore.correct || 0;
            state.total = data.typingScore.total || 0;
            if (typeof updateTypingScore === 'function') updateTypingScore();
        }
        if (data.listenScore && typeof state !== 'undefined') {
            state.listenCorrect = data.listenScore.correct || 0;
            state.listenTotal = data.listenScore.total || 0;
            if (typeof updateListenScore === 'function') updateListenScore();
        }
        if (data.abbrScore && typeof abbrState !== 'undefined') {
            abbrState.correct = data.abbrScore.correct || 0;
            abbrState.total = data.abbrScore.total || 0;
            if (typeof updateAbbrScore === 'function') updateAbbrScore();
        }
        if (typeof saveAnalytics === 'function') saveAnalytics();
    } catch (err) { console.warn('Load failed:', err); }
}

// ──────────── AUTO-SAVE ────────────
let _autoSaveTimer = null;
function startAutoSave() {
    if (_autoSaveTimer) clearInterval(_autoSaveTimer);
    _autoSaveTimer = setInterval(() => {
        if (auth.currentUser) syncDataToFirestore();
    }, 60000);
}
window.addEventListener('beforeunload', () => {
    if (auth.currentUser) syncDataToFirestore();
});

// ──────────── INIT ────────────
function initAuth() {
    document.getElementById('btn-login').addEventListener('click', () => {
        setAuthMode('login');
        showAuthModal();
    });

    document.getElementById('auth-close').addEventListener('click', hideAuthModal);

    document.getElementById('auth-form').addEventListener('submit', e => {
        const mode = document.getElementById('auth-form').dataset.mode;
        if (mode === 'register') handleRegister(e);
        else handleLogin(e);
    });

    document.getElementById('btn-logout').addEventListener('click', handleLogout);

    document.getElementById('auth-switch')?.addEventListener('click', e => {
        e.preventDefault();
        setAuthMode('register');
    });

    document.getElementById('auth-modal').addEventListener('click', e => {
        if (e.target.id === 'auth-modal') hideAuthModal();
    });

    // Escape to close modal
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !document.getElementById('auth-modal').classList.contains('hidden')) {
            hideAuthModal();
        }
    });

    startAutoSave();
}
