import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app-check.js";
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
const myAppointmentsNavLink = document.querySelector("#myAppointmentsNavLink");
const myAppointmentsSection = document.querySelector("#misTurnos");
const myAppointments = document.querySelector("#myAppointments");
const myAppointmentsStatus = document.querySelector("#myAppointmentsStatus");
const adminPanel = document.querySelector("#adminPanel");
const adminNavLink = document.querySelector("#adminNavLink");
const adminAppointments = document.querySelector("#adminAppointments");
const adminStatus = document.querySelector("#adminStatus");
const refreshAdminButton = document.querySelector("#refreshAdminButton");
const adminDateFilter = document.querySelector("#adminDateFilter");
const clearAdminFilterButton = document.querySelector("#clearAdminFilterButton");

const app = initializeApp(firebaseConfig);
const appCheckSiteKey = firebaseConfig.appCheckSiteKey;

if (appCheckSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true
  });
}

const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

let currentUser = null;
let isAdmin = false;
let occupiedTimes = new Set();
let adminAppointmentsCache = [];
let myAppointmentsCache = [];

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
    showStatus(getAuthErrorMessage(error), "error");
  }
});

logoutButton.addEventListener("click", async () => {
  await signOut(auth);
});

dateInput.addEventListener("change", loadAvailability);
refreshAdminButton.addEventListener("click", loadAdminAppointments);
adminDateFilter.addEventListener("change", renderFilteredAdminAppointments);
clearAdminFilterButton.addEventListener("click", () => {
  adminDateFilter.value = "";
  renderFilteredAdminAppointments();
});
adminAppointments.addEventListener("click", handleAdminAction);
myAppointments.addEventListener("click", handlePatientAction);

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  isAdmin = false;
  occupiedTimes = new Set();

  if (!user) {
    authStatus.textContent = "No iniciaste sesion.";
    loginButton.hidden = false;
    logoutButton.hidden = true;
    myAppointmentsNavLink.hidden = true;
    myAppointmentsSection.hidden = true;
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
  myAppointmentsNavLink.hidden = false;
  myAppointmentsSection.hidden = false;
  setFormEnabled(true);

  isAdmin = await checkAdmin(user.uid);
  adminPanel.hidden = !isAdmin;
  adminNavLink.hidden = !isAdmin;

  if (isAdmin) {
    await loadAdminAppointments();
  }

  await loadMyAppointments();
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
    aceptaPrivacidad: formData.get("privacyConsent") === "on",
    pacienteEmail: currentUser.email,
    pacienteUid: currentUser.uid
  };

  if (!appointment.nombre || !appointment.telefono || !appointment.fecha || !appointment.horario) {
    showStatus("Completa todos los campos para reservar el turno.", "error");
    return;
  }

  if (!appointment.aceptaPrivacidad) {
    showStatus("Para reservar, confirma que aceptas el uso de tus datos para gestionar el turno.", "error");
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

  if (hasPendingAppointment()) {
    showStatus("Ya tenes un turno pendiente. Para elegir otro, primero cancela o modifica el turno actual.", "error");
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

    batch.set(doc(db, "userTurnosPendientes", currentUser.uid), {
      turnoId: appointmentId,
      fecha: appointment.fecha,
      horario: appointment.horario,
      pacienteUid: currentUser.uid,
      creadoEn: serverTimestamp()
    });

    await batch.commit();

    form.reset();
    dateInput.min = today.toISOString().split("T")[0];
    occupiedTimes = new Set();
    updateTimeOptions();
    availabilityStatus.textContent = "Elegi una fecha para ver horarios disponibles.";
    showStatus("Turno reservado correctamente. Te esperamos.", "success");
    await loadMyAppointments();

    if (isAdmin) {
      await loadAdminAppointments();
    }
  } catch (error) {
    console.error("Error al reservar el turno:", error);
    showStatus(getFirestoreErrorMessage(error, "appointment"), "error");
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
    availabilityStatus.textContent = getFirestoreErrorMessage(error, "availability");
  } finally {
    timeSelect.disabled = false;
    submitButton.disabled = false;
  }
}

async function checkAdmin(uid) {
  if (!uid) {
    return false;
  }

  try {
    const adminSnapshot = await getDoc(doc(db, "admins", uid));
    return adminSnapshot.exists() && adminSnapshot.data().activo === true;
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
    adminAppointmentsCache = snapshot.docs
      .map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      }))
      .sort((a, b) => `${a.fecha} ${a.horario}`.localeCompare(`${b.fecha} ${b.horario}`));

    renderFilteredAdminAppointments();
  } catch (error) {
    console.error("Error al cargar turnos:", error);
    adminStatus.textContent = getFirestoreErrorMessage(error, "admin");
  }
}

async function loadMyAppointments() {
  if (!currentUser) {
    myAppointments.innerHTML = '<tr><td colspan="4">Inicia sesion para ver tus turnos.</td></tr>';
    myAppointmentsStatus.textContent = "";
    return;
  }

  myAppointmentsStatus.textContent = "Cargando tus turnos...";

  try {
    const myAppointmentsQuery = query(
      collection(db, "turnos"),
      where("pacienteUid", "==", currentUser.uid)
    );
    const snapshot = await getDocs(myAppointmentsQuery);

    myAppointmentsCache = snapshot.docs
      .map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      }))
      .sort((a, b) => `${a.fecha} ${a.horario}`.localeCompare(`${b.fecha} ${b.horario}`));

    renderMyAppointments();
    myAppointmentsStatus.textContent = `${myAppointmentsCache.length} turnos encontrados.`;
  } catch (error) {
    console.error("Error al cargar turnos del paciente:", error);
    myAppointmentsStatus.textContent = getFirestoreErrorMessage(error, "myAppointments");
  }
}

function renderMyAppointments() {
  if (!myAppointmentsCache.length) {
    myAppointments.innerHTML = '<tr><td colspan="4">Todavia no tenes turnos registrados.</td></tr>';
    return;
  }

  myAppointments.innerHTML = myAppointmentsCache.map((appointment) => `
    <tr>
      <td>${escapeHtml(appointment.fecha)}</td>
      <td>${escapeHtml(appointment.horario)}</td>
      <td><span class="status-badge status-${escapeHtml(appointment.estado)}">${getStatusLabel(appointment.estado)}</span></td>
      <td>
        <div class="table-actions">
          <button class="table-action" type="button" data-patient-action="modify" data-id="${escapeHtml(appointment.id)}" ${appointment.estado !== "pendiente" ? "disabled" : ""}>Modificar</button>
          <button class="table-action danger" type="button" data-patient-action="cancel" data-id="${escapeHtml(appointment.id)}" ${appointment.estado !== "pendiente" ? "disabled" : ""}>Cancelar</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderFilteredAdminAppointments() {
  const selectedDate = adminDateFilter.value;
  const appointments = selectedDate
    ? adminAppointmentsCache.filter((appointment) => appointment.fecha === selectedDate)
    : adminAppointmentsCache;

  renderAdminAppointments(appointments);
  adminStatus.textContent = selectedDate
    ? `${appointments.length} turnos para la fecha seleccionada.`
    : `${appointments.length} turnos cargados.`;
}

function renderAdminAppointments(appointments) {
  if (!appointments.length) {
    adminAppointments.innerHTML = '<tr><td colspan="6">No hay turnos para mostrar.</td></tr>';
    return;
  }

  adminAppointments.innerHTML = appointments.map((appointment) => `
    <tr>
      <td>${escapeHtml(appointment.fecha)}</td>
      <td>${escapeHtml(appointment.horario)}</td>
      <td>${escapeHtml(appointment.nombre)}</td>
      <td>${escapeHtml(appointment.telefono)}</td>
      <td><span class="status-badge status-${escapeHtml(appointment.estado)}">${getStatusLabel(appointment.estado)}</span></td>
      <td>
        <div class="table-actions">
          <button class="table-action" type="button" data-action="attended" data-id="${escapeHtml(appointment.id)}" ${appointment.estado === "atendido" || appointment.estado === "cancelado" ? "disabled" : ""}>Atendido</button>
          <button class="table-action danger" type="button" data-action="cancel" data-id="${escapeHtml(appointment.id)}" ${appointment.estado === "cancelado" || appointment.estado === "atendido" ? "disabled" : ""}>Cancelar</button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function handleAdminAction(event) {
  const button = event.target.closest("[data-action]");

  if (!button || !isAdmin) {
    return;
  }

  const appointmentId = button.dataset.id;
  const action = button.dataset.action;
  const appointment = adminAppointmentsCache.find((item) => item.id === appointmentId);

  if (!appointment) {
    adminStatus.textContent = "No se encontro el turno seleccionado.";
    return;
  }

  const actionLabel = action === "cancel" ? "cancelar" : "marcar como atendido";
  const confirmed = window.confirm(`Confirmar ${actionLabel} el turno de ${appointment.nombre} el ${appointment.fecha} a las ${appointment.horario}.`);

  if (!confirmed) {
    return;
  }

  adminStatus.textContent = "Actualizando turno...";
  setAdminActionsEnabled(false);

  try {
    const batch = writeBatch(db);
    const appointmentRef = doc(db, "turnos", appointmentId);

    if (action === "cancel") {
      batch.update(appointmentRef, {
        estado: "cancelado",
        actualizadoEn: serverTimestamp()
      });
      batch.delete(doc(db, "turnosOcupados", appointmentId));
      batch.delete(doc(db, "userTurnosPendientes", appointment.pacienteUid));
    } else {
      batch.update(appointmentRef, {
        estado: "atendido",
        actualizadoEn: serverTimestamp()
      });
    }

    await batch.commit();
    await loadAdminAppointments();

    if (dateInput.value === appointment.fecha) {
      await loadAvailability();
    }

    if (currentUser?.uid === appointment.pacienteUid) {
      await loadMyAppointments();
    }

    adminStatus.textContent = action === "cancel"
      ? "Turno cancelado y horario liberado."
      : "Turno marcado como atendido.";
  } catch (error) {
    console.error("Error al actualizar turno:", error);
    adminStatus.textContent = getFirestoreErrorMessage(error, "adminAction");
  } finally {
    setAdminActionsEnabled(true);
  }
}

async function handlePatientAction(event) {
  const button = event.target.closest("[data-patient-action]");

  if (!button || !currentUser) {
    return;
  }

  const appointmentId = button.dataset.id;
  const action = button.dataset.patientAction;
  const appointment = myAppointmentsCache.find((item) => item.id === appointmentId);

  if (!appointment || appointment.estado !== "pendiente") {
    myAppointmentsStatus.textContent = "Solo se pueden modificar o cancelar turnos pendientes.";
    return;
  }

  const confirmed = window.confirm(`Confirmar cancelacion del turno del ${appointment.fecha} a las ${appointment.horario}.`);

  if (!confirmed) {
    return;
  }

  myAppointmentsStatus.textContent = "Actualizando tu turno...";
  setPatientActionsEnabled(false);

  try {
    await cancelOwnAppointment(appointment);
    await loadMyAppointments();
    await loadAvailability();

    if (action === "modify") {
      fillFormForReschedule(appointment);
      showStatus("Tu turno anterior fue cancelado. Elegi una nueva fecha y horario para completar la modificacion.", "success");
      document.querySelector("#turnos").scrollIntoView({ behavior: "smooth" });
    }

    myAppointmentsStatus.textContent = action === "modify"
      ? "Turno anterior cancelado. Ahora podes elegir uno nuevo."
      : "Turno cancelado correctamente.";
  } catch (error) {
    console.error("Error al cancelar turno del paciente:", error);
    myAppointmentsStatus.textContent = getFirestoreErrorMessage(error, "patientAction");
  } finally {
    setPatientActionsEnabled(true);
  }
}

async function cancelOwnAppointment(appointment) {
  const batch = writeBatch(db);
  const pendingAppointmentRef = doc(db, "userTurnosPendientes", currentUser.uid);
  const pendingAppointmentSnapshot = await getDoc(pendingAppointmentRef);

  batch.update(doc(db, "turnos", appointment.id), {
    estado: "cancelado",
    actualizadoEn: serverTimestamp()
  });
  batch.delete(doc(db, "turnosOcupados", appointment.id));

  if (pendingAppointmentSnapshot.exists()) {
    batch.delete(pendingAppointmentRef);
  }

  await batch.commit();
}

function fillFormForReschedule(appointment) {
  document.querySelector("#patientName").value = appointment.nombre || "";
  document.querySelector("#patientPhone").value = appointment.telefono || "";
  document.querySelector("#privacyConsent").checked = appointment.aceptaPrivacidad === true;
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

function getStatusLabel(status) {
  const labels = {
    pendiente: "Pendiente",
    atendido: "Atendido",
    cancelado: "Cancelado"
  };

  return labels[status] || "Sin estado";
}

function hasPendingAppointment() {
  return myAppointmentsCache.some((appointment) => appointment.estado === "pendiente");
}

function setAdminActionsEnabled(isEnabled) {
  if (isEnabled) {
    return;
  }

  adminAppointments.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });
}

function setPatientActionsEnabled(isEnabled) {
  if (isEnabled) {
    return;
  }

  myAppointments.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });
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

function getAuthErrorMessage(error) {
  const messages = {
    "auth/popup-closed-by-user": "Se cerro la ventana de Google antes de completar el ingreso.",
    "auth/popup-blocked": "El navegador bloqueo la ventana de Google. Permiti ventanas emergentes para este sitio.",
    "auth/unauthorized-domain": "Este dominio no esta autorizado en Firebase Authentication."
  };

  return messages[error.code] || "No se pudo iniciar sesion. Intentalo nuevamente.";
}

function getFirestoreErrorMessage(error, context) {
  if (error.code === "permission-denied") {
    const messages = {
      appointment: "No se pudo reservar. El horario pudo haberse ocupado recien o la sesion necesita volver a validarse.",
      availability: "No se pudo mostrar la disponibilidad. Inicia sesion nuevamente o revisa la configuracion de App Check.",
      admin: "No tenes permisos administrativos para ver los turnos.",
      adminAction: "No tenes permisos para modificar este turno.",
      myAppointments: "No se pudieron cargar tus turnos. Volve a iniciar sesion.",
      patientAction: "No se pudo cancelar el turno. Verifica que siga pendiente."
    };

    return messages[context] || "No tenes permiso para realizar esta accion.";
  }

  if (error.code === "unavailable") {
    return "No hay conexion con Firebase en este momento. Proba de nuevo en unos minutos.";
  }

  if (context === "appointment") {
    return "No se pudo reservar. Recorda que solo podes tener un turno pendiente a la vez.";
  }

  return "Ocurrio un problema. Proba nuevamente.";
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
