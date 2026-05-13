import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const form = document.querySelector("#appointmentForm");
const statusMessage = document.querySelector("#formStatus");
const submitButton = document.querySelector("#submitButton");
const dateInput = document.querySelector("#appointmentDate");
const timeSelect = document.querySelector("#appointmentTime");
const availabilityStatus = document.querySelector("#availabilityStatus");
const loginButton = document.querySelector("#loginButton");
const logoutButton = document.querySelector("#logoutButton");
const authStatus = document.querySelector("#authStatus");
const adminPanel = document.querySelector("#adminPanel");
const adminNavLink = document.querySelector("#adminNavLink");
const adminAppointments = document.querySelector("#adminAppointments");
const adminStatus = document.querySelector("#adminStatus");
const refreshAdminButton = document.querySelector("#refreshAdminButton");

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

let currentUser = null;
let isAdmin = false;
let occupiedTimes = new Set();

const today = new Date();
today.setHours(0, 0, 0, 0);
dateInput.min = today.toISOString().split("T")[0];

setFormEnabled(false);

loginButton.addEventListener("click", async () => {
  clearStatus();

  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Error al iniciar sesion:", error);
    showStatus("No se pudo iniciar sesion con Google.", "error");
  }
});

logoutButton.addEventListener("click", async () => {
  await signOut(auth);
});

dateInput.addEventListener("change", loadAvailability);
refreshAdminButton.addEventListener("click", loadAdminAppointments);

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  isAdmin = false;
  occupiedTimes = new Set();

  if (!user) {
    authStatus.textContent = "No iniciaste sesion.";
    loginButton.hidden = false;
    logoutButton.hidden = true;
    adminPanel.hidden = true;
    adminNavLink.hidden = true;
    setFormEnabled(false);
    updateTimeOptions();
    availabilityStatus.textContent = "Inicia sesion y elegi una fecha para ver horarios.";
    return;
  }

  authStatus.textContent = `Sesion iniciada como ${user.email}`;
  loginButton.hidden = true;
  logoutButton.hidden = false;
  setFormEnabled(true);

  isAdmin = await checkAdmin(user.email);
  adminPanel.hidden = !isAdmin;
  adminNavLink.hidden = !isAdmin;

  if (isAdmin) {
    await loadAdminAppointments();
  }

  await loadAvailability();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();

  if (!currentUser) {
    showStatus("Inicia sesion con Google para reservar un turno.", "error");
    return;
  }

  const formData = new FormData(form);
  const appointment = {
    nombre: formData.get("patientName").trim(),
    telefono: formData.get("patientPhone").trim(),
    fecha: formData.get("appointmentDate"),
    horario: formData.get("appointmentTime"),
    pacienteEmail: currentUser.email,
    pacienteUid: currentUser.uid
  };

  if (!appointment.nombre || !appointment.telefono || !appointment.fecha || !appointment.horario) {
    showStatus("Completa todos los campos para reservar el turno.", "error");
    return;
  }

  if (new Date(`${appointment.fecha}T00:00:00`) < today) {
    showStatus("La fecha del turno no puede ser anterior a hoy.", "error");
    return;
  }

  if (occupiedTimes.has(appointment.horario)) {
    showStatus("Ese horario ya esta reservado. Elegi otro turno.", "error");
    return;
  }

  setLoading(true);

  try {
    const appointmentId = `${appointment.fecha}_${appointment.horario}`;
    const batch = writeBatch(db);

    batch.set(doc(db, "turnosOcupados", appointmentId), {
      fecha: appointment.fecha,
      horario: appointment.horario,
      creadoEn: serverTimestamp()
    });

    batch.set(doc(db, "turnos", appointmentId), {
      ...appointment,
      estado: "pendiente",
      creadoEn: serverTimestamp()
    });

    await batch.commit();

    form.reset();
    dateInput.min = today.toISOString().split("T")[0];
    occupiedTimes = new Set();
    updateTimeOptions();
    availabilityStatus.textContent = "Elegi una fecha para ver horarios disponibles.";
    showStatus("Turno reservado correctamente. Te esperamos.", "success");

    if (isAdmin) {
      await loadAdminAppointments();
    }
  } catch (error) {
    console.error("Error al reservar el turno:", error);
    showStatus("Ese horario ya esta reservado o no se pudo guardar el turno.", "error");
    await loadAvailability();
  } finally {
    setLoading(false);
  }
});

async function loadAvailability() {
  occupiedTimes = new Set();
  updateTimeOptions();

  if (!currentUser) {
    return;
  }

  const selectedDate = dateInput.value;

  if (!selectedDate) {
    availabilityStatus.textContent = "Elegi una fecha para ver horarios disponibles.";
    return;
  }

  timeSelect.disabled = true;
  submitButton.disabled = true;
  availabilityStatus.textContent = "Consultando horarios...";

  try {
    const availabilityQuery = query(
      collection(db, "turnosOcupados"),
      where("fecha", "==", selectedDate)
    );
    const snapshot = await getDocs(availabilityQuery);

    snapshot.forEach((documentSnapshot) => {
      occupiedTimes.add(documentSnapshot.data().horario);
    });

    updateTimeOptions();

    const availableCount = getAvailableTimeCount();
    availabilityStatus.textContent = availableCount
      ? `${availableCount} horarios disponibles para esa fecha.`
      : "No quedan horarios disponibles para esa fecha.";
  } catch (error) {
    console.error("Error al consultar disponibilidad:", error);
    availabilityStatus.textContent = "No se pudo consultar la disponibilidad.";
  } finally {
    timeSelect.disabled = false;
    submitButton.disabled = false;
  }
}

async function checkAdmin(email) {
  if (!email) {
    return false;
  }

  try {
    const adminSnapshot = await getDoc(doc(db, "admins", email));
    return adminSnapshot.exists();
  } catch (error) {
    console.error("Error al verificar administrador:", error);
    return false;
  }
}

async function loadAdminAppointments() {
  if (!isAdmin) {
    return;
  }

  adminStatus.textContent = "Cargando turnos...";

  try {
    const snapshot = await getDocs(collection(db, "turnos"));
    const appointments = snapshot.docs
      .map((documentSnapshot) => documentSnapshot.data())
      .sort((a, b) => `${a.fecha} ${a.horario}`.localeCompare(`${b.fecha} ${b.horario}`));

    renderAdminAppointments(appointments);
    adminStatus.textContent = `${appointments.length} turnos cargados.`;
  } catch (error) {
    console.error("Error al cargar turnos:", error);
    adminStatus.textContent = "No se pudieron cargar los turnos.";
  }
}

function renderAdminAppointments(appointments) {
  if (!appointments.length) {
    adminAppointments.innerHTML = '<tr><td colspan="5">Todavia no hay turnos cargados.</td></tr>';
    return;
  }

  adminAppointments.innerHTML = appointments.map((appointment) => `
    <tr>
      <td>${escapeHtml(appointment.fecha)}</td>
      <td>${escapeHtml(appointment.horario)}</td>
      <td>${escapeHtml(appointment.nombre)}</td>
      <td>${escapeHtml(appointment.telefono)}</td>
      <td>${escapeHtml(appointment.estado)}</td>
    </tr>
  `).join("");
}

function updateTimeOptions() {
  [...timeSelect.options].forEach((option) => {
    if (!option.value) {
      return;
    }

    const isOccupied = occupiedTimes.has(option.value);
    option.disabled = isOccupied;
    option.textContent = isOccupied ? `${option.value} - No disponible` : option.value;
  });
}

function getAvailableTimeCount() {
  return [...timeSelect.options].filter((option) => option.value && !option.disabled).length;
}

function setFormEnabled(isEnabled) {
  form.querySelectorAll("input, select, button").forEach((element) => {
    element.disabled = !isEnabled;
  });
  submitButton.disabled = !isEnabled;
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Guardando..." : "Confirmar turno";
}

function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `form-status is-${type}`;
}

function clearStatus() {
  statusMessage.textContent = "";
  statusMessage.className = "form-status";
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
