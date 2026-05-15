# Pagina de turnos odontologicos

Proyecto simple en HTML, CSS y JavaScript para reservar turnos de un consultorio odontologico usando Firebase Firestore.

## Archivos

- `index.html`: estructura de la pagina.
- `styles.css`: estilos visuales y responsive.
- `app.js`: logica del formulario y guardado en Firestore.
- `firebase-config.js`: credenciales reales de Firebase.
- `firebase-config.example.js`: ejemplo para conservar como referencia.
- `functions/`: Cloud Functions opcionales para enviar confirmaciones por email o WhatsApp.

## Configurar Firebase

1. Crea un proyecto en Firebase.
2. Crea una app web dentro del proyecto.
3. Copia la configuracion que te entrega Firebase.
4. Reemplaza los valores de `firebase-config.js`.
5. Activa Authentication.
6. En Authentication > Sign-in method, habilita Google.
7. En Authentication > Settings > Authorized domains, agrega el dominio de Vercel si no aparece.
8. Activa Firestore Database.
9. Deja que las colecciones `turnos`, `turnosOcupados` y `userTurnosPendientes` se creen automaticamente al guardar el primer turno.

## App Check

App Check ayuda a que Firestore acepte pedidos hechos desde tu web real y rechace llamadas desde scripts o clientes externos.

1. En Firebase Console, entra a App Check.
2. Selecciona tu app web.
3. Elegi el proveedor reCAPTCHA Enterprise.
4. Crea o selecciona una site key para tu dominio.
5. Agrega tus dominios autorizados en la configuracion de reCAPTCHA Enterprise:
   - Tu dominio de Vercel.
   - El dominio final del cliente, si existe.
6. Copia la site key.
7. Pegala en `firebase-config.js`:

```js
appCheckSiteKey: "TU_RECAPTCHA_ENTERPRISE_SITE_KEY"
```

8. Subi los cambios a GitHub y espera el deploy de Vercel.
9. Proba login, consulta de horarios y reserva de turno.
10. Cuando todo funcione, volve a App Check > Cloud Firestore y activa Enforce.

No actives Enforce antes de desplegar la site key, porque Firestore podria empezar a rechazar los pedidos de la web.

## Confirmaciones por email o WhatsApp

El envio automatico no debe hacerse desde el frontend, porque las credenciales del proveedor quedarian visibles. La carpeta `functions/` contiene Cloud Functions preparadas para:

- Enviar confirmacion cuando se crea un turno pendiente.
- Enviar aviso cuando un turno pasa a estado `cancelado`.
- Usar email con Brevo si configuras `BREVO_API_KEY`.
- Usar WhatsApp con Twilio si configuras las variables de Twilio.

Pasos generales:

1. Instala Firebase CLI e inicia sesion.
2. Entra a `functions/`.
3. Ejecuta `npm install`.
4. Crea variables de entorno tomando como guia `functions/.env.example`.
5. Despliega las funciones con Firebase CLI.

No subas archivos `.env` ni claves privadas a GitHub. El `.gitignore` ya los ignora.

## Administrador

Para que una cuenta pueda ver los turnos completos:

1. Inicia sesion una vez en la web con la cuenta administrativa.
2. En Firebase, entra a Authentication > Users.
3. Copia el UID del usuario administrativo.
4. En Firestore, crea una coleccion llamada `admins`.
5. Dentro de `admins`, crea un documento cuyo ID sea exactamente ese UID.

Ejemplo de ID de documento:

```text
AbC123UidDelUsuarioAdmin
```

6. Agrega este campo:

```text
activo    boolean    true
```

El mail autorizado no queda escrito en el codigo publico. Firebase valida al administrador usando su UID de Authentication y el documento privado en `admins`.

Importante: si antes habias creado un documento con el mail como ID, reemplazalo por uno con el UID. El documento con el mail ya no sirve para autorizar.

## Reglas de Firestore

Estas reglas permiten que usuarios registrados vean solo horarios ocupados, gestionen su propio turno, creen como maximo un turno pendiente, bloqueen sobreturnos y que solo el administrador lea todos los datos.

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function verifiedUser() {
      return signedIn() && request.auth.token.email_verified == true;
    }

    function isAdmin() {
      return verifiedUser()
        && get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.activo == true;
    }

    match /admins/{adminUid} {
      allow get: if verifiedUser() && adminUid == request.auth.uid;
      allow list, create, update, delete: if false;
    }

    match /turnosOcupados/{turnoId} {
      allow read: if verifiedUser();

      allow create: if verifiedUser()
        && turnoId == request.resource.data.fecha + "_" + request.resource.data.horario
        && request.resource.data.keys().hasOnly([
          'fecha',
          'horario',
          'creadoEn'
        ])
        && request.resource.data.fecha is string
        && request.resource.data.horario is string
        && existsAfter(/databases/$(database)/documents/turnos/$(turnoId));

      allow update: if false;

      allow delete: if isAdmin()
        || (
          verifiedUser()
          && getAfter(/databases/$(database)/documents/turnos/$(turnoId)).data.pacienteUid == request.auth.uid
          && getAfter(/databases/$(database)/documents/turnos/$(turnoId)).data.estado == 'cancelado'
        );
    }

    match /userTurnosPendientes/{userUid} {
      allow read: if verifiedUser() && userUid == request.auth.uid;

      allow create: if verifiedUser()
        && userUid == request.auth.uid
        && request.resource.data.keys().hasOnly([
          'turnoId',
          'fecha',
          'horario',
          'pacienteUid',
          'creadoEn'
        ])
        && request.resource.data.pacienteUid == request.auth.uid
        && request.resource.data.turnoId == request.resource.data.fecha + "_" + request.resource.data.horario
        && existsAfter(/databases/$(database)/documents/turnos/$(request.resource.data.turnoId));

      allow update: if false;

      allow delete: if isAdmin()
        || (
          verifiedUser()
          && userUid == request.auth.uid
          && getAfter(/databases/$(database)/documents/turnos/$(resource.data.turnoId)).data.pacienteUid == request.auth.uid
          && getAfter(/databases/$(database)/documents/turnos/$(resource.data.turnoId)).data.estado == 'cancelado'
        );
    }

    match /turnos/{turnoId} {
      allow read: if isAdmin() || (verifiedUser() && resource.data.pacienteUid == request.auth.uid);

      allow create: if verifiedUser()
        && turnoId == request.resource.data.fecha + "_" + request.resource.data.horario
        && request.resource.data.keys().hasOnly([
          'nombre',
          'telefono',
          'fecha',
          'horario',
          'aceptaPrivacidad',
          'pacienteEmail',
          'pacienteUid',
          'estado',
          'creadoEn'
        ])
        && request.resource.data.nombre is string
        && request.resource.data.telefono is string
        && request.resource.data.fecha is string
        && request.resource.data.horario is string
        && request.resource.data.aceptaPrivacidad == true
        && request.resource.data.pacienteEmail == request.auth.token.email
        && request.resource.data.pacienteUid == request.auth.uid
        && request.resource.data.estado == 'pendiente'
        && existsAfter(/databases/$(database)/documents/turnosOcupados/$(turnoId))
        && existsAfter(/databases/$(database)/documents/userTurnosPendientes/$(request.auth.uid));

      allow update: if isAdmin()
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'estado',
          'actualizadoEn'
        ])
        && request.resource.data.estado in ['pendiente', 'atendido', 'cancelado'];

      allow update: if verifiedUser()
        && resource.data.estado == 'cancelado'
        && turnoId == request.resource.data.fecha + "_" + request.resource.data.horario
        && request.resource.data.keys().hasOnly([
          'nombre',
          'telefono',
          'fecha',
          'horario',
          'aceptaPrivacidad',
          'pacienteEmail',
          'pacienteUid',
          'estado',
          'creadoEn'
        ])
        && request.resource.data.nombre is string
        && request.resource.data.telefono is string
        && request.resource.data.fecha is string
        && request.resource.data.horario is string
        && request.resource.data.aceptaPrivacidad == true
        && request.resource.data.pacienteEmail == request.auth.token.email
        && request.resource.data.pacienteUid == request.auth.uid
        && request.resource.data.estado == 'pendiente'
        && existsAfter(/databases/$(database)/documents/turnosOcupados/$(turnoId))
        && existsAfter(/databases/$(database)/documents/userTurnosPendientes/$(request.auth.uid));

      allow update: if verifiedUser()
        && resource.data.pacienteUid == request.auth.uid
        && resource.data.estado == 'pendiente'
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'estado',
          'actualizadoEn'
        ])
        && request.resource.data.estado == 'cancelado'
        && !existsAfter(/databases/$(database)/documents/turnosOcupados/$(turnoId))
        && !existsAfter(/databases/$(database)/documents/userTurnosPendientes/$(request.auth.uid));

      allow delete: if false;
    }
  }
}
```

## Probar localmente

Podes abrir `index.html` en el navegador o usar una extension tipo Live Server de Visual Studio Code.

Cuando lo subas a Firebase Hosting, la pagina va a funcionar como sitio estatico.

## Datos guardados

Cada turno se guarda en Firestore con esta estructura:

```js
{
  nombre: "Ana Perez",
  telefono: "11 2345 6789",
  fecha: "2026-05-15",
  horario: "09:30",
  aceptaPrivacidad: true,
  pacienteEmail: "paciente@gmail.com",
  pacienteUid: "uid-de-firebase-auth",
  estado: "pendiente",
  creadoEn: serverTimestamp()
}
```

La disponibilidad se guarda aparte en `turnosOcupados`, sin nombre ni telefono, para que los usuarios puedan ver horarios no disponibles sin acceder a datos privados.

El limite de un turno pendiente por usuario se guarda en `userTurnosPendientes/{uid}`. Si el paciente cancela su turno, ese marcador se elimina y puede reservar nuevamente.

Los estados posibles del turno son:

- `pendiente`: reservado y pendiente de atencion.
- `atendido`: marcado por administracion cuando el paciente ya fue atendido.
- `cancelado`: cancelado por administracion; el horario vuelve a quedar disponible.

Los pacientes tambien pueden cancelar su propio turno pendiente. Para modificarlo, la web cancela el turno anterior y precarga el formulario para elegir una nueva fecha y horario.

## Privacidad

La web informa que guarda nombre, telefono, email de Google, fecha y horario del turno. Esos datos se usan solo para gestionar reservas y contacto operativo. Los datos completos solo puede verlos una cuenta administrativa autorizada por UID en Firestore.
