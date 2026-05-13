# Pagina de turnos odontologicos

Proyecto simple en HTML, CSS y JavaScript para reservar turnos de un consultorio odontologico usando Firebase Firestore.

## Archivos

- `index.html`: estructura de la pagina.
- `styles.css`: estilos visuales y responsive.
- `app.js`: logica del formulario y guardado en Firestore.
- `firebase-config.js`: credenciales reales de Firebase.
- `firebase-config.example.js`: ejemplo para conservar como referencia.

## Configurar Firebase

1. Crea un proyecto en Firebase.
2. Crea una app web dentro del proyecto.
3. Copia la configuracion que te entrega Firebase.
4. Reemplaza los valores de `firebase-config.js`.
5. Activa Authentication.
6. En Authentication > Sign-in method, habilita Google.
7. En Authentication > Settings > Authorized domains, agrega el dominio de Vercel si no aparece.
8. Activa Firestore Database.
9. Deja que las colecciones `turnos` y `turnosOcupados` se creen automaticamente al guardar el primer turno.

## Administrador

Para que un mail pueda ver los turnos completos:

1. Inicia sesion una vez en la web con el mail administrativo.
2. En Firestore, crea una coleccion llamada `admins`.
3. Dentro de `admins`, crea un documento cuyo ID sea exactamente el mail administrativo, por ejemplo:

```text
admin@consultorio.com
```

4. Podes agregarle un campo de referencia, por ejemplo:

```text
activo    boolean    true
```

El mail autorizado no queda escrito en el codigo publico. Firebase lo valida desde las reglas usando el documento de la coleccion `admins`.

## Reglas de Firestore

Estas reglas permiten que usuarios registrados vean solo horarios ocupados, creen turnos, bloqueen sobreturnos y que solo el administrador lea los datos completos.

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
        && exists(/databases/$(database)/documents/admins/$(request.auth.token.email));
    }

    match /admins/{adminEmail} {
      allow get: if verifiedUser() && adminEmail == request.auth.token.email;
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

      allow update, delete: if false;
    }

    match /turnos/{turnoId} {
      allow read: if isAdmin();

      allow create: if verifiedUser()
        && turnoId == request.resource.data.fecha + "_" + request.resource.data.horario
        && request.resource.data.keys().hasOnly([
          'nombre',
          'telefono',
          'fecha',
          'horario',
          'pacienteEmail',
          'pacienteUid',
          'estado',
          'creadoEn'
        ])
        && request.resource.data.nombre is string
        && request.resource.data.telefono is string
        && request.resource.data.fecha is string
        && request.resource.data.horario is string
        && request.resource.data.pacienteEmail == request.auth.token.email
        && request.resource.data.pacienteUid == request.auth.uid
        && request.resource.data.estado == 'pendiente'
        && existsAfter(/databases/$(database)/documents/turnosOcupados/$(turnoId));

      allow update, delete: if false;
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
  pacienteEmail: "paciente@gmail.com",
  pacienteUid: "uid-de-firebase-auth",
  estado: "pendiente",
  creadoEn: serverTimestamp()
}
```

La disponibilidad se guarda aparte en `turnosOcupados`, sin nombre ni telefono, para que los usuarios puedan ver horarios no disponibles sin acceder a datos privados.
