# Propuestas reales de Xarts

Abre http://127.0.0.1:4310/?improvements=xarts o el escritorio del propietario en la oficina en vivo. La antigua URL `?demo=decisions` también abre la vista real.

Las cuatro propuestas pertenecen a la librería Xarts: formato numérico, layout adaptable de etiquetas, temas accesibles y validación previa. Se registran en SQLite con fuentes documentales, revisión y hashes; no son mejoras de Promote ni elecciones simuladas.

`Encargar planificación` guarda un encargo real de planificación. `Ejecutar reparación` despacha una tarea real a Devin únicamente cuando una configuración del servidor liga la revisión de esa propuesta a alcance, repositorio, commit base, reproducción, pruebas, mandato y techo de ACU. No se infiere autorización de una aprobación antigua. Sin esa preparación, el botón de ejecución queda desactivado y explica qué falta.

El primer ensayo autorizado implementa solo una parte de la propuesta de formato: corregir el signo negativo antes del prefijo monetario de waterfall. No implementa aún numberFormat global ni precisión configurable. El límite de esta reparación es 20 ACU.

El candidato vuelve por una rama, pasa comprobación de identidad y alcance, compilación aislada y pruebas de consumidor. El replay usa el SQL original y verifica su hash; para esta reparación exige etiquetas monetarias negativas correctas. Solo entonces se activa el paquete en el registro. Que haya un candidato o una imagen bonita no demuestra entrega ni adopción en el chat.

## Operación

```sh
node --import tsx scripts/register-improvements.ts /ruta/a/xarts /ruta/a/xarts-chat
```

Registrar nuevas fuentes produce evidencia versionada. `.local/improvement-executions.json` contiene las tareas y autorizaciones concretas; nunca credenciales. Los endpoints de escritura exigen sesión de propietario y origen local. Los clics repetidos reutilizan la reserva y no crean sesiones adicionales.

Las imágenes son ilustraciones de la propuesta, no resultados. Se generaron con fal `openai/gpt-image-2.5/flare/edit`, compartiendo `studio/brand-profile.mjs` con la oficina. Cuatro imágenes de Xarts sustituyen a las cuatro iniciales de Promote. Coste de generación no comunicado por el proveedor; no se presenta como cero. La visualización no genera imágenes ni incurre en llamadas pagadas por sí sola.

[Preparación del vídeo y criterios de evidencia](xarts-video-loop.md).
