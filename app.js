import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  where
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const form = document.querySelector("#appointmentForm");
const statusMessage = document.querySelector("#formStatus");
const submitButton = document.querySelector("#submitButton");
const dateInput = document.querySelector("#appointmentDate");

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const appointmentsCollection = collection(db, "turnos");

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
    const isTaken = await appointmentExists(appointment.fecha, appointment.horario);

    if (isTaken) {
      showStatus("Ese horario ya esta reservado. Elegi otro turno.", "error");
      return;
    }

    await addDoc(appointmentsCollection, {
      ...appointment,
      estado: "pendiente",
      creadoEn: serverTimestamp()
    });

    form.reset();
    dateInput.min = today.toISOString().split("T")[0];
    showStatus("Turno reservado correctamente. Te esperamos.", "success");
  } catch (error) {
    console.error("Error al reservar el turno:", error);
    showStatus("No se pudo guardar el turno. Revisa la configuracion de Firebase.", "error");
  } finally {
    setLoading(false);
  }
});

async function appointmentExists(fecha, horario) {
  const appointmentQuery = query(
    appointmentsCollection,
    where("fecha", "==", fecha),
    where("horario", "==", horario)
  );
  const querySnapshot = await getDocs(appointmentQuery);

  return !querySnapshot.empty;
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
