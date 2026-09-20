// Illustrative feature proposals for the analyzed library; never inserted into the live queue.
export const decisionDemoProject = { id: "xarts", name: "Xarts", kind: "chart-library" };
export const decisionDemos = [
  {
    "id": "xarts-formatting",
    "project": "xarts",
    "title": "Cifras listas para presentar.",
    "question": "¿Damos control del formato numérico en Xarts?",
    "why": "Un waterfall financiero necesita decimales, moneda y signos legibles sin cambiar los valores originales.",
    "recommendation": "Implementar numberFormat por rol: precisión configurable y signos bien colocados en etiquetas, ejes y tooltips.",
    "alternative": "Mantener el formato automático y los ajustes de datos que hoy necesita el consumidor.",
    "benefit": "Presentaciones consistentes sin redondear los datos para arreglar una etiqueta.",
    "boundary": "El formato cambia la presentación, nunca el dato ni la geometría del gráfico.",
    "evidence": "Xarts Chat · docs/FINDINGS.md, F5; docs/INTEGRATION.md, incidente 3. Hallazgo documentado; verificar contra la versión candidata.",
    "validation": "Mismos valores antes y después; casos de moneda, negativos, ceros y decimales en waterfall, ejes y tooltips.",
    "steps": [
      "Dato intacto",
      "Formato por rol",
      "Cifras legibles"
    ],
    "scene": "A beautiful isometric financial chart design exhibit, NOT an office or maintenance workshop. Three stages: transparent raw-data beads in a glass tray; three precision dial controls for decimal precision, currency and negative signs; a clean upright waterfall chart panel with cobalt positive bars, orange negative bars, turquoise total, spacious blank label plaques aligned neatly next to each bar. Clearly show chart typography formatting as the subject. No readable numbers or letters."
  },
  {
    "id": "xarts-layout",
    "project": "xarts",
    "title": "Cada etiqueta encuentra su espacio.",
    "question": "¿Añadimos un layout adaptable a los gráficos?",
    "why": "Títulos largos, leyendas y etiquetas compiten por el mismo espacio. El informe del chat documenta recortes y solapes en las demos.",
    "recommendation": "Explorar márgenes medidos y ajuste de línea para adaptar etiquetas a varios tamaños, manteniendo un tamaño de texto legible.",
    "alternative": "Corregir cada plantilla afectada con márgenes específicos, sin crear una política adaptable común.",
    "benefit": "El mismo gráfico se entiende en el chat, en una tarjeta estrecha y en una presentación.",
    "boundary": "No ocultar etiquetas ni reducir el texto silenciosamente. Si no cabe, explicar qué necesita más espacio.",
    "evidence": "Xarts Chat · docs/FINDINGS.md, F6: informe histórico de 27 formas con recortes y 24 con solapes. No es una medición nueva.",
    "validation": "Repetir npm run quality y probar textos largos en varios tamaños. Comparar recortes y solapes con la misma batería.",
    "steps": [
      "Medir texto",
      "Ajustar espacio",
      "Leer completo"
    ],
    "scene": "An isometric chart responsive-layout infographic, NOT an office. Three chart panels on a pale terrazzo platform: at left a small frame with cobalt bars and abstract blank label strips visibly colliding and extending outside an orange boundary; center a precision measuring ruler and expanding turquoise margins around a bar-chart frame; right a wide and a narrow chart panel both with generous neat blank label strips entirely inside their frames. Use arrows to show layout adaptation. No readable text or numeric values."
  },
  {
    "id": "xarts-accessibility",
    "project": "xarts",
    "title": "La marca se reconoce. El gráfico se lee.",
    "question": "¿Ofrecemos temas accesibles para Xarts?",
    "why": "El roadmap distingue entre separar los colores de las series y conseguir suficiente contraste en el texto. Son problemas diferentes.",
    "recommendation": "Diseñar variantes de tema con texto de mayor contraste y señales adicionales, como patrones o marcadores, cuando el color no baste.",
    "alternative": "Mantener la paleta actual y documentar sus límites de uso.",
    "benefit": "Gráficos más legibles para más personas, conservando una identidad visual reconocible.",
    "boundary": "Cualquier cambio de paleta necesita revisión visual. No declarar accesibilidad completa solo por superar una prueba de contraste.",
    "evidence": "Xarts · docs/ROADMAP.md, revisa-paleta; docs/VENDIBLE-CHECKLIST.md, contraste de texto. Deuda documentada, pendiente de revalidación.",
    "validation": "Medir contraste, simular deficiencias de visión del color y revisar los gráficos representativos de cada tema.",
    "steps": [
      "Identidad visual",
      "Contraste y patrones",
      "Lectura clara"
    ],
    "scene": "An isometric accessible chart theme design exhibit, NOT an office. Three connected stations: beautiful cobalt turquoise orange material swatches; a magnifying glass over a high-contrast charcoal label strip against ivory and tactile striped, dotted and solid series samples; a polished grouped-bar chart and line-chart display using both distinct colors and dot square triangle markers, blank dark label plaques. Communicate readable chart themes beyond color alone. No text or numeric values."
  },
  {
    "id": "xarts-preflight",
    "project": "xarts",
    "title": "Detectar el error antes de dibujarlo.",
    "question": "¿Añadimos una validación previa para agentes?",
    "why": "Xarts ya describe gráficos con --describe. Su roadmap plantea comprobar la especificación sin tener que renderizar y conectar mejor ese contrato con agentes.",
    "recommendation": "Explorar un modo --check que valide roles y opciones y devuelva errores estructurados con sugerencias de corrección.",
    "alternative": "Seguir combinando --describe con los errores que aparecen durante el render.",
    "benefit": "Menos intentos fallidos al construir gráficos desde el chat o una integración.",
    "boundary": "Reutilizar las reglas reales del render. Superar --check no demuestra que el resultado visual sea correcto.",
    "evidence": "Xarts · docs/ROADMAP.md, W2: --check, espejo MCP de --describe y comprobación columns ↔ roles. render-cli/cli.ts ya expone --describe.",
    "validation": "Specs válidos e inválidos con roles y estilos conocidos; comprobar que la validación no escribe imágenes y coincide con el contrato del render.",
    "steps": [
      "Spec del gráfico",
      "Validar contrato",
      "Render preparado"
    ],
    "scene": "An isometric chart specification preflight infographic, NOT a deployment pipeline. Three linked objects: a translucent structured-data sheet with abstract bracket-shaped geometry and one orange mismatched field; a compact glass inspection lens aligning geometric field tokens into matching sockets; a pristine cobalt and turquoise chart panel with bars and a line, ready for rendering. Show a small return arrow from the inspection lens to the incorrect field. No letters, code text or numbers."
  }
];
