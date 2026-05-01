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
5. Activa Firestore Database.
6. Crea una coleccion llamada `turnos` o deja que se cree automaticamente al guardar el primer turno.

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
  estado: "pendiente",
  creadoEn: serverTimestamp()
}
```
