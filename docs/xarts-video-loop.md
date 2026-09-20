# Un antes/después real para el vídeo

## La toma (15–20 segundos montados)

1. **Xarts Chat, antes:** un gráfico con una etiqueta recortada. La pregunta, los datos, el spec y el tamaño quedan guardados.
2. **Promote:** una propuesta real para corregir ese caso. Mostrar su alcance y la acción autorizada.
3. **Trabajo y verificación:** actividad real del agente y resultado de QA. Cortar la espera con una indicación del tiempo transcurrido; no presentar el proceso como instantáneo.
4. **Entrega:** identificar la versión aceptada que consume el chat.
5. **Xarts Chat, después:** repetir exactamente el caso, con la etiqueta completa y los mismos números.

Grabar este inserto por separado e incorporarlo solo cuando el ciclo se haya completado. La demo visual de propuestas no demuestra ejecución: sus botones son locales y no autorizan reparaciones.

## Elegir el caso

La mejor candidata visual es una etiqueta cortada en **una sola forma**. `xarts-chat/docs/FINDINGS.md`, F6, documenta recortes y solapes históricos. Reproducir el fallo en la versión activa antes de elegir alluvial u otra forma: el informe no demuestra que siga fallando hoy. Conservar la captura y el resultado del check.

No usar como alcance toda la propuesta de layout adaptable: esa es una decisión de feature mucho más amplia. Para el vídeo basta un defecto reproducible con una corrección localizada. Formato de moneda/signo en waterfall (F5) es una alternativa si el recorte no se reproduce de forma estable.

## Qué debe estar probado antes de rodar

- Una propuesta real ligada al repositorio y revisión de Xarts, no a la demo ni a Promote.
- Una acción de ejecución inequívoca: las aprobaciones actuales del escritorio solo encargan planificación. No basta con cambiar el texto del botón.
- Mandato y tarea acotados, techo de gasto aplicado en el proveedor y registro de uso. Reutilizar las autorizaciones vigentes solo si cubren ese alcance; comprobarlas contra el estado actual.
- Candidato con cambios revisables; pruebas del defecto y regresiones sobre el commit exacto. No actualizar snapshots para esconder fallos.
- Paquete y release aceptados, hash verificado, registro publicado y chat consumiendo esa versión. Mostrar el identificador de versión antes y después.
- Replay del mismo caso y comparación de números, geometría y legibilidad. Conservar una versión anterior utilizable si hay regresión.

Inspección local del 20 de septiembre de 2026: la API identificaba el proyecto como `xarts` y el proveedor como `task_authorization_pending`; el contrato del escritorio exponía `approve_plan`, no ejecución. Eso no confirma por sí solo el estado del mandato ni que el registro de releases esté vacío. Revalidar toda la cadena antes del ensayo.

## Regla de entrada al vídeo

El clip entra cuando hay evidencia completa del antes, ejecución, validación, entrega y replay correcto. Si falta la entrega o el replay, mostrar únicamente la capacidad que sí se ha demostrado, sin simular que el bucle está cerrado. El vídeo existente no depende de este ensayo.
