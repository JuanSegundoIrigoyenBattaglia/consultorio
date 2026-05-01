import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  doc,
  getFirestore,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const form = document.querySelector("#appointmentForm");
const statusMessage = document.querySelector("#formStatus");
const submitButton = document.querySelector("#submitButton");
const dateInput = document.querySelector("#appointmentDate");

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const today = new Date();
today.setHours(0, 0, 0, 0);
dateInput.min = today.toISOString().split("T")[0];

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();

  const formData = new FormData(form);
  const appointment = {
    nombre: formData.get("patientName").trim(),
    telefono: formData.get("patientPhone").trim(),
    fecha: formData.get("appointmentDate"),
    horario: formData.get("appointmentTime")
  };

  if (!appointment.nombre || !appointment.telefono || !appointment.fecha || !appointment.horario) {
    showStatus("Completa todos los campos para reservar el turno.", "error");
    return;
  }

  if (new Date(`${appointment.fecha}T00:00:00`) < today) {
    showStatus("La fecha del turno no puede ser anterior a hoy.", "error");
    return;
  }

  setLoading(true);

  try {
    const appointmentId = `${appointment.fecha}_${appointment.horario}`;
    const appointmentRef = doc(db, "turnos", appointmentId);

    await setDoc(appointmentRef, {
      ...appointment,
      estado: "pendiente",
      creadoEn: serverTimestamp()
    });

    form.reset();
    dateInput.min = today.toISOString().split("T")[0];
    showStatus("Turno reservado correctamente. Te esperamos.", "success");
  } catch (error) {
    console.error("Error al reservar el turno:", error);
    showStatus("Ese horario ya esta reservado o no se pudo guardar el turno.", "error");
  } finally {
    setLoading(false);
  }
});


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
