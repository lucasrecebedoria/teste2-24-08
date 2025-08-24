import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence, createUserWithEmailAndPassword, signInWithEmailAndPassword, updatePassword, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, serverTimestamp, onSnapshot, query, where, orderBy } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref as sRef, uploadBytes } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { jsPDF } from "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.es.min.js";

// ======= Firebase Config (do usuário) =======
const firebaseConfig = {
  apiKey: "AIzaSyAxQliXm59BRg9zsVpK5qthB0nowqU0GEg",
  authDomain: "lancamentomanual-6cac4.firebaseapp.com",
  projectId: "lancamentomanual-6cac4",
  storageBucket: "lancamentomanual-6cac4.firebasestorage.app",
  messagingSenderId: "710102934933",
  appId: "1:710102934933:web:a5dc954d01d40518a5c29c",
  measurementId: "G-MLLXPXR7EC"
};

// init / singletons
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Admins pré-definidos
const ADMIN_MATS = new Set(["4144","70029","6266"]);

// Element helpers
const $ = (sel) => document.querySelector(sel);
const show = (el) => el.classList.remove("hidden");
const hide = (el) => el.classList.add("hidden");
const toast = (msg) => { const t = $("#toast"); t.textContent = msg; show(t); setTimeout(()=>hide(t), 3000); };

// Menu
$("#menuBtn").addEventListener("click", ()=> $("#menuPanel").classList.toggle("hidden"));
document.querySelectorAll("#menuPanel [data-target]").forEach(btn => {
  btn.addEventListener("click", () => {
    const id = btn.getAttribute("data-target");
    document.querySelectorAll("main section").forEach(s => hide(s));
    show($("#"+id));
  });
});

// Session persistence
setPersistence(auth, browserLocalPersistence);

// Map matricula to fake email for Firebase Auth
const matToEmail = (mat) => `${mat}@movebuss.local`;

// UI state
let currentUserData = null; // {matricula, nome, isAdmin}
let currentCaixa = null; // caixa session object

const updateHeaderForUser = () => {
  if(!currentUserData) return;
  const badge = $("#userRoleBadge");
  $("#userName").textContent = currentUserData.nome;
  $("#userMat").textContent = `Mat: ${currentUserData.matricula}`;
  badge.textContent = currentUserData.isAdmin ? "ADMIN" : "USUÁRIO";
  badge.style.background = currentUserData.isAdmin ? "linear-gradient(180deg,#f4e6b3,#9b7b2f)" : "linear-gradient(180deg,#8df0b3,#1faa59)";
  badge.style.color = currentUserData.isAdmin ? "#1a1a1a" : "#0b2f1a";
  show($("#userBadge"));
  show($("#btnChangePass"));
  show($("#btnLogout"));
};

// Auth actions
$("#btnRegister").addEventListener("click", async () => {
  const mat = $("#regMat").value.trim();
  const nome = $("#regName").value.trim();
  const pass = $("#regPass").value;
  if(!mat || !nome || pass.length < 6) { toast("Dados inválidos."); return; }
  const isAdmin = ADMIN_MATS.has(mat);
  try {
    const cred = await createUserWithEmailAndPassword(auth, matToEmail(mat), pass);
    await setDoc(doc(db, "users", cred.user.uid), { matricula: mat, nome, isAdmin });
    toast("Cadastro realizado. Faça login.");
    // redirect visual to login
    $("#loginMat").value = mat;
    $("#loginPass").focus();
  } catch (e) {
    console.error(e); toast(e.message);
  }
});

$("#btnLogin").addEventListener("click", async () => {
  const mat = $("#loginMat").value.trim();
  const pass = $("#loginPass").value;
  if(!mat || !pass) { toast("Informe matrícula e senha."); return; }
  try {
    const cred = await signInWithEmailAndPassword(auth, matToEmail(mat), pass);
    // fetch profile
    const uref = doc(db, "users", cred.user.uid);
    const snap = await getDoc(uref);
    const data = snap.exists() ? snap.data() : {matricula: mat, nome: "Usuário", isAdmin: ADMIN_MATS.has(mat)};
    currentUserData = data;
    // header
    updateHeaderForUser();
    // show painel
    hide($("#authSection"));
    show($("#painel"));
    $("#matRecebedor").value = data.matricula;
    setupRealtimeTable();
  } catch (e) {
    console.error(e); toast("Falha no login: " + e.message);
  }
});

$("#btnLogout").addEventListener("click", async () => {
  await signOut(auth);
  location.reload();
});

$("#btnChangePass").addEventListener("click", async () => {
  const nova = prompt("Nova senha (mínimo 6 caracteres):");
  if(nova && nova.length >= 6) {
    try { await updatePassword(auth.currentUser, nova); toast("Senha alterada."); } catch(e) { toast("Erro: "+e.message); }
  }
});

// Caixa state & controls
const setCaixaStatus = (aberto) => {
  const s = $("#statusCaixa");
  s.textContent = aberto ? "Caixa Aberto" : "Caixa Fechado";
  s.style.background = aberto
    ? "linear-gradient(180deg,#8df0b3,#1faa59)"
    : "linear-gradient(180deg,#f3b9b9,#b84a4a)";
  $("#btnAbrir").disabled = aberto;
  $("#btnFechar").disabled = !aberto;
  if (aberto) show($("#lancamentoCard")); else hide($("#lancamentoCard"));
};

$("#btnAbrir").addEventListener("click", async () => {
  if(!currentUserData) return;
  // Only one open caixa per matricula -> check Firestore for open
  const q = query(collection(db,"caixas"), where("matricula","==",currentUserData.matricula), where("status","==","aberto"));
  let alreadyOpen = false;
  await new Promise((resolve) => onSnapshot(q, (snap)=>{ alreadyOpen = !snap.empty; resolve(); }));
  if(alreadyOpen) { toast("Já existe um caixa aberto para sua matrícula."); return; }

  const docRef = await addDoc(collection(db,"caixas"), {
    matricula: currentUserData.matricula,
    nome: currentUserData.nome,
    isAdmin: currentUserData.isAdmin,
    status: "aberto",
    abertoEm: serverTimestamp()
  });
  currentCaixa = { id: docRef.id, total:0, sangriaTotal:0, lancamentos:[] };
  setCaixaStatus(true);
  toast("Caixa aberto.");
});

$("#btnFechar").addEventListener("click", async () => {
  if(!currentCaixa) { toast("Nenhum caixa aberto."); return; }
  // Finaliza e gera relatório A4
  await finalizarCaixaEGerarRelatorio();
  setCaixaStatus(false);
  currentCaixa = null;
});

// Valor automatico: quantidade x 5
$("#qtdBordos").addEventListener("input", () => {
  const qtd = parseInt($("#qtdBordos").value || "0", 10);
  $("#valor").value = (qtd * 5).toFixed(2);
});

// Prefixo: fixa 55 + 3 dígitos
$("#prefixo").addEventListener("input", () => {
  $("#prefixo").value = $("#prefixo").value.replace(/[^0-9]/g,'').slice(0,3);
});

// Data default hoje BR
const hojeISO = () => new Date().toISOString().slice(0,10);
$("#dataCaixa").value = hojeISO();

// Salvar lançamento
$("#btnSalvar").addEventListener("click", async () => {
  if(!currentCaixa) { toast("Abra o caixa primeiro."); return; }

  const entry = {
    tipoValidador: $("#tipoValidador").value,
    qtdBordos: parseInt($("#qtdBordos").value || "0", 10),
    valor: parseFloat($("#valor").value || "0"),
    prefixo: "55" + $("#prefixo").value.padStart(3,'0'),
    dataCaixa: $("#dataCaixa").value,
    matMotorista: $("#matMotorista").value.trim(),
    matRecebedor: $("#matRecebedor").value.trim(),
    createdAt: serverTimestamp()
  };
  try{
    const lancRef = await addDoc(collection(db,"caixas", currentCaixa.id, "lancamentos"), entry);
    // Update totals in memory
    currentCaixa.total = (currentCaixa.total || 0) + entry.valor;
    toast("Lançamento salvo.");
    // Imprimir recibo térmico
    gerarReciboThermal(entry);
    // Upload a cópia do recibo em PNG no Storage (PDF é suficiente, mas guardamos PDF)
    const pdfBlob = gerarReciboThermal(entry, true); // asBlob
    const r = sRef(storage, `recibos/${currentUserData.matricula}/${lancRef.id}.pdf`);
    await uploadBytes(r, pdfBlob);
  } catch(e) {
    console.error(e); toast("Erro ao salvar: " + e.message);
  }
});

// Realtime table for this user's open caixa
function setupRealtimeTable() {
  if(!currentUserData) return;
  const qOpen = query(collection(db,"caixas"), where("matricula","==", currentUserData.matricula), where("status","==","aberto"), orderBy("abertoEm","desc"));
  onSnapshot(qOpen, (snap) => {
    if (snap.empty) {
      $("#tabelaLanc").innerHTML = "<p class='text-gray-400'>Sem caixa aberto.</p>";
      currentCaixa = null; setCaixaStatus(false);
      return;
    }
    const cx = snap.docs[0];
    currentCaixa = { id: cx.id, ...cx.data() };
    setCaixaStatus(true);
    // Now listen lancamentos
    const qLan = query(collection(db,"caixas", currentCaixa.id, "lancamentos"), orderBy("createdAt","asc"));
    onSnapshot(qLan, (lsnap) => {
      let html = `<table class='min-w-full text-left'><thead><tr>
        <th class='px-2 py-1'>Hora</th><th class='px-2 py-1'>Validador</th><th class='px-2 py-1'>Bordos</th>
        <th class='px-2 py-1'>Prefixo</th><th class='px-2 py-1'>Valor</th><th class='px-2 py-1'>Motorista</th></tr></thead><tbody>`;
      let total = 0;
      lsnap.forEach(d => {
        const it = d.data();
        const when = it.createdAt?.toDate ? it.createdAt.toDate() : new Date();
        const hh = when.toLocaleTimeString('pt-BR');
        total += Number(it.valor||0);
        html += `<tr class='odd:bg-white/5'><td class='px-2 py-1'>${hh}</td><td class='px-2 py-1'>${it.tipoValidador}</td>
          <td class='px-2 py-1'>${it.qtdBordos}</td><td class='px-2 py-1'>${it.prefixo}</td>
          <td class='px-2 py-1'>R$ ${Number(it.valor).toFixed(2)}</td><td class='px-2 py-1'>${it.matMotorista}</td></tr>`;
      });
      html += `</tbody></table><div class='mt-3 font-semibold'>Total abastecimentos: R$ ${total.toFixed(2)}</div>`;
      $("#tabelaLanc").innerHTML = html;
      currentCaixa.total = total;
    });
  });
}

// Sangria (admin authorize via secondary app)
$("#btnSangria").addEventListener("click", async () => {
  if(!currentCaixa) { toast("Abra o caixa primeiro."); return; }
  const valor = parseFloat($("#sangriaValor").value || "0");
  const motivo = $("#sangriaMotivo").value.trim();
  const matA = $("#authAdminMat").value.trim();
  const passA = $("#authAdminPass").value;

  if(valor <= 0 || !motivo) { toast("Preencha valor e motivo."); return; }

  try {
    // use secondary app for admin auth
    const adminApp = initializeApp(firebaseConfig, "adminApp");
    const adminAuth = getAuth(adminApp);
    const adminCred = await signInWithEmailAndPassword(adminAuth, matToEmail(matA), passA);
    // check admin flag
    const adminSnap = await getDoc(doc(getFirestore(adminApp), "users", adminCred.user.uid));
    const isAdmin = adminSnap.exists() ? adminSnap.data().isAdmin : ADMIN_MATS.has(matA);
    if(!isAdmin) { toast("Matrícula não é admin."); return; }

    await addDoc(collection(db, "caixas", currentCaixa.id, "sangrias"), {
      valor, motivo, autorizadoPor: matA, createdAt: serverTimestamp()
    });
    currentCaixa.sangriaTotal = (currentCaixa.sangriaTotal || 0) + valor;
    toast("Sangria registrada.");
  } catch(e) { console.error(e); toast("Falha na autorização da sangria."); }
});

// ===== Printing helpers =====
function gerarReciboThermal(entry, returnBlob=false) {
  const doc = new jsPDF({ unit: "mm", format: [80,144] });
  doc.setFontSize(12);
  doc.text("RECIBO DE PAGAMENTO MANUAL", 40, 10, { align: "center" });
  doc.setFontSize(10);
  let y = 22;
  const add = (label, val) => { doc.text(`${label} ${val}`, 6, y); y += 6; };
  add("Tipo de validador:", entry.tipoValidador);
  add("PREFIXO:", entry.prefixo);
  add("QUANTIDADE BORDOS:", String(entry.qtdBordos));
  add("VALOR: R$", Number(entry.valor).toFixed(2));
  add("MATRICULA MOTORISTA:", entry.matMotorista);
  add("MATRICULA RECEBEDOR:", entry.matRecebedor);
  const now = new Date();
  add("DATA RECEBIMENTO:", now.toLocaleString('pt-BR'));
  y += 10;
  doc.text("ASSINATURA RECEBEDOR:", 6, y); y += 10;
  doc.line(6, y, 74, y);
  if(returnBlob) {
    return doc.output("blob");
  } else {
    doc.save("recibo.pdf");
    return null;
  }
}

// Fechamento: gerar A4 e salvar no Storage
async function finalizarCaixaEGerarRelatorio() {
  // fetch lancamentos e sangrias
  const lansSnap = await new Promise((resolve) => {
    onSnapshot(query(collection(db,"caixas", currentCaixa.id, "lancamentos"), orderBy("createdAt","asc")),
      (snap)=>resolve(snap));
  });
  const sangSnap = await new Promise((resolve) => {
    onSnapshot(query(collection(db,"caixas", currentCaixa.id, "sangrias"), orderBy("createdAt","asc")),
      (snap)=>resolve(snap));
  });

  const lancs = lansSnap.docs.map(d => d.data());
  const sangs = sangSnap.docs.map(d => d.data());
  const totalAbast = lancs.reduce((s,it)=>s+Number(it.valor||0),0);
  const totalSang = sangs.reduce((s,it)=>s+Number(it.valor||0),0);
  const totalCorrigido = totalAbast - totalSang;

  // PDF A4
  const docPdf = new jsPDF({ unit:"mm", format:"a4" });
  docPdf.setFontSize(16);
  docPdf.text("Fechamento de Caixa", 105, 16, {align:"center"});
  docPdf.setFontSize(11);
  const head = `Matrícula: ${currentUserData.matricula} • Nome: ${currentUserData.nome}`;
  docPdf.text(head, 10, 26);
  docPdf.text(`Status: FECHADO • Data: ${new Date().toLocaleString('pt-BR')}`, 10, 33);

  let y = 44;
  docPdf.setFontSize(12);
  docPdf.text("Lançamentos", 10, y); y += 4;
  docPdf.setFontSize(9);
  docPdf.text("Hora    Validador  Bordos  Prefixo  Valor  Motorista", 10, y); y += 5;
  lancs.forEach(it => {
    const when = it.createdAt?.toDate ? it.createdAt.toDate() : new Date();
    const line = `${when.toLocaleTimeString('pt-BR')}   ${it.tipoValidador}        ${it.qtdBordos}      ${it.prefixo}   R$ ${Number(it.valor).toFixed(2)}   ${it.matMotorista}`;
    docPdf.text(line, 10, y); y += 5;
    if(y > 260) { docPdf.addPage(); y = 20; }
  });

  y += 4;
  docPdf.setFontSize(12);
  docPdf.text(`Total de abastecimentos: R$ ${totalAbast.toFixed(2)}`, 10, y); y += 6;
  docPdf.text("Sangrias", 10, y); y += 4;
  docPdf.setFontSize(9);
  if(sangs.length===0) { docPdf.text("— Nenhuma sangria —", 10, y); y+=5; }
  sangs.forEach(sg => {
    const when = sg.createdAt?.toDate ? sg.createdAt.toDate() : new Date();
    const line = `${when.toLocaleString('pt-BR')}  R$ ${Number(sg.valor).toFixed(2)}  Motivo: ${sg.motivo}  Admin: ${sg.autorizadoPor}`;
    docPdf.text(line, 10, y); y += 5;
    if(y > 280) { docPdf.addPage(); y=20; }
  });
  y += 6;
  docPdf.setFontSize(12);
  docPdf.text(`Total sangrado: R$ ${totalSang.toFixed(2)}`, 10, y); y+=6;
  docPdf.text(`Total corrigido (abastecimentos - sangrias): R$ ${totalCorrigido.toFixed(2)}`, 10, y);

  const fileName = `${currentUserData.matricula}-${new Date().toISOString().slice(0,10)}.pdf`;
  docPdf.save(fileName);

  // Upload PDF do relatório no Storage
  const blob = docPdf.output('blob');
  const ref = sRef(storage, `fechamentos/${currentUserData.matricula}/${fileName}`);
  await uploadBytes(ref, blob);

  // marca caixa como fechado
  await setDoc(doc(db,"caixas", currentCaixa.id), { status:"fechado", fechadoEm: serverTimestamp() }, { merge:true });

  toast("Caixa fechado e relatório baixado.");
}
