# Handoff para el agente que graba — ciclo real de Xarts

**Listo para grabar el resultado.** La reparación se ejecutó con Devin, pasó verificación independiente, se publicó y volvió a renderizarse dentro de Xarts Chat con el paquete instalado. No es una animación ni una elección simulada.

## Enlaces de la toma

- Propuesta real: http://127.0.0.1:4310/?improvements=xarts — primera tarjeta, «Cifras listas para presentar».
- Registro de trabajo: http://127.0.0.1:4310/activity
- Gráfico original guardado: http://127.0.0.1:4320/?run=20260919T102627-d61cdce7
- Mismo gráfico, paquete publicado: http://127.0.0.1:4320/?run=20260920T075057-0aeb1e1a
- Pregunta: **What drove the change in EBITDA from H1 2025 to H1 2026?**

Abrir estos enlaces solo carga evidencia guardada. No llama a Claude ni a Devin. El pill superior describe la versión activa para la próxima petición; las etiquetas del turno guardado identifican la versión histórica de ese gráfico. No presentar el original guardado como si se estuviera renderizando ahora con el paquete nuevo.

## Qué mostrar (inserto de 15–20 s)

1. **Antes, 3 s:** ampliar las etiquetas negativas del waterfall: `€-110.3k`, `€-188.3k`, `€-63.5k`, `€-29k`.
2. **Propuesta y ejecución, 4 s:** mostrar la primera propuesta y el registro de autorización/ejecución real. El botón ya está desactivado porque esa tarea se ejecutó. No fingir un nuevo clic ni volver a lanzar una reparación para recrear la toma. Captura previa al despacho: `.local/real-proposals-before.png` en Promote.
3. **Trabajo y QA, 4 s:** mostrar la sesión registrada y la entrega aceptada. Un corte indica que ha transcurrido tiempo; no afirmar que Devin reparó y publicó en segundos. Hubo un primer bloqueo por un contraejemplo financiero inválido del verificador, corregido antes del segundo intento.
4. **Después, 5 s:** abrir el replay exacto. Ampliar `-€110.3k`, `-€188.3k`, `-€63.5k`, `-€29k`; mostrar la versión Promote y **0 workarounds**.

Voz sugerida: «Detectamos una etiqueta incorrecta en Xarts. Promote encargó la reparación, verificó el paquete y lo entregó al chat. Mismo gráfico. Mismos datos. Signos correctos».

## Prueba que respalda el vídeo

| Elemento | Evidencia |
| --- | --- |
| Proyecto reparado | `miguelsuredasuau/visx-anlak` (Xarts) |
| Base reproducida | `a503e7262d4cb50d2245606718998efa4fddf53b` |
| Sesión Devin | `142c95371b7d400496afbddc487f9b31` |
| Rama | `promote/waterfall-currency-sign` |
| Candidato publicado | `cde20023de2eebe30b89dd5ed2c70f5119efcbfd` |
| Release activo | `xarts-cde20023de2e-55522dc3` |
| Paquete SHA-256 | `dba92b295f0932e75da784bd996356dbe697e3ac688795c2322ef5b90c0a51e2` |
| Hash de datos, antes y replay | `61e2edd07728407aee4bf7fcc7def5bffa304cf4096408badd8dfa65e196601c` |
| Hash SVG, QA y replay del chat | `ceaefa3863987c1f20838dc049a933efdfb07960bfd18cd8aa261e56015c1486` |
| Incidente de entrega aceptado | `xarts-delivery-f5d3e68195cda59d31d40731` |

El replay ejecutó el `chart_render` real del chat: el servidor vuelve a consultar SQL, instala el paquete verificado y comprueba los hashes. Su runner es `promote-exact-replay`, sin llamada a Claude. Es una reproducción determinista real, no una respuesta nueva de un LLM.

También se envió la misma pregunta libre a Claude: turno `20260920T074728-d33f2963`, coste comunicado **$0.2782455**. Usó el release nuevo y terminó renderizando un `revenuebridge`, tras recuperarse de un error de columnas. Sirve como evidencia adicional de adopción; **no usarlo como el mismo waterfall del antes/después**.

## Límites que debe respetar la narración

- Se entregó el arreglo del signo monetario, **no toda la propuesta de numberFormat** ni el resto de las cuatro features.
- El replay conserva avisos de etiquetas abreviadas. No decir «todos los errores de la librería están resueltos» ni ocultarlos como si fueran pruebas verdes.
- Norma no estuvo disponible en Devin; se registró como pendiente. No afirmar que aprobó el código.
- El límite de Devin fue 20 ACU, sin recarga autorizada. Su API comunicó 0 ACU en la observación inicial; no es prueba de coste cero ni una factura. El crédito no se repone automáticamente.
- El paquete está publicado en el registro local que consume este chat. El commit está en la rama de reparación de GitHub; no afirmar que se fusionó en main o se publicó en npm.

Capturas: [antes](images/xarts-before.png), [después](images/xarts-after.png), [propuestas](images/visual-decisions.png). Mantener el vídeo existente intacto hasta integrar y revisar este inserto.
