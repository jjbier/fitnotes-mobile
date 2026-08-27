# FitNotes — Referencia: Routines

Fuente: https://www.fitnotesapp.com/routines/

## Estructura

Una rutina se compone de múltiples **Days** (también llamados Sections). Cada Day contiene una selección de ejercicios.

```
Routine
└── Day / Section  (ej. "Día A", "Push", "Full Body")
    ├── Exercise 1  [+ Predefined Sets]
    ├── Exercise 2  [+ Predefined Sets]
    └── ...
```

## Predefined Sets

La característica más potente de las rutinas. Permite preconfigurar las series de cada ejercicio dentro del Day:

- Los campos pueden tener **valores concretos** (ej. calentamiento: 20kg × 10 reps)
- O dejarse **vacíos** para que copien automáticamente el valor del último entrenamiento registrado
- Ejemplo típico: 1 serie de calentamiento con peso fijo + 3 series de trabajo que adoptan el peso anterior

## Características

| Característica | Descripción |
|---|---|
| **Log All** | Botón que añade todos los ejercicios de un Day al workout actual de golpe |
| **Predefined Sets** | Series preconfiguradas por ejercicio con valores o vacías (copia historial) |
| **Supersets** | Agrupar ejercicios dentro de un Day para ejecutarlos en circuito |
| **Copiar rutina** | Duplicar una rutina existente |
| **Reordenar** | Ejercicios y Days arrastrables para cambiar el orden |
| **Modo edición** | Modificar Days, ejercicios, reordenar y eliminar elementos |

## Flujo de uso

1. **Crear rutina**: nombre + notas opcionales
2. **Añadir Days**: uno por día de entrenamiento o grupo muscular
3. **Añadir ejercicios** a cada Day (con Predefined Sets opcionales)
4. **Ejecutar**: desde "Start New Workout" → seleccionar rutina → seleccionar Day
5. Los Predefined Sets se cargan automáticamente en el workout
6. El usuario puede editar valores antes de guardar o durante el entrenamiento

## Estado en nuestra app

Última auditoría: 2026-06-23

### Implementado ✅
- **Crear rutina** — modal con nombre + notas, guarda en DB y store
- **Eliminar rutina** — long press → Alert confirmación → borra en DB y store
- **Crear Days** — input inline en modo edición con nombre y `order_index`
- **Eliminar Days** — botón papelera en el header del Day (solo en modo edición)
- **Añadir ejercicios a un Day** — picker con chips de ejercicios
- **Eliminar ejercicios de un Day** — botón `close-circle` por ejercicio (modo edición)
- **Log routine day → workout real** — `handleLogDay` crea el workout, añade ejercicios del Day en orden y aplica predefined sets si existen
- **Log All** — botón "Registrar" en el header de cada Day añade todos los ejercicios al workout de golpe
- **Predefined Sets** — UI completa: tap en icono `≡` de un ejercicio → modal con filas editables por tipo; campos vacíos copian del historial; `savePredefinedSets` persiste en DB; vista inline debajo del ejercicio cuando hay series configuradas
- **Reordenar Days** — `NestableDraggableFlatList`; handle `≡` en el header del Day visible en modo Editar; long press para arrastrar; persiste `order_index` en DB con revert en error
- **Reordenar ejercicios dentro de un Day** — `NestableDraggableFlatList` anidado; handle `≡` junto al nombre del ejercicio en modo Editar

### Implementado ✅ (completo)
- **Supersets** — icono `🔗` en modo Editar por ejercicio; tap en gris agrupa con el siguiente (crea `group_id` compartido, se une al grupo del siguiente si ya existe); tap en morado disuelve el superset completo; barra morada izquierda visible en modo lectura
- **Copiar rutina** — long press en la lista → Alert con opciones Copiar/Eliminar; modal con nombre pre-rellenado "Copia de …"; copia days, ejercicios y predefined sets completos vía `routineRepo.copyRoutine`

### No implementado ❌
— Ninguno. Todas las características de la referencia están implementadas.
