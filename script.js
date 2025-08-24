// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAxQliXm59BRg9zsVpK5qthB0nowqU0GEg",
  authDomain: "lancamentomanual-6cac4.firebaseapp.com",
  projectId: "lancamentomanual-6cac4",
  storageBucket: "lancamentomanual-6cac4.firebasestorage.app",
  messagingSenderId: "710102934933",
  appId: "1:710102934933:web:a5dc954d01d40518a5c29c",
  measurementId: "G-MLLXPXR7EC"
};
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// Admins fixos
const ADMINS = ["4144", "70029", "6266"];

// Registro
const registerForm = document.getElementById("registerForm");
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const matricula = document.getElementById("regMatricula").value;
    const nome = document.getElementById("regNome").value;
    const senha = document.getElementById("regSenha").value;

    try {
      const userCred = await auth.createUserWithEmailAndPassword(matricula + "@fake.com", senha);
      await db.collection("users").doc(userCred.user.uid).set({
        matricula,
        nome,
        admin: ADMINS.includes(matricula)
      });
      alert("Conta criada! Faça login.");
      window.location.href = "login.html";
    } catch (err) {
      alert("Erro: " + err.message);
    }
  });
}

// Login
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const matricula = document.getElementById("loginMatricula").value;
    const senha = document.getElementById("loginSenha").value;
    try {
      await auth.signInWithEmailAndPassword(matricula + "@fake.com", senha);
      window.location.href = "index.html";
    } catch (err) {
      alert("Erro: " + err.message);
    }
  });
}

// Painel principal
if (window.location.pathname.endsWith("index.html")) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    const snap = await db.collection("users").doc(user.uid).get();
    const data = snap.data();
    const infoDiv = document.getElementById("user-info");
    if (data) {
      infoDiv.innerHTML = `<div>
        <div>${data.nome} (${data.matricula})</div>
        <span class="badge ${data.admin ? "badge-gold" : "badge-green"}">${data.admin ? "Admin" : "Usuário"}</span>
      </div>`;
      document.getElementById("matriculaRecebedor").value = data.matricula;
    }
  });

  // Logout
  const btnLogout = document.getElementById("btnLogout");
  btnLogout.addEventListener("click", async () => {
    await auth.signOut();
    window.location.href = "login.html";
  });

  // Form lancamento
  const bordosInput = document.getElementById("bordos");
  const valorInput = document.getElementById("valor");
  if (bordosInput) {
    bordosInput.addEventListener("input", () => {
      const qtd = parseInt(bordosInput.value) || 0;
      valorInput.value = (qtd * 5).toFixed(2);
    });
  }
}
