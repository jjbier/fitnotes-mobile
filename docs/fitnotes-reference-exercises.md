# Referencia FitNotes — Página de Ejercicios

Fuente: https://www.fitnotesapp.com/exercises/

---

## Lista de ejercicios

- Organizada por **categorías** (grupos musculares) con colores identificativos
- Vista inicial: lista de categorías; al tocar una → ejercicios dentro de esa categoría
- **Categoría "Favorites"** fijada al top de la lista

---

## Búsqueda

- Búsqueda parcial: `"dum press"` encuentra `"Dumbbell Press"`
- Limpiar búsqueda con botón cancelar o botón atrás

---

## Añadir ejercicio (botón +)

Campos del formulario:
- **Nombre**
- **Notas** (tips de forma, equipo necesario, ajustes de máquina)
- **Categoría** — con opción de crear una nueva categoría inline
- **Tipo de ejercicio**
- **Unidad de peso** — por defecto la del setting global, personalizable por ejercicio

Dos acciones al guardar:
- **Guardar** — guarda y vuelve a la lista
- **Guardar y nuevo** — guarda y abre el formulario vacío para crear otro ejercicio

---

## Editar ejercicio (overflow menu)

- Editar: nombre, notas, categoría, tipo de ejercicio
- **Cambio de tipo**: retiene los campos comunes al nuevo tipo; elimina los campos que no existen en el nuevo tipo (ej: cambiar de Weight & Reps a Distance & Time borra el historial de peso)
- **Cambio de unidad**: dos opciones:
  - Conversión matemática (convierte los valores existentes)
  - Sustitución simple (cambia la etiqueta sin convertir los valores)

---

## Eliminar ejercicio

- Elimina permanentemente: historial de entrenamiento, récords personales y objetivos asociados al ejercicio

---

## Favoritos

- Icono de estrella azul en el ejercicio
- Al marcar como favorito, aparece en la categoría **"Favorites"** al top de la lista

---

## Historial del ejercicio (overflow menu)

- Acceso rápido al historial de entrenamiento, gráficas de progreso y datos del ejercicio

---

## Detalles opcionales (configurables)

- **Workout count**: número de veces que se ha entrenado ese ejercicio
- **Last used date**: fecha del último entrenamiento con ese ejercicio

---

## Gestión de categorías

- Crear, editar, eliminar y **reordenar por drag & drop**
- Color personalizable por categoría (se usa también en la vista Calendario para identificar categorías)
- Al crear una categoría se le asigna un color por defecto, modificable
- **Eliminar categoría** → elimina también todos sus ejercicios y todos los datos asociados (historial, PRs, objetivos)
- Orden por defecto: alfabético; soporta orden manual

---

## Tipos de ejercicio

| Tipo | Nota |
|---|---|
| Weight & Reps | Base |
| Distance & Time | Base |
| Weight + Distance | Avanzado |
| Weight + Time | Avanzado |
| Reps + Distance | Avanzado |
| Reps + Time | Avanzado |
| Weight Only | Avanzado |
| Reps Only | Avanzado |
| Distance Only | Avanzado |
| Time Only | Avanzado |

---

## Estado actual vs. FitNotes — gaps identificados

Lo que ya tiene la app:

- ExerciseTypes: `WEIGHT_REPS`, `DISTANCE_TIME`, `REPS_ONLY`, `WEIGHT_ONLY`, `TIME_ONLY`
- Browse + FAB crear ejercicio + categoría inline
- Rutas web: `/exercise`, `/exercise/[id]`
- Mobile: browse + FAB

Pendiente de implementar para paridad con FitNotes:

| Funcionalidad | Estado |
|---|---|
| Búsqueda parcial | Pendiente |
| Favoritos (estrella + categoría Favorites al top) | Pendiente |
| Campo Notas por ejercicio | Pendiente |
| "Guardar y nuevo" al crear ejercicio | Pendiente |
| Detalles opcionales (workout count, last used date) | Pendiente |
| Unidad de peso por ejercicio | Pendiente |
| Colores de categoría | Pendiente |
| Reordenar categorías por drag & drop | Pendiente |
| Tipos adicionales: Weight+Distance, Weight+Time, Reps+Distance, Reps+Time, Distance Only | Pendiente |
